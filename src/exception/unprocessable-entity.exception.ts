import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * Well-formed and valid, but rejected by a business rule — the default for domain
 * invariants that DTO validation cannot express.
 */
export class UnprocessableEntityException extends DomainException {
    readonly code = ErrorCode.UNPROCESSABLE_ENTITY;
    readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
}
