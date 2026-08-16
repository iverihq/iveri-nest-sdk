import type { NextFunction, Request, Response } from 'express';

import { HttpMetricsMiddleware } from './http-metrics.middleware';
import type { HttpRequestObservation, MetricsService } from './metrics.service';

/** A response that records its listeners so a spec can fire `finish` or `close` by hand. */
const stubResponse = (statusCode = 200): Response & { emit: (event: string) => void } => {
    const listeners = new Map<string, () => void>();

    return {
        statusCode,
        once: (event: string, listener: () => void): unknown => {
            listeners.set(event, listener);

            return undefined;
        },
        emit: (event: string): void => listeners.get(event)?.(),
    } as unknown as Response & { emit: (event: string) => void };
};

const stubRequest = (overrides: Partial<Request> & { originalUrl?: string } = {}): Request => {
    const path = overrides.originalUrl ?? '/api/v1/captures';

    // `path` is deliberately left as `/` — that is what Nest's per-route mounting produces, and
    // a stub that set it honestly would hide the bug this file now pins.
    return { method: 'GET', path: '/', baseUrl: '', originalUrl: path, ...overrides } as unknown as Request;
};

const build = (
    ignoredRoutes?: readonly string[],
): { middleware: HttpMetricsMiddleware; observed: HttpRequestObservation[]; inFlight: () => number } => {
    const observed: HttpRequestObservation[] = [];
    let inFlight = 0;

    const metricsService = {
        observeHttpRequest: (observation: HttpRequestObservation): void => {
            observed.push(observation);
        },
        trackRequestStarted: (): void => void (inFlight += 1),
        trackRequestFinished: (): void => void (inFlight -= 1),
    } as unknown as MetricsService;

    return {
        middleware: new HttpMetricsMiddleware({ serviceName: 'conduit-api', ignoredRoutes }, metricsService),
        observed,
        inFlight: () => inFlight,
    };
};

const next: NextFunction = (): void => undefined;

describe('HttpMetricsMiddleware', () => {
    describe('what it records', () => {
        it('records the method, route pattern and status', () => {
            const { middleware, observed } = build();
            const request = stubRequest({
                method: 'POST',
                originalUrl: '/api/v1/dispatches',
                route: { path: '/api/v1/dispatches' },
            });
            const response = stubResponse(202);

            middleware.use(request, response, next);
            response.emit('finish');

            expect(observed[0]).toMatchObject({ method: 'POST', route: '/api/v1/dispatches', statusCode: 202 });
        });

        it('buckets a request with no matched route rather than labelling it', () => {
            const { middleware, observed } = build();
            const response = stubResponse(404);

            // Nest 404s a genuinely unregistered path before middleware runs, so this arises
            // from a catch-all route or a non-Express adapter rather than from a scanner. The
            // bucket still matters: the label must never become an attacker-chosen path.
            middleware.use(stubRequest({ originalUrl: '/wp-admin/setup-config.php' }), response, next);
            response.emit('finish');

            expect(observed[0]).toMatchObject({ route: 'unmatched', statusCode: 404 });
        });

        it('reads the path from originalUrl, since Nest leaves request.path as /', () => {
            const { middleware, observed } = build();
            const response = stubResponse();

            // Nest mounts middleware per matched route, so Express reports `path` as `/` and
            // puts the real path in `baseUrl`. Reading `path` defeated the ignore list entirely
            // and the scrape endpoint counted its own scrapes.
            middleware.use(stubRequest({ originalUrl: '/metrics?debug=1' }), response, next);
            response.emit('finish');

            expect(observed).toHaveLength(0);
        });

        it('measures a duration in seconds', () => {
            const { middleware, observed } = build();
            const response = stubResponse();

            middleware.use(stubRequest(), response, next);
            response.emit('finish');

            expect(observed[0].durationSeconds).toBeGreaterThanOrEqual(0);
            expect(observed[0].durationSeconds).toBeLessThan(1);
        });
    });

    describe('when the request ends', () => {
        it('records once when both finish and close fire', () => {
            const { middleware, observed } = build();
            const response = stubResponse();

            middleware.use(stubRequest(), response, next);
            response.emit('finish');
            response.emit('close');

            expect(observed).toHaveLength(1);
        });

        it('records a request the client abandoned before it finished', () => {
            const { middleware, observed } = build();
            const response = stubResponse(499);

            middleware.use(stubRequest(), response, next);
            // Only `close` fires when a caller hangs up. A provider timing out on us is exactly
            // the event that must not be missing from the request rate.
            response.emit('close');

            expect(observed).toHaveLength(1);
            expect(observed[0].statusCode).toBe(499);
        });
    });

    describe('in-flight tracking', () => {
        it('returns to zero once the response ends', () => {
            const { middleware, inFlight } = build();
            const response = stubResponse();

            middleware.use(stubRequest(), response, next);
            expect(inFlight()).toBe(1);

            response.emit('finish');
            expect(inFlight()).toBe(0);
        });

        it('decrements once when both finish and close fire', () => {
            // A double decrement would drive the gauge negative and never recover, which reads
            // as an idle service under load.
            const { middleware, inFlight } = build();
            const response = stubResponse();

            middleware.use(stubRequest(), response, next);
            response.emit('finish');
            response.emit('close');

            expect(inFlight()).toBe(0);
        });

        it('does not count an ignored route', () => {
            const { middleware, inFlight } = build();

            middleware.use(stubRequest({ originalUrl: '/metrics' }), stubResponse(), next);

            expect(inFlight()).toBe(0);
        });
    });

    describe('ignored routes', () => {
        it('skips the probe and scrape routes by default', () => {
            const { middleware, observed } = build();

            for (const path of ['/metrics', '/health/live', '/health/ready']) {
                const response = stubResponse();
                middleware.use(stubRequest({ originalUrl: path }), response, next);
                response.emit('finish');
            }

            // Infrastructure calls these on a fixed schedule, so counting them measures the
            // monitoring rather than the service.
            expect(observed).toHaveLength(0);
        });

        it('does not skip a route that merely starts with an ignored one', () => {
            const { middleware, observed } = build();
            const response = stubResponse();

            middleware.use(stubRequest({ originalUrl: '/metricsphere' }), response, next);
            response.emit('finish');

            expect(observed).toHaveLength(1);
        });

        it('takes an explicit ignore list', () => {
            const { middleware, observed } = build(['/internal']);
            const response = stubResponse();

            middleware.use(stubRequest({ originalUrl: '/internal/debug' }), response, next);
            response.emit('finish');

            expect(observed).toHaveLength(0);
        });

        it('calls next for an ignored route', () => {
            const { middleware } = build();
            let called = false;

            middleware.use(stubRequest({ originalUrl: '/metrics' }), stubResponse(), () => {
                called = true;
            });

            // Skipping the measurement must never skip the request.
            expect(called).toBe(true);
        });
    });
});
