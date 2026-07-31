import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * An invariant we believed held did not.
 *
 * Throw this where the failure is genuinely ours and there is nothing the caller can do
 * differently. Its message is logged in full but replaced with a generic one in the response,
 * so it is safe to be specific here.
 */
export class InternalException extends DomainException {
    readonly code = ErrorCode.INTERNAL_ERROR;
    readonly status = HttpStatus.INTERNAL_SERVER_ERROR;
}
