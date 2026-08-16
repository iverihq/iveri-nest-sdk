import { Controller, Get, HttpCode, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../../auth/public.decorator';

import { METRICS_ROUTE_PATH } from './metrics.constant';
import { MetricsService } from './metrics.service';

/**
 * `GET /metrics` — the Prometheus scrape endpoint.
 *
 * **Unauthenticated**, for the same reason the health probes are: a scraper holds no
 * credentials, and a global `AuthGuard` would answer it 401. What makes that acceptable is
 * that the response is tenant-free by construction — see `MetricsService` — so there is no
 * customer data here to protect, only fleet-level counters. It should still be blocked at the
 * ingress in a deployed environment, which is deployment work rather than something this
 * controller can enforce.
 *
 * **Version-neutral**, again like the probes: it stays on `/metrics` rather than `/v1/metrics`.
 * A scrape config is written once and outlives several API versions, and shipping v2 must not
 * silently stop the fleet reporting.
 *
 * Hidden from Swagger. The exposition format is not JSON and not part of the API contract a
 * frontend is written against; documenting it as an operation would only invite someone to
 * generate a client for it.
 */
@ApiExcludeController()
@Public()
@Controller({ path: METRICS_ROUTE_PATH, version: VERSION_NEUTRAL })
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) {}

    @Get()
    @HttpCode(HttpStatus.OK)
    async scrape(@Res({ passthrough: true }) response: Response): Promise<string> {
        // Taken from the registry rather than hardcoded: prom-client negotiates between the
        // Prometheus text format and OpenMetrics, and a mismatched header is parsed wrongly
        // rather than rejected — the scrape appears to succeed and the values are silently off.
        response.setHeader('Content-Type', this.metricsService.contentType);

        return this.metricsService.render();
    }
}
