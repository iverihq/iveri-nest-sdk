import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * The requested resource does not exist — or exists under another tenant, which through the
 * repository layer is the same thing and deliberately indistinguishable to the caller.
 */
export class ResourceNotFoundException extends DomainException {
    readonly code = ErrorCode.RESOURCE_NOT_FOUND;
    readonly status = HttpStatus.NOT_FOUND;
}
