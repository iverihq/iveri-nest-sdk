import type { UUID } from '@iveri/contracts';
import { IveriProduct, LicenceStatus, type ProductLicenceCheck } from '@iveri/contracts/platform';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { BillingLicenceClient, readCheck } from './billing-licence.client.js';
import type { LicenceModuleOptions } from './licence-module-options.interface.js';

const TENANT = '11111111-1111-4111-8111-111111111111' as UUID;

const check = (fields: Partial<ProductLicenceCheck> = {}): ProductLicenceCheck => ({
    tenantId: TENANT,
    product: IveriProduct.HR,
    isActive: true,
    status: LicenceStatus.ACTIVE,
    seats: null,
    endsOn: null,
    ...fields,
});

const OPTIONS: LicenceModuleOptions = {
    product: IveriProduct.HR,
    isEnabled: true,
    billingApiUrl: 'http://billing.internal:3001/',
    billingTimeoutMs: 3_000,
    cacheSeconds: 60,
    identityApiUrl: 'http://identity.internal:3000',
    platformApiKey: 'ik_platform',
    identityTimeoutMs: 2_000,
    refreshSkewSeconds: 30,
};

const clientWith = (
    get: Mock,
    overrides: Partial<LicenceModuleOptions> = {},
): { client: BillingLicenceClient; invalidate: Mock } => {
    const invalidate = vi.fn();
    const serviceToken = { getAccessToken: vi.fn().mockResolvedValue('jwt'), invalidate };

    return {
        client: new BillingLicenceClient(
            { ...OPTIONS, ...overrides },
            { get } as unknown as HttpService,
            serviceToken as never,
        ),
        invalidate,
    };
};

const answer = (status: number, data: unknown) => of({ status, data } as never);

describe('BillingLicenceClient', () => {
    it('asks about the configured product, with the operator token', async () => {
        const get = vi.fn().mockReturnValue(answer(200, check({ product: IveriProduct.TAXI })));
        const { client } = clientWith(get, { product: IveriProduct.TAXI });

        await expect(client.check(TENANT)).resolves.toMatchObject({ product: 'taxi' });
        expect(get).toHaveBeenCalledWith(
            `http://billing.internal:3001/api/v1/platform/licences/check?tenantId=${TENANT}&product=taxi`,
            expect.objectContaining({ headers: { authorization: 'Bearer jwt' }, timeout: 3_000 }),
        );
    });

    it('refuses an answer about another product than the one it asked for', async () => {
        const { client } = clientWith(vi.fn().mockReturnValue(answer(200, check({ product: IveriProduct.CLINIC }))));

        await expect(client.check(TENANT)).resolves.toBeNull();
    });

    it('retries once past a 401 with a fresh token, and no more', async () => {
        const get = vi.fn().mockReturnValue(answer(401, {}));
        const { client, invalidate } = clientWith(get);

        await expect(client.check(TENANT)).resolves.toBeNull();
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('never throws, answering unknown when billing cannot be reached', async () => {
        const { client } = clientWith(vi.fn().mockReturnValue(throwError(() => new Error('ECONNREFUSED'))));

        await expect(client.check(TENANT)).resolves.toBeNull();
    });

    it('answers unknown without a request when no billing address is configured', async () => {
        const get = vi.fn();
        const { client } = clientWith(get, { billingApiUrl: undefined });

        await expect(client.check(TENANT)).resolves.toBeNull();
        expect(get).not.toHaveBeenCalled();
    });
});

describe('readCheck', () => {
    it('keeps only what a check needs', () => {
        expect(readCheck({ ...check({ seats: 5 }), extra: 'ignored' }, TENANT, IveriProduct.HR)).toEqual(
            check({ seats: 5 }),
        );
    });

    it('refuses an answer about another company, another product or with no verdict', () => {
        const other = '22222222-2222-4222-8222-222222222222' as UUID;

        expect(readCheck(check(), other, IveriProduct.HR)).toBeNull();
        expect(readCheck(check(), TENANT, IveriProduct.CLINIC)).toBeNull();
        expect(readCheck({ ...check(), product: 'clinic' }, TENANT, IveriProduct.HR)).toBeNull();
        expect(readCheck({ tenantId: TENANT, product: 'hr' }, TENANT, IveriProduct.HR)).toBeNull();
        expect(readCheck('nonsense', TENANT, IveriProduct.HR)).toBeNull();
    });
});
