import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * A token verified correctly but its expiry has passed.
 *
 * Separate from {@link UnauthenticatedException} because the client's response differs: this
 * one is a signal to refresh and retry, not to send the user back to a login screen.
 */
export class TokenExpiredException extends DomainException {
    readonly code = ErrorCode.TOKEN_EXPIRED;
    readonly status = HttpStatus.UNAUTHORIZED;
}
