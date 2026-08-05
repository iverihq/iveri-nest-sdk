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
import { READINESS_CHECKS, type ReadinessCheck } from './readiness-check.interface';

/** Per-dependency outcome reported by `GET /health/ready`. */
interface ReadinessResult {
    name: string;
    status: 'up' | 'down';
    error?: string;
}

interface ReadinessResponse {
    status: 'ready' | 'not_ready';
    checks: ReadinessResult[];
}

/**
 * Liveness and readiness endpoints.
 *
 * The distinction matters to the load balancer: **liveness** answers "is this process
 * running" and must never touch a dependency — a database blip that fails liveness gets the
 * container killed and restarted, turning a recoverable outage into a crash loop.
 * **Readiness** answers "can it serve traffic right now" and is where dependencies belong;
 * failing it takes the instance out of rotation and puts it back when the dependency returns.
 *
 * Both are deliberately unauthenticated — the load balancer has no credentials — so they
 * report status and nothing about configuration or versions.
 *
 * The controller is **version-neutral**: under URI versioning it stays on `/health`, never
 * `/v1/health`. A probe URL must not move when the API contract version does, or shipping v2
 * silently fails every health check that was configured against v1.
 */
@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
    constructor(@Inject(READINESS_CHECKS) private readonly checks: ReadinessCheck[]) {}

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Liveness probe',
        description: 'Returns 200 when the process is running. Never touches dependencies.',
    })
    @ApiOkResponse({ description: 'Process is alive.', type: LivenessResponseDto })
    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    @Get('ready')
    @ApiOperation({
        summary: 'Readiness probe',
        description:
            'Returns 200 when every registered dependency check is up. A failed check returns 503 so the instance leaves rotation.',
    })
    @ApiOkResponse({ description: 'Ready to serve traffic.', type: ReadinessResponseDto })
    @ApiServiceUnavailableResponse({
        description: 'One or more dependency checks are down.',
        type: ReadinessResponseDto,
    })
    async ready(): Promise<ReadinessResponse> {
        const results = await Promise.all(this.checks.map((check) => this.run(check)));
        const response: ReadinessResponse = {
            status: results.every((result) => result.status === 'up') ? 'ready' : 'not_ready',
            checks: results,
        };

        if (response.status === 'not_ready') {
            // Thrown rather than returned: a 200 with `not_ready` in the body is invisible to
            // every load balancer, which reads the status code and nothing else.
            throw new ServiceUnavailableException(response);
        }

        return response;
    }

    private async run(check: ReadinessCheck): Promise<ReadinessResult> {
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
}
