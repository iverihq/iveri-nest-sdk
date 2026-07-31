import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/**
 * A principal reached for a resource belonging to another tenant.
 *
 * Reaching this exception means a query escaped `BaseRepository`'s scoping — every read
 * through the repository layer is already filtered by tenant, so a cross-tenant row is simply
 * not found. Treat an occurrence as a bug to investigate, not a routine 403.
 */
export class TenantMismatchException extends DomainException {
    readonly code = ErrorCode.TENANT_MISMATCH;
    readonly status = HttpStatus.FORBIDDEN;
}
