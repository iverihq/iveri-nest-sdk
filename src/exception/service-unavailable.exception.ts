import { ErrorCode } from '@iveri/contracts';
import { HttpStatus } from '@nestjs/common';

import { DomainException } from './domain.exception';

/** A dependency is unreachable, or the process is draining for shutdown. Retryable. */
export class ServiceUnavailableException extends DomainException {
    readonly code = ErrorCode.SERVICE_UNAVAILABLE;
    readonly status = HttpStatus.SERVICE_UNAVAILABLE;
}
