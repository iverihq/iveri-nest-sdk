import { RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import { CONTROLLER_WATERMARK, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';

import { IS_PUBLIC_KEY } from '../../auth/public.decorator';

import { METRICS_ROUTE_EXCLUSIONS, METRICS_ROUTE_PATH } from './metrics.constant';
import { MetricsController } from './metrics.controller';
import type { MetricsService } from './metrics.service';

const stubResponse = (): Response & { headers: Record<string, string> } => {
    const headers: Record<string, string> = {};

    return {
        headers,
        setHeader: (name: string, value: string): void => {
            headers[name] = value;
        },
    } as unknown as Response & { headers: Record<string, string> };
};

const buildController = (
    output = '# HELP up\n',
    contentType = 'text/plain; version=0.0.4; charset=utf-8',
): MetricsController =>
    new MetricsController({
        contentType,
        render: (): Promise<string> => Promise.resolve(output),
    } as unknown as MetricsService);

describe('MetricsController', () => {
    describe('routing metadata', () => {
        // Operational contracts rather than code paths. Every one of these has broken a probe or
        // a scrape in a real service before it was pinned somewhere.
        it('is registered under /metrics', () => {
            expect(Reflect.getMetadata(CONTROLLER_WATERMARK, MetricsController)).toBe(true);
            expect(Reflect.getMetadata(PATH_METADATA, MetricsController)).toBe(METRICS_ROUTE_PATH);
        });

        it('is version-neutral, so shipping v2 does not silently stop the fleet reporting', () => {
            expect(Reflect.getMetadata(VERSION_METADATA, MetricsController)).toBe(VERSION_NEUTRAL);
        });

        it('is public, so a global AuthGuard cannot 401 a scraper that has no credentials', () => {
            expect(Reflect.getMetadata(IS_PUBLIC_KEY, MetricsController)).toBe(true);
        });

        it('is hidden from OpenAPI, since the exposition format is not part of the API contract', () => {
            expect(Reflect.getMetadata('swagger/apiExcludeController', MetricsController)).toEqual([true]);
        });

        it('excludes the scrape route from the global prefix', () => {
            // Without this the endpoint is served from `/api/metrics` and every scrape config
            // pointed at `/metrics` gets a 404 that looks exactly like a service with no metrics.
            expect(METRICS_ROUTE_EXCLUSIONS).toEqual([{ path: METRICS_ROUTE_PATH, method: RequestMethod.GET }]);
        });
    });

    describe('scrape', () => {
        it('returns the rendered registry', async () => {
            const controller = buildController('# HELP http_server_requests_total Total\n');

            await expect(controller.scrape(stubResponse())).resolves.toContain('http_server_requests_total');
        });

        it('sets the content type the registry reports rather than a hardcoded one', async () => {
            // A mismatched header is parsed wrongly rather than rejected: the scrape looks
            // successful and the values are quietly wrong.
            const controller = buildController('', 'application/openmetrics-text; version=1.0.0; charset=utf-8');
            const response = stubResponse();

            await controller.scrape(response);

            expect(response.headers['Content-Type']).toBe('application/openmetrics-text; version=1.0.0; charset=utf-8');
        });
    });
});
