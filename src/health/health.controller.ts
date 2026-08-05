import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Inject,
    ServiceUnavailableException,
    VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';

import { LivenessResponseDto } from './dto/liveness-response.dto';
import { ReadinessResponseDto } from './dto/readiness-response.dto';
import { StartupResponseDto } from './dto/startup-response.dto';
import { READINESS_CHECKS, STARTUP_CHECKS, type HealthCheck } from './health-check.interface';
import { HEALTH_ROUTE_PATH } from './health.constant';

/** Per-dependency outcome reported by the readiness and startup probes. */
interface HealthCheckResult {
    name: string;
    status: 'up' | 'down';
    error?: string;
}

interface ReadinessResponse {
    status: 'ready' | 'not_ready';
    checks: HealthCheckResult[];
}

interface StartupResponse {
    status: 'started' | 'starting';
    checks: HealthCheckResult[];
}

/**
 * The three orchestrator probes, each answering a different question with a different
 * consequence for getting it wrong.
 *
 * - **`GET /health/live`** — "is this process running". It must never touch a dependency,
 *   because a failed liveness probe gets the container killed: a database blip that fails
 *   liveness turns a recoverable outage into a fleet-wide crash loop.
 * - **`GET /health/ready`** — "can it serve traffic right now". This is where dependencies
 *   belong. Failing it takes the instance out of rotation and puts it back when the dependency
 *   returns, which is the recoverable remedy.
 * - **`GET /health/startup`** — "has it finished booting". It guards the boot window so a slow
 *   start is not mistaken for a hang, and it **latches**: once every startup check has passed
 *   once, it keeps answering 200. That is deliberate, and it is what stops this from being a
 *   second readiness probe wired to the wrong remedy — after boot, a dependency failure should
 *   drain traffic, not restart the container.
 *
 * There is **no bare `GET /health`**. It was ambiguous about which of the three questions it
 * answered, so whoever wired a probe to it got whichever semantics the service happened to
 * implement — and the two plausible readings have opposite failure actions.
 *
 * All three are unauthenticated — the load balancer holds no credentials — so they report
 * status and nothing about configuration or versions.
 *
 * The controller is **version-neutral**: under URI versioning it stays on `/health/*`, never
 * `/v1/health/*`. A probe URL must not move when the API contract version does, or shipping v2
 * silently fails every probe configured against v1.
 */
@ApiTags('Health')
@Public()
@Controller({ path: HEALTH_ROUTE_PATH, version: VERSION_NEUTRAL })
export class HealthController {
    /**
     * Whether every startup check has passed at least once.
     *
     * Instance state on a singleton controller, which is the right lifetime: it describes this
     * process's boot, and a restart is exactly the event that should reset it.
     */
    private started = false;

    /** Results of the run that latched {@link started}, replayed on later calls. */
    private startupResults: HealthCheckResult[] = [];

    constructor(
        @Inject(READINESS_CHECKS) private readonly readinessChecks: HealthCheck[],
        @Inject(STARTUP_CHECKS) private readonly startupChecks: HealthCheck[],
    ) {}

    @Get('live')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Liveness probe',
        description: 'Returns 200 while the process is running. Never touches a dependency.',
    })
    @ApiOkResponse({ description: 'Process is alive.', type: LivenessResponseDto })
    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    @Get('ready')
    @ApiOperation({
        summary: 'Readiness probe',
        description:
            'Returns 200 when every registered readiness check is up. A failed check returns 503 so the instance leaves rotation.',
    })
    @ApiOkResponse({ description: 'Ready to serve traffic.', type: ReadinessResponseDto })
    @ApiServiceUnavailableResponse({
        description: 'One or more readiness checks are down.',
        type: ReadinessResponseDto,
    })
    async ready(): Promise<ReadinessResponse> {
        const checks = await this.run(this.readinessChecks);
        const response: ReadinessResponse = {
            status: HealthController.allUp(checks) ? 'ready' : 'not_ready',
            checks,
        };

        if (response.status === 'not_ready') {
            // Thrown rather than returned: a 200 with `not_ready` in the body is invisible to
            // every load balancer, which reads the status code and nothing else.
            throw new ServiceUnavailableException(response);
        }

        return response;
    }

    @Get('startup')
    @ApiOperation({
        summary: 'Startup probe',
        description:
            'Returns 200 once every registered startup check has passed, and keeps returning 200 thereafter. Returns 503 while the process is still booting.',
    })
    @ApiOkResponse({ description: 'Boot is complete.', type: StartupResponseDto })
    @ApiServiceUnavailableResponse({ description: 'Still booting.', type: StartupResponseDto })
    async startup(): Promise<StartupResponse> {
        if (this.started) {
            return { status: 'started', checks: this.startupResults };
        }

        const checks = await this.run(this.startupChecks);

        if (!HealthController.allUp(checks)) {
            throw new ServiceUnavailableException({ status: 'starting', checks } satisfies StartupResponse);
        }

        this.started = true;
        this.startupResults = checks;

        return { status: 'started', checks };
    }

    private run(checks: HealthCheck[]): Promise<HealthCheckResult[]> {
        return Promise.all(checks.map((check) => this.runOne(check)));
    }

    private async runOne(check: HealthCheck): Promise<HealthCheckResult> {
        try {
            await check.check();

            return { name: check.name, status: 'up' };
        } catch (error: unknown) {
            return {
                name: check.name,
                status: 'down',
                error: error instanceof Error ? error.message : 'unknown failure',
            };
        }
    }

    private static allUp(checks: HealthCheckResult[]): boolean {
        return checks.every((result) => result.status === 'up');
    }
}
