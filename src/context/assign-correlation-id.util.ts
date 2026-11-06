import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { HeaderKey } from '../constant/header-key.constant.js';

/** The longest correlation id a caller may supply. */
const MAX_CORRELATION_ID_LENGTH = 128;

/**
 * The request's correlation id: the caller's when it is usable, a fresh UUID otherwise, written
 * back onto the request headers so everything that runs later reads the same value.
 *
 * **The one rule, used everywhere a request is given an id.** A service's logger runs first —
 * pass this as pino-http's `genReqId` — then `CorrelationIdMiddleware`, then, for an error,
 * `GlobalExceptionFilter`; each calls this, and the second and third find the first's answer.
 * Six services used to carry their own `genReqId` that accepted the raw header while the
 * middleware normalised it, so an empty or oversized id was logged under one value and answered
 * under another.
 *
 * A caller's id goes into every log line and every outbound header, so it is trimmed and an empty
 * or implausibly long one is replaced: an unbounded client-supplied string there is a
 * log-injection and header-size problem.
 */
export const assignCorrelationId = (request: IncomingMessage): string => {
    const incoming = request.headers[HeaderKey.CORRELATION_ID];
    const candidate = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim();
    const correlationId =
        candidate !== undefined && candidate.length > 0 && candidate.length <= MAX_CORRELATION_ID_LENGTH
            ? candidate
            : randomUUID();

    request.headers[HeaderKey.CORRELATION_ID] = correlationId;

    return correlationId;
};
