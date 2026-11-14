import type { UUID } from '@iveri/contracts';
import { IveriProduct, LicenceStatus, type ProductLicenceCheck } from '@iveri/contracts/platform';
import { describe, expect, it, vi } from 'vitest';

import type { LicenceModuleOptions } from './licence-module-options.interface.js';
import { LicenceService } from './licence.service.js';

const TENANT = '11111111-1111-4111-8111-111111111111' as UUID;

const check = (fields: Partial<ProductLicenceCheck> = {}): ProductLicenceCheck => ({
    tenantId: TENANT,
    product: IveriProduct.CLINIC,
    isActive: true,
    status: LicenceStatus.ACTIVE,
    seats: null,
    endsOn: null,
    ...fields,
});

const OPTIONS: LicenceModuleOptions = {
    product: IveriProduct.CLINIC,
    isEnabled: true,
    billingApiUrl: 'http://billing.internal:3001',
    billingTimeoutMs: 3_000,
    cacheSeconds: 60,
    identityApiUrl: 'http://identity.internal:3000',
    platformApiKey: 'ik_platform',
    identityTimeoutMs: 2_000,
    refreshSkewSeconds: 30,
};

const service = (
    answer: ProductLicenceCheck | null,
    overrides: Partial<LicenceModuleOptions> = {},
): { licences: LicenceService; asked: () => number } => {
    const client = { check: vi.fn().mockResolvedValue(answer) };

    return {
        licences: new LicenceService({ ...OPTIONS, ...overrides }, client as never),
        asked: () => client.check.mock.calls.length,
    };
};

describe('LicenceService', () => {
    it('asks nothing and refuses nothing while the check is off', async () => {
        const { licences, asked } = service(check({ isActive: false }), { isEnabled: false });

        await expect(licences.assertActive(TENANT)).resolves.toBeUndefined();
        await expect(licences.check(TENANT)).resolves.toBeNull();
        expect(asked()).toBe(0);
    });

    it('refuses a licence billing says is not live, naming the reason and the configured product', async () => {
        const { licences } = service(check({ isActive: false, status: LicenceStatus.EXPIRED }));

        await expect(licences.assertActive(TENANT)).rejects.toMatchObject({
            status: 403,
            details: { reason: 'licence-inactive', product: 'clinic' },
        });
    });

    it('names whichever product the module was given', async () => {
        const { licences } = service(check({ product: IveriProduct.GYM, isActive: false }), {
            product: IveriProduct.GYM,
        });

        await expect(licences.assertActive(TENANT)).rejects.toMatchObject({
            details: { reason: 'licence-inactive', product: 'gym' },
        });
    });

    it('lets a company through when billing cannot say', async () => {
        const { licences } = service(null);

        await expect(licences.isActive(TENANT)).resolves.toBe(true);
        await expect(licences.assertActive(TENANT)).resolves.toBeUndefined();
    });

    it('remembers the answer', async () => {
        const { licences, asked } = service(check());

        await licences.isActive(TENANT);
        await licences.isActive(TENANT);

        expect(asked()).toBe(1);
    });

    it('hands back the remembered check, seats included, so a product can count its own', async () => {
        const { licences, asked } = service(check({ seats: 12 }));

        await expect(licences.check(TENANT)).resolves.toMatchObject({ seats: 12 });
        await licences.isActive(TENANT);
        expect(asked()).toBe(1);
    });

    /** An outage is asked about again soon, never held as long as a real answer. */
    it('remembers an unknown for at most ten seconds', async () => {
        vi.useFakeTimers();

        try {
            const { licences, asked } = service(null, { cacheSeconds: 300 });

            await licences.isActive(TENANT);
            vi.advanceTimersByTime(9_000);
            await licences.isActive(TENANT);
            expect(asked()).toBe(1);

            vi.advanceTimersByTime(2_000);
            await licences.isActive(TENANT);
            expect(asked()).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('reads its options on every call, so the check can be switched on after construction', async () => {
        const options = { ...OPTIONS, isEnabled: false };
        const licences = new LicenceService(options, {
            check: vi.fn().mockResolvedValue(check({ isActive: false })),
        } as never);

        await expect(licences.isActive(TENANT)).resolves.toBe(true);
        options.isEnabled = true;
        await expect(licences.isActive(TENANT)).resolves.toBe(false);
    });
});
