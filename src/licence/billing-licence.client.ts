import type { UUID } from '@iveri/contracts';
import type { IveriProduct, ProductLicenceCheck } from '@iveri/contracts/platform';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ServiceTokenService } from '../service-token/index.js';

import type { LicenceModuleOptions } from './licence-module-options.interface.js';
import { LICENCE_MODULE_OPTIONS, LICENCE_SERVICE_TOKEN } from './licence.constant.js';

/**
 * Asks `iveri-billing-api` whether a company's licence for the configured product is live.
 *
 * It never throws: an answer it could not get is `null`, and the caller decides what an unknown means. One retry past
 * a 401 with a fresh token, and no more, so a refused key does not loop.
 */
@Injectable()
export class BillingLicenceClient {
    private readonly logger = new Logger(BillingLicenceClient.name);

    constructor(
        @Inject(LICENCE_MODULE_OPTIONS) private readonly options: LicenceModuleOptions,
        private readonly httpService: HttpService,
        @Inject(LICENCE_SERVICE_TOKEN) private readonly serviceToken: ServiceTokenService,
    ) {}

    async check(tenantId: UUID): Promise<ProductLicenceCheck | null> {
        if (!this.options.billingApiUrl) {
            this.logger.warn('No iveri-billing-api address is configured for licence checks');

            return null;
        }

        try {
            let response = await this.request(this.options.billingApiUrl, tenantId);

            if (response.status === 401) {
                this.serviceToken.invalidate();
                response = await this.request(this.options.billingApiUrl, tenantId);
            }

            if (response.status !== 200) {
                this.logger.warn(`iveri-billing-api answered HTTP ${response.status} to a licence check`);

                return null;
            }

            return readCheck(response.data, tenantId, this.options.product);
        } catch (error: unknown) {
            this.logger.warn(
                `Could not ask iveri-billing-api about a licence: ${error instanceof Error ? error.message : 'unknown'}`,
            );

            return null;
        }
    }

    private async request(billingApiUrl: string, tenantId: UUID): Promise<AxiosResponse<unknown>> {
        const baseUrl = billingApiUrl.replace(/\/+$/, '');
        const query = new URLSearchParams({ tenantId, product: this.options.product });

        return firstValueFrom(
            this.httpService.get<unknown>(`${baseUrl}/api/v1/platform/licences/check?${query.toString()}`, {
                headers: { authorization: `Bearer ${await this.serviceToken.getAccessToken()}` },
                timeout: this.options.billingTimeoutMs,
                validateStatus: () => true,
            }),
        );
    }
}

/** Reads only what a check needs, and refuses an answer about some other company or product. */
export function readCheck(body: unknown, tenantId: UUID, product: IveriProduct): ProductLicenceCheck | null {
    if (typeof body !== 'object' || body === null) return null;

    const check = body as Partial<ProductLicenceCheck>;

    if (check.tenantId !== tenantId || check.product !== product || typeof check.isActive !== 'boolean') {
        return null;
    }

    return {
        tenantId,
        product,
        isActive: check.isActive,
        status: check.status ?? null,
        seats: typeof check.seats === 'number' ? check.seats : null,
        endsOn: typeof check.endsOn === 'string' ? check.endsOn : null,
    };
}
