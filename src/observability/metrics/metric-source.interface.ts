/**
 * Anything that must be read *at scrape time* rather than written as it happens.
 *
 * The distinction matters for the same reason it does for queue depth: a value the application
 * pushes goes stale exactly when the application stops doing the thing that pushes it, and that
 * is usually the moment the number is worth reading. A connection pool at its limit is the
 * example — the requests that would have updated a pushed gauge are the ones stuck waiting.
 *
 * {@link QueueDepthCollector} is the specialised version of this for durable work queues, kept
 * separate because it is common enough to deserve its own shape. Use `MetricSource` for
 * anything else that has to be sampled.
 *
 * A source that throws never fails the scrape, and never leaves a stale value behind — see
 * `MetricsService.render`.
 */
export interface MetricSource {
    /** Short identifier used in the log line when a refresh fails, e.g. `database-pool`. */
    readonly name: string;

    refresh(): Promise<void> | void;
}

/** Injection token for the resolved list of {@link MetricSource}s. */
export const METRIC_SOURCES = Symbol('IVERI_METRIC_SOURCES');
