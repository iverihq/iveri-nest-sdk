import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator.js';
import { ForbiddenActionException } from '../exception/forbidden-action.exception.js';

import type { AuthenticatedRequestContext } from './authenticated-request-context.interface.js';

/** The setting naming Iveri's operator workspace, read through the service's own `ConfigService`. */
export const PLATFORM_TENANT_ID_SETTING = 'PLATFORM_TENANT_ID';

/**
 * Admits a request only when its token comes from Iveri's own operator workspace, `PLATFORM_TENANT_ID`.
 *
 * **This is the second line, and it must exist anyway.** Identity refuses a `platform:*` permission on any other
 * workspace's role or key — that is the first. A token is still only a list of strings signed with a shared secret, so
 * a `platform:*` permission arriving from a company's workspace means something upstream went wrong, and here it opens
 * nothing rather than every company's data.
 *
 * Apply it to a controller with `@UseGuards`, so it runs after the global `AuthGuard` and `PermissionGuard`: an
 * anonymous caller is a 401, one lacking the permission is the permission guard's 403, and this answers 403 only for
 * the right permission from the wrong place. **Unset means every platform route is refused**: a deployment that has not
 * named its operator workspace has no operators. The service validates the setting at startup like any other.
 */
@Injectable()
export class PlatformWorkspaceGuard implements CanActivate {
    constructor(private readonly configService: ConfigService<Record<string, unknown>, true>) {}

    canActivate(context: ExecutionContext): boolean {
        const platformTenantId = this.configService.get<string | undefined>(PLATFORM_TENANT_ID_SETTING);
        const request = context.switchToHttp().getRequest<Record<string, unknown>>();
        const requestContext = request[REQUEST_CONTEXT_PROPERTY] as AuthenticatedRequestContext | undefined;

        if (!platformTenantId || requestContext?.tenantId !== platformTenantId) {
            throw new ForbiddenActionException("Only Iveri's operator workspace may use this route");
        }

        return true;
    }
}
