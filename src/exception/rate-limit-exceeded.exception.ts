import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * The caller exceeded a rate limit.
 *
 * Put `retryAfterSeconds` in `details` — a limit with no stated recovery time turns a
 * well-behaved client into a hot retry loop.
 */
export class RateLimitExceededException extends DomainException {
    readonly code = ErrorCode.RATE_LIMIT_EXCEEDED;
    readonly status = HttpStatus.TOO_MANY_REQUESTS;
}
