/**
 * The states a row can sit in while it is still *work*.
 *
 * A closed union rather than a free string, for the reason every label in this module is
 * constrained: the value becomes a Prometheus label, and a service passing its own wire status
 * through would put `dead-lettered`, `DEAD_LETTERED` and `deadLettered` on three different time
 * series describing one thing. Mapping a status to one of these three is a decision each
 * collector states explicitly.
 *
 * Terminal success states are deliberately absent. `delivered`, `sent` and `cancelled` are not
 * backlog, and a gauge that only ever climbs is a counter wearing the wrong clothes — it says
 * nothing about whether the queue is keeping up, which is the single question this metric
 * exists to answer.
 */
export type QueueState = 'pending' | 'in_flight' | 'dead_lettered';

/** One `(state, depth)` pair, as reported by a {@link QueueDepthCollector}. */
export interface QueueDepthReading {
    state: QueueState;
    depth: number;
}

/**
 * A durable work queue that can report how far behind it is.
 *
 * Implemented by the repository that owns the table — Conduit's deliveries and dispatches,
 * notification's deliveries — because the count is a `COUNT(*)` with a `WHERE status = …` and
 * data access belongs in a repository.
 *
 * **`collect()` runs on every scrape, not on every processor cycle**, and that is the point.
 * A gauge written by the processor goes stale exactly when the processor stops, which is the
 * moment the number matters most: the queue would appear frozen at its last healthy depth
 * while it silently grew. Reading at scrape time makes the metric independent of the thing it
 * measures.
 *
 * The cost is one indexed count per queue per scrape. Keep the query covered by an index —
 * both of Conduit's queues already index `status`.
 */
export interface QueueDepthCollector {
    /** `queue` label value, e.g. `delivery`. Stable: renaming it breaks every alert on it. */
    readonly queue: string;

    collect(): Promise<QueueDepthReading[]>;
}

/** Injection token for the resolved list of {@link QueueDepthCollector}s. */
export const QUEUE_DEPTH_COLLECTORS = Symbol('IVERI_QUEUE_DEPTH_COLLECTORS');
