/**
 * Path prefixes served for infrastructure rather than for a caller — the health probes and the
 * Prometheus scrape endpoint.
 *
 * Two unrelated concerns need exactly this list, which is why it lives here rather than beside
 * either of them:
 *
 * - **Metrics** exclude them from the request counters. They are called on a fixed schedule by
 *   an orchestrator and a scraper, so counting them measures the monitoring rather than the
 *   service — and against a per-second liveness probe they would be most of the volume.
 * - **Error reporting** excludes them from capture. A readiness probe answers 503 for as long
 *   as a dependency is down, so reporting each one turns one outage into thousands of events
 *   that say nothing the first already said.
 *
 * Matched as a prefix, on a path boundary: `/health` covers `/health/live` but not
 * `/healthcheck-proxy`.
 */
export const INFRASTRUCTURE_ROUTE_PREFIXES: readonly string[] = ['/health', '/metrics'];

/** Whether a request path belongs to {@link INFRASTRUCTURE_ROUTE_PREFIXES}. */
export const isInfrastructureRoute = (path: string, prefixes = INFRASTRUCTURE_ROUTE_PREFIXES): boolean =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
