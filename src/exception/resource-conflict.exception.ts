import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/** The request contradicts current state — a stale version, a closed aggregate, a used token. */
export class ResourceConflictException extends DomainException {
    readonly code = ErrorCode.RESOURCE_CONFLICT;
    readonly status = HttpStatus.CONFLICT;
}
