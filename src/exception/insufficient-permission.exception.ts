import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * The principal's roles do not grant the permission this endpoint requires.
 *
 * Put the required permission in `details` — it is the difference between a support ticket
 * and a self-service fix by the tenant's own admin.
 */
export class InsufficientPermissionException extends DomainException {
    readonly code = ErrorCode.INSUFFICIENT_PERMISSION;
    readonly status = HttpStatus.FORBIDDEN;
}
