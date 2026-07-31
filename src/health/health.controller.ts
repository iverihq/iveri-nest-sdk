import { Controller, Get, HttpCode, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';

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
 */
@Controller('health')
export class HealthController {
    constructor(@Inject(READINESS_CHECKS) private readonly checks: ReadinessCheck[]) {}

    @Get()
    @HttpCode(HttpStatus.OK)
    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    @Get('ready')
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
