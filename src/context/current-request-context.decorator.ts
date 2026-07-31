import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { UnauthenticatedException } from '../exception/unauthenticated.exception';

import type { RequestContext } from './request-context.interface';

/**
 * Property on the Express request object where the authentication layer parks the resolved
 * {@link RequestContext}. Exported so a guard and this decorator cannot drift apart.
 */
export const REQUEST_CONTEXT_PROPERTY = 'iveriRequestContext';

interface RequestWithContext extends Request {
    [REQUEST_CONTEXT_PROPERTY]?: RequestContext;
}

/**
 * Param decorator handing a controller the resolved {@link RequestContext}. Mapping it into a
 * service input DTO is the controller's whole job.
 *
 * ```ts
 * @Post()
 * createConversation(
 *     @CurrentRequestContext() requestContext: RequestContext,
 *     @Body() body: CreateConversationInputDto,
 * ): Promise<ConversationResponseOutputDto> { ... }
 * ```
 *
 * Throws rather than returning `undefined` when nothing populated it. An endpoint that
 * reaches a handler with no context is misconfigured — a missing `AuthGuard` — and failing
 * loudly here is the difference between a 401 and a query that silently runs untenanted.
 *
 * The guard that populates it ships with `iveri-identity-api` (build-order step 2). Conduit's
 * ingress endpoint is deliberately the one place that has neither.
 */
export const CurrentRequestContext = createParamDecorator(
    (_data: unknown, context: ExecutionContext): RequestContext => {
        const request = context.switchToHttp().getRequest<RequestWithContext>();
        const requestContext = request[REQUEST_CONTEXT_PROPERTY];

        if (!requestContext) {
            throw new UnauthenticatedException('Request reached a handler with no authenticated context');
        }

        return requestContext;
    },
);
