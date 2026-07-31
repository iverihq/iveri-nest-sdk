import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/** Authenticated, but this principal may not perform this action. */
export class ForbiddenActionException extends DomainException {
    readonly code = ErrorCode.FORBIDDEN;
    readonly status = HttpStatus.FORBIDDEN;
}
