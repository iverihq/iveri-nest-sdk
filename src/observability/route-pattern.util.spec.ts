import type { Request } from 'express';

import { UNMATCHED_ROUTE_LABEL, readRoutePattern } from './route-pattern.util';

const stubRequest = (overrides: Partial<Request> = {}): Request =>
    ({ method: 'GET', path: '/api/v1/captures', baseUrl: '', ...overrides }) as unknown as Request;

describe('readRoutePattern', () => {
    it('returns the pattern rather than the resolved URL', () => {
        const request = stubRequest({
            path: '/api/v1/captures/6f1c1a5e-0b6a-4c6e-9d1f-4a2b7c8d9e01',
            route: { path: '/api/v1/captures/:captureId' },
        } as Partial<Request>);

        // The URL would mint a permanent time series per capture id, and for conduit-api's
        // ingress route it would also carry the endpoint's credential off the machine.
        expect(readRoutePattern(request)).toBe('/api/v1/captures/:captureId');
    });

    it('prefixes the pattern with the router mount point', () => {
        const request = stubRequest({ baseUrl: '/api/v1', route: { path: '/captures' } } as Partial<Request>);

        expect(readRoutePattern(request)).toBe('/api/v1/captures');
    });

    it('buckets an unmatched request rather than reporting the path', () => {
        // The path of a 404 is chosen entirely by whoever sent it.
        expect(readRoutePattern(stubRequest({ path: '/wp-admin/setup-config.php' }))).toBe(UNMATCHED_ROUTE_LABEL);
    });

    it('buckets a regular-expression route rather than using its source', () => {
        const request = stubRequest({ route: { path: /^\/legacy\/(.*)$/u } });

        expect(readRoutePattern(request)).toBe(UNMATCHED_ROUTE_LABEL);
    });

    it('joins an array of paths into one stable value', () => {
        const request = stubRequest({ route: { path: ['/a', '/b'] } });

        expect(readRoutePattern(request)).toBe('/a|/b');
    });

    it('buckets a route object whose path is missing', () => {
        const request = stubRequest({ route: {} });

        expect(readRoutePattern(request)).toBe(UNMATCHED_ROUTE_LABEL);
    });
});
