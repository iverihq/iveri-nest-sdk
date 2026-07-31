import type { ErrorCode, Maybe } from '@iveri/contracts';
import type { HttpStatus } from '@nestjs/common';

/**
 * Base class for every predictable failure a service can produce.
 *
 * Business code throws one of these; {@link GlobalExceptionFilter} is the only thing that
 * knows how to turn it into an HTTP response. That separation is what keeps a service method
 * callable from a controller, another service, a command handler or a processor — none of
 * which agree on what "a 404" means.
 *
 * Never `throw new Error()`. An untyped throw is indistinguishable from a bug and renders as
 * a 500 with no code for the client to branch on.
 *
 * Extend this to add a service-specific failure:
 *
 * ```ts
 * export class ConversationClosedException extends DomainException {
 *     readonly code = ErrorCode.UNPROCESSABLE_ENTITY;
 *     readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
 * }
 * ```
 */
export abstract class DomainException extends Error {
    /** Stable classification the client branches on. */
    abstract readonly code: ErrorCode;

    /** HTTP status the filter renders. */
    abstract readonly status: HttpStatus;

    /**
     * Structured context returned to the caller alongside the message — which field failed,
     * which constraint was violated.
     *
     * This crosses the network. Never put a token, a password, a signing secret or a raw
     * upstream payload in it.
     */
    readonly details: Maybe<Record<string, unknown>>;

    // Public rather than protected: the class is abstract, so it cannot be instantiated
    // directly anyway, and a protected constructor would force every subclass to redeclare
    // one purely to widen the visibility.
    constructor(message: string, details?: Maybe<Record<string, unknown>>, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
        this.details = details;
        Error.captureStackTrace(this, new.target);
    }
}
