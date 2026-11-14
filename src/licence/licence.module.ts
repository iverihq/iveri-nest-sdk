import { HttpModule, HttpService } from '@nestjs/axios';
import { type DynamicModule, type FactoryProvider, Module, type ModuleMetadata } from '@nestjs/common';

import { ServiceTokenService } from '../service-token/index.js';

import { BillingLicenceClient } from './billing-licence.client.js';
import type { LicenceModuleOptions } from './licence-module-options.interface.js';
import { LICENCE_MODULE_OPTIONS, LICENCE_SERVICE_TOKEN } from './licence.constant.js';
import { LicenceGuard } from './licence.guard.js';
import { LicenceService } from './licence.service.js';

/** How {@link LicenceModule.forRootAsync} resolves its options. */
export interface LicenceModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    /** Providers the factory takes, in order — `[ConfigService]` in every real case. */
    inject?: FactoryProvider['inject'];

    // `never[]` rather than `any[]`, for the reason ObjectStorageModule records.
    useFactory: (...args: never[]) => LicenceModuleOptions | Promise<LicenceModuleOptions>;
}

/**
 * Whether a company may use this product, asked of `iveri-billing-api`.
 *
 * **Global**, because the guard, a public page checking a lapsed company and a product counting its seats all ask the
 * same remembered answers; a second instance would be a second cache and a second token.
 *
 * It builds **its own `ServiceTokenService`** from the operator workspace's key rather than reusing the product's: it is
 * a different key, so the one-cache-per-key reason `ServiceTokenModule` is global does not join the two, and sharing
 * one would hand the company's key a platform permission it can never hold.
 *
 * ```ts
 * LicenceModule.forRootAsync({
 *     inject: [ConfigService],
 *     useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
 *         product: IveriProduct.HR,
 *         isEnabled: configService.get('HR_LICENCE_CHECK_ENABLED', { infer: true }) === true,
 *         billingApiUrl: configService.get('BILLING_API_URL', { infer: true }),
 *         billingTimeoutMs: configService.get('BILLING_TIMEOUT_MS', { infer: true }),
 *         cacheSeconds: configService.get('HR_LICENCE_CACHE_SECONDS', { infer: true }),
 *         identityApiUrl: configService.get('IDENTITY_API_URL', { infer: true }),
 *         platformApiKey: configService.get('PLATFORM_API_KEY', { infer: true }),
 *         identityTimeoutMs: configService.get('IDENTITY_TIMEOUT_MS', { infer: true }),
 *         refreshSkewSeconds: configService.get('SERVICE_TOKEN_REFRESH_SKEW_SECONDS', { infer: true }),
 *     }),
 * });
 * ```
 */
@Module({})
export class LicenceModule {
    static forRootAsync(options: LicenceModuleAsyncOptions): DynamicModule {
        return {
            module: LicenceModule,
            global: true,
            imports: [HttpModule, ...(options.imports ?? [])],
            providers: [
                {
                    provide: LICENCE_MODULE_OPTIONS,
                    useFactory: options.useFactory,
                    inject: options.inject ?? [],
                },
                {
                    provide: LICENCE_SERVICE_TOKEN,
                    inject: [LICENCE_MODULE_OPTIONS, HttpService],
                    useFactory: (licenceOptions: LicenceModuleOptions, httpService: HttpService): ServiceTokenService =>
                        new ServiceTokenService(
                            {
                                identityApiUrl: licenceOptions.identityApiUrl,
                                identityApiKey: licenceOptions.platformApiKey,
                                timeoutMs: licenceOptions.identityTimeoutMs,
                                refreshSkewSeconds: licenceOptions.refreshSkewSeconds,
                            },
                            httpService,
                        ),
                },
                BillingLicenceClient,
                LicenceService,
                LicenceGuard,
            ],
            exports: [LicenceService, LicenceGuard],
        };
    }
}
