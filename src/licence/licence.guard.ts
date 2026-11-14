import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import { REQUEST_CONTEXT_PROPERTY, type RequestContext } from '../context/index.js';

import { SKIP_LICENCE_KEY } from './licence.constant.js';
import { LicenceService } from './licence.service.js';

/**
 * Refuses every signed-in route for a company whose licence for this product is not live.
 *
 * Register it as an `APP_GUARD` **after** `AuthGuard` and `PermissionGuard`, so it only sees a request whose company
 * is known and allowed the route. Public routes are left alone: a public address must not say which companies have
 * lapsed, so a product checks `isActive` there itself and answers as if the page never existed. `@SkipLicence()`
 * exempts the backoffice, whose caller is Iveri's operator workspace rather than a customer.
 */
@Injectable()
export class LicenceGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly licenceService: LicenceService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http' || !this.licenceService.isEnabled()) return true;

        const targets = [context.getHandler(), context.getClass()];
        const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
        const isExempt = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_LICENCE_KEY, targets);

        if (isPublic === true || isExempt === true) return true;

        const request = context.switchToHttp().getRequest<Record<string, unknown>>();
        const requestContext = request[REQUEST_CONTEXT_PROPERTY] as RequestContext | undefined;

        if (requestContext === undefined) return true;

        await this.licenceService.assertActive(requestContext.tenantId);

        return true;
    }
}
