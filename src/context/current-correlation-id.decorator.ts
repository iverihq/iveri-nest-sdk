import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { HeaderKey } from '../constant/header-key.constant';

/**
 * Param decorator resolving the current request's correlation id.
 *
 * Reads the header rather than `AsyncLocalStorage` so it also works in a controller reached
 * without the middleware — but pair it with `CorrelationIdMiddleware`, which guarantees the
 * header is populated before any handler runs.
 */
export const CurrentCorrelationId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    const value = request.headers[HeaderKey.CORRELATION_ID];

    return (Array.isArray(value) ? value[0] : value) ?? '';
});
