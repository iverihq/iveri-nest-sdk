/**
 * Ambient context propagated through the call chain via `AsyncLocalStorage`.
 *
 * This is the one thing that is *not* threaded explicitly through service DTOs, because it
 * has to reach places that never see a request — a repository logging a slow query, an
 * outbox processor publishing on behalf of a request that finished minutes ago.
 */
export interface CorrelationContext {
    /**
     * Identifier tying together every log line, outbound HTTP call and Kafka message
     * belonging to one user-initiated request, consumed event, or scheduled job.
     */
    correlationId: string;

    /** Free-form fields merged into every log line emitted inside this context. */
    fields?: Record<string, unknown>;
}
