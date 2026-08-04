import type { UserPermission } from '@iveri/contracts';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator';
import { InsufficientPermissionException } from '../exception/insufficient-permission.exception';
import { UnauthenticatedException } from '../exception/unauthenticated.exception';

import type { AuthenticatedRequestContext } from './authenticated-request-context.interface';
import { REQUIRED_PERMISSIONS_KEY } from './require-permission.decorator';

interface RequestWithContext extends Request {
    [REQUEST_CONTEXT_PROPERTY]?: AuthenticatedRequestContext;
}

/**
 * Enforces `@RequirePermission(...)`.
 *
 * Runs after {@link AuthGuard} — global guard order follows registration order in the consuming
 * service's `AppModule`, so the context it reads is already populated. A missing context here
 * therefore means the route is `@Public()` *and* permission-gated, which is a contradiction in
 * the route's own declaration; it fails closed rather than waving the request through.
 *
 * Several declared permissions means **all** are required. The permissive reading is the one that
 * silently grants access.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        // `| undefined` in the generic: `getAllAndOverride` is typed as returning `T`, but a
        // route with no `@RequirePermission` has no metadata and yields `undefined`.
        const required = this.reflector.getAllAndOverride<UserPermission[] | undefined>(REQUIRED_PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!required || required.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithContext>();
        const requestContext = request[REQUEST_CONTEXT_PROPERTY];

        if (!requestContext) {
            throw new UnauthenticatedException('Permission-gated route reached with no authenticated context');
        }

        const granted = new Set<string>(requestContext.permissions);
        const missing = required.filter((permission) => !granted.has(permission));

        if (missing.length > 0) {
            // The missing permissions are named. This is not a leak — the caller is already
            // authenticated, and telling an integrator exactly which scope they lack saves a
            // support round trip.
            throw new InsufficientPermissionException('Missing required permission', { required, missing });
        }

        return true;
    }
}
