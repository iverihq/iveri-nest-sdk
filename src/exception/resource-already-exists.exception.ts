import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * A uniqueness constraint would be violated.
 *
 * {@link GlobalExceptionFilter} also raises this shape from a Postgres `23505`, so a race that
 * slips past an application-level pre-check still surfaces as a clean 409 rather than a 500.
 */
export class ResourceAlreadyExistsException extends DomainException {
    readonly code = ErrorCode.RESOURCE_ALREADY_EXISTS;
    readonly status = HttpStatus.CONFLICT;
}
