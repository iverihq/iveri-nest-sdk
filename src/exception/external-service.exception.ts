import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * A third-party or downstream call failed in a way we could not recover from.
 *
 * Pass the original error as `options.cause` so it reaches the logs; put only the upstream's
 * *name* and status in `details`. Their raw response body is not ours to forward — it can
 * carry their internal identifiers, and in Conduit's case, a customer's payload.
 */
export class ExternalServiceException extends DomainException {
    readonly code = ErrorCode.EXTERNAL_SERVICE_ERROR;
    readonly status = HttpStatus.BAD_GATEWAY;
}
