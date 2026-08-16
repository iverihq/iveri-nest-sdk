import { RequestMethod } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';

import { INFRASTRUCTURE_ROUTE_PREFIXES } from '../../constant/infrastructure-route.constant';

/** Path the Prometheus scrape endpoint is mounted on. */
export const METRICS_ROUTE_PATH = 'metrics';

/**
 * The scrape route, for `setGlobalPrefix`'s `exclude`.
 *
 * Spread alongside `HEALTH_ROUTE_EXCLUSIONS` rather than written out, for the same reason that
 * list exists: a path listed by hand drifts between a service's `main.ts` and the `test-app.ts`
 * that duplicates its bootstrap, and the failure is silent — a scrape config pointed at
 * `/metrics` gets a 404 that is indistinguishable from a service which has no metrics at all.
 *
 * ```ts
 * app.setGlobalPrefix('api', { exclude: [...HEALTH_ROUTE_EXCLUSIONS, ...METRICS_ROUTE_EXCLUSIONS] });
 * ```
 */
export const METRICS_ROUTE_EXCLUSIONS: readonly RouteInfo[] = [{ path: METRICS_ROUTE_PATH, method: RequestMethod.GET }];

/** Injection token for the resolved {@link MetricsModuleOptions}. */
export const METRICS_MODULE_OPTIONS = Symbol('METRICS_MODULE_OPTIONS');

/**
 * Total requests served, by method, route pattern and status code.
 *
 * The HTTP metric names follow the OpenTelemetry semantic conventions rather than being
 * prefixed like our own series. They describe something every service in the world exports the
 * same way, so a later move onto an OTel collector should not mean rewriting the dashboards
 * built on them.
 */
export const HTTP_REQUESTS_TOTAL = 'http_server_requests_total';

/** Request duration in **seconds** — the Prometheus base unit; never milliseconds. */
export const HTTP_REQUEST_DURATION_SECONDS = 'http_server_request_duration_seconds';

/**
 * Label carrying the response status.
 *
 * Named rather than written inline because Prometheus label names are `snake_case` — an
 * external convention, not ours — and because every alert rule and dashboard query is written
 * against this exact string.
 */
export const STATUS_CODE_LABEL = 'status_code';

/**
 * Backlog depth per queue and state.
 *
 * Prefixed, unlike the HTTP series above, because there is no cross-vendor meaning of "queue"
 * to conform to — this is Iveri's own shape and the prefix is what groups it in a metric
 * browser next to the many `nodejs_*` and `process_*` series the default collector emits.
 */
export const QUEUE_DEPTH_GAUGE = 'iveri_queue_depth';

/**
 * Latency histogram buckets, in seconds.
 *
 * Every bucket is a stored time series per label combination, so this list is a direct cost.
 * It is weighted toward the low end because that is where the useful percentiles of an HTTP
 * API sit, and topped out at 10s because anything slower is already a failure by the time a
 * caller's timeout budget is considered.
 */
export const HTTP_DURATION_BUCKETS_SECONDS: readonly number[] = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/**
 * Paths not counted as HTTP traffic by default — {@link INFRASTRUCTURE_ROUTE_PREFIXES}.
 *
 * Aliased rather than restated so that the metrics side and the error-reporting side, which
 * both need exactly this list, cannot come to disagree about it.
 */
export const DEFAULT_IGNORED_METRICS_ROUTES = INFRASTRUCTURE_ROUTE_PREFIXES;
