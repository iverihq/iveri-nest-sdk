import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { Public } from '../auth/public.decorator.js';
import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator.js';

import { LicenceGuard } from './licence.guard.js';
import type { LicenceService } from './licence.service.js';
import { SkipLicence } from './skip-licence.decorator.js';

const TENANT = 'cccccccc-0000-4000-8000-000000000002';

class Routes {
    signedIn(): string {
        return 'signed-in';
    }

    @Public()
    open(): string {
        return 'open';
    }

    @SkipLicence()
    backoffice(): string {
        return 'backoffice';
    }
}

const context = (handler: keyof Routes, options: { type?: string; tenantId?: string } = {}): ExecutionContext =>
    ({
        getType: () => options.type ?? 'http',
        getHandler: () => Routes.prototype[handler],
        getClass: () => Routes,
        switchToHttp: () => ({
            getRequest: () => ({
                [REQUEST_CONTEXT_PROPERTY]:
                    options.tenantId === undefined ? undefined : { tenantId: options.tenantId, permissions: [] },
            }),
        }),
    }) as unknown as ExecutionContext;

const guard = (isEnabled = true): { licenceGuard: LicenceGuard; assertActive: ReturnType<typeof vi.fn> } => {
    const assertActive = vi.fn().mockResolvedValue(undefined);
    const service = { isEnabled: () => isEnabled, assertActive } as unknown as LicenceService;

    return { licenceGuard: new LicenceGuard(new Reflector(), service), assertActive };
};

describe('LicenceGuard', () => {
    it("asks about a signed-in request's company", async () => {
        const { licenceGuard, assertActive } = guard();

        await expect(licenceGuard.canActivate(context('signedIn', { tenantId: TENANT }))).resolves.toBe(true);
        expect(assertActive).toHaveBeenCalledWith(TENANT);
    });

    it.each([
        ['a public route', context('open', { tenantId: TENANT })],
        ['a route marked @SkipLicence()', context('backoffice', { tenantId: TENANT })],
        ['a request no token reached', context('signedIn')],
        ['something other than HTTP', context('signedIn', { type: 'ws', tenantId: TENANT })],
    ])('leaves %s alone', async (_label, executionContext) => {
        const { licenceGuard, assertActive } = guard();

        await expect(licenceGuard.canActivate(executionContext)).resolves.toBe(true);
        expect(assertActive).not.toHaveBeenCalled();
    });

    it('asks nothing while the check is off', async () => {
        const { licenceGuard, assertActive } = guard(false);

        await expect(licenceGuard.canActivate(context('signedIn', { tenantId: TENANT }))).resolves.toBe(true);
        expect(assertActive).not.toHaveBeenCalled();
    });
});
