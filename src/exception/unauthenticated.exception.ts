import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * No usable credentials were presented, or a token could not be verified.
 *
 * Distinct from {@link ForbiddenActionException}: this says "we do not know who you are",
 * not "we know, and no".
 */
export class UnauthenticatedException extends DomainException {
    readonly code = ErrorCode.UNAUTHENTICATED;
    readonly status = HttpStatus.UNAUTHORIZED;
}
