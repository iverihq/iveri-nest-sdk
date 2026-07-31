import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * Credentials were well-formed but wrong.
 *
 * The message must never distinguish "no such user" from "wrong password" — that difference
 * is a free account-enumeration oracle. One message, both cases.
 */
export class InvalidCredentialsException extends DomainException {
    readonly code = ErrorCode.INVALID_CREDENTIALS;
    readonly status = HttpStatus.UNAUTHORIZED;
}
