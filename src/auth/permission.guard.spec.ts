import { UserPermission } from '@iveri/contracts';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator';
import { InsufficientPermissionException } from '../exception/insufficient-permission.exception';
import { UnauthenticatedException } from '../exception/unauthenticated.exception';

import type { AuthenticatedRequestContext } from './authenticated-request-context.interface';
import { PermissionGuard } from './permission.guard';
import { REQUIRED_PERMISSIONS_KEY } from './require-permission.decorator';

const buildContext = (granted?: UserPermission[]) => {
    const requestContext: AuthenticatedRequestContext | undefined = granted && {
        tenantId: 'cccccccc-0000-4000-8000-000000000003',
        userId: 'aaaaaaaa-0000-4000-8000-000000000001',
        apiKeyId: null,
        permissions: granted,
        locale: 'en',
        correlationId: '',
    };

    return {
        switchToHttp: () => ({ getRequest: () => ({ [REQUEST_CONTEXT_PROPERTY]: requestContext }) }),
        getHandler: () => undefined,
        getClass: () => undefined,
    } as unknown as ExecutionContext;
};

const buildGuard = (required?: UserPermission[]): PermissionGuard =>
    new PermissionGuard({
        getAllAndOverride: (key: string) => (key === REQUIRED_PERMISSIONS_KEY ? required : undefined),
    } as unknown as Reflector);

describe('PermissionGuard', () => {
    it.each([
        ['no @RequirePermission metadata', undefined],
        ['an empty permission list', [] as UserPermission[]],
    ])('lets a route with %s through', (_name, required) => {
        expect(buildGuard(required).canActivate(buildContext([]))).toBe(true);
    });

    it('allows a caller holding the required permission', () => {
        const guard = buildGuard([UserPermission.UNIBOX_CONVERSATION_READ]);

        expect(guard.canActivate(buildContext([UserPermission.UNIBOX_CONVERSATION_READ]))).toBe(true);
    });

    it('refuses a caller missing the required permission', () => {
        const guard = buildGuard([UserPermission.UNIBOX_MESSAGE_SEND]);

        expect(() => guard.canActivate(buildContext([UserPermission.UNIBOX_CONVERSATION_READ]))).toThrow(
            InsufficientPermissionException,
        );
    });

    it('requires every declared permission, not any of them', () => {
        // The permissive reading is the one that silently grants access, so this is the whole
        // decision behind `@RequirePermission(a, b)` in one assertion.
        const guard = buildGuard([UserPermission.UNIBOX_CONVERSATION_READ, UserPermission.UNIBOX_MESSAGE_SEND]);

        expect(() => guard.canActivate(buildContext([UserPermission.UNIBOX_CONVERSATION_READ]))).toThrow(
            InsufficientPermissionException,
        );
    });

    it('names the missing permissions in the error', () => {
        const guard = buildGuard([UserPermission.UNIBOX_MESSAGE_SEND]);

        try {
            guard.canActivate(buildContext([]));
            throw new Error('expected the guard to refuse');
        } catch (error: unknown) {
            // Not a leak: the caller is already authenticated, and naming the scope they lack
            // saves an integrator a support round trip.
            expect(error).toBeInstanceOf(InsufficientPermissionException);
            expect((error as InsufficientPermissionException).details).toMatchObject({
                missing: [UserPermission.UNIBOX_MESSAGE_SEND],
            });
        }
    });

    it('fails closed when a permission-gated route has no authenticated context', () => {
        // A route that is @Public() *and* permission-gated contradicts itself. Refusing is the
        // only reading that does not wave the request through.
        const guard = buildGuard([UserPermission.UNIBOX_CONVERSATION_READ]);

        expect(() => guard.canActivate(buildContext(undefined))).toThrow(UnauthenticatedException);
    });
});
