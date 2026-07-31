import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * A request failed DTO validation.
 *
 * The global `ValidationPipe` raises this shape automatically; throw it by hand only for a
 * check the decorators cannot express. `details` should map field name to the constraints it
 * violated.
 */
export class ValidationFailedException extends DomainException {
    readonly code = ErrorCode.VALIDATION_FAILED;
    readonly status = HttpStatus.BAD_REQUEST;
}
