import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { isInfrastructureRoute } from '../../constant/infrastructure-route.constant';
import { readRoutePattern } from '../route-pattern.util';

import type { MetricsModuleOptions } from './metrics-module-options.interface';
import { DEFAULT_IGNORED_METRICS_ROUTES, METRICS_MODULE_OPTIONS } from './metrics.constant';
import { MetricsService } from './metrics.service';

const NANOSECONDS_PER_SECOND = 1e9;

/**
 * Counts and times every request.
 *
 * **Middleware rather than an interceptor, and the difference is not stylistic.** An
 * interceptor only runs for requests that matched a route, so a flood of 404s — a scanner, a
 * provider posting to an ingress URL that was rotated, a frontend built against a path that no
 * longer exists — would leave no trace at all in the request rate. Middleware sees everything,
 * and the recording happens on the response's own `finish` event, by which point Express has
 * populated the matched route and the final status code.
 *
 * The `route` label is the route **pattern** — see `readRoutePattern` for why that distinction
 * is what keeps the metric affordable.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
    private readonly ignoredRoutes: readonly string[];

    constructor(
        @Inject(METRICS_MODULE_OPTIONS) options: MetricsModuleOptions,
        private readonly metricsService: MetricsService,
    ) {
        this.ignoredRoutes = options.ignoredRoutes ?? DEFAULT_IGNORED_METRICS_ROUTES;
    }

    use(request: Request, response: Response, next: NextFunction): void {
        if (isInfrastructureRoute(request.path, this.ignoredRoutes)) {
            next();

            return;
        }

        const startedAt = process.hrtime.bigint();
        let recorded = false;

        this.metricsService.trackRequestStarted();

        const record = (): void => {
            // `finish` and `close` both fire on a normal response, in that order. Recording once
            // is what makes the pair safe to listen to — and listening to both is deliberate: a
            // client that hangs up mid-response emits only `close`, and a provider timing out on
            // us is precisely the event that must not be silently dropped from the request rate.
            if (recorded) {
                return;
            }

            recorded = true;

            this.metricsService.trackRequestFinished();
            this.metricsService.observeHttpRequest({
                method: request.method,
                route: readRoutePattern(request),
                statusCode: response.statusCode,
                durationSeconds: Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND,
            });
        };

        response.once('finish', record);
        response.once('close', record);

        next();
    }
}
