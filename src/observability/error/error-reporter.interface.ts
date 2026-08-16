import type { Maybe } from '@iveri/contracts';

/** Structured context attached to a captured error. */
export interface ErrorReportContext {
    /** Ties the report to the request's log lines. */
    correlationId?: Maybe<string>;

    /** Tenant the request was acting in, when one was resolved. */
    tenantId?: Maybe<string>;

    /** HTTP method and route pattern, when the error came from a request. */
    method?: Maybe<string>;
    route?: Maybe<string>;

    /** Anything else worth seeing beside the stack. Scrubbed before it leaves the process. */
    extra?: Record<string, unknown>;
}

/**
 * The narrow surface `GlobalExceptionFilter` needs to report an error.
 *
 * An interface rather than the concrete service so the filter — which every service registers
 * and which must keep working with no tracker configured at all — depends on a shape it can be
 * handed a fake of, and so that importing it costs nothing at runtime.
 */
export interface ErrorReporter {
    /** Whether a tracker is actually configured. `false` makes {@link capture} a no-op. */
    isEnabled(): boolean;

    capture(exception: unknown, context?: ErrorReportContext): void;
}
