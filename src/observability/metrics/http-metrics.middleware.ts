import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { isInfrastructureRoute } from '../../constant/infrastructure-route.constant';
import { readRoutePattern } from '../route-pattern.util';

import type { MetricsModuleOptions } from './metrics-module-options.interface';
import { DEFAULT_IGNORED_METRICS_ROUTES, METRICS_MODULE_OPTIONS } from './metrics.constant';
import { MetricsService } from './metrics.service';

const NANOSECONDS_PER_SECOND = 1e9;

/**
 * Counts and times every request Nest routes.
 *
 * Recording happens on the response's own `finish` event, by which point Express has populated
 * the matched route and the final status code. The `route` label is the route **pattern** — see
 * `readRoutePattern` for why that distinction is what keeps the metric affordable.
 *
 * **What it does not see: a request that matched no route at all.** Nest's middleware runs
 * inside its own routing layer, so a path nothing is registered for is 404'd without ever
 * reaching here — verified against Nest 11 on Express 5, with both `forRoutes('*')` and an
 * explicit wildcard. An earlier version of this comment claimed the opposite and used it to
 * justify middleware over an interceptor; the justification was wrong, though the choice still
 * stands, because middleware is the only place that sees a request whose handler threw before
 * an interceptor's response path ran. A service with a catch-all route (Conduit has one under
 * `/api`) does count its own 404s, under that route's pattern.
 *
 * **The path is read from `originalUrl`, never from `request.path`.** Nest mounts middleware
 * per matched route, so Express sets `baseUrl` to the mount path and leaves `request.path` as
 * `/` — which silently defeated the ignored-route check, and the symptom was the scrape
 * endpoint counting its own scrapes.
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
        if (isInfrastructureRoute(HttpMetricsMiddleware.readPath(request), this.ignoredRoutes)) {
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

    /**
     * The request path, without the query string.
     *
     * `request.originalUrl` rather than `request.path`: Nest mounts middleware per matched
     * route, so Express reports `path` as `/` and puts the real path in `baseUrl`. Reading
     * `path` here matched nothing in the ignore list and the scrape endpoint counted itself.
     */
    private static readPath(request: Request): string {
        const [path] = (request.originalUrl || request.url).split('?');

        return path ?? '/';
    }
}
