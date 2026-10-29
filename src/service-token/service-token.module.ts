import { HttpModule } from '@nestjs/axios';
import { type DynamicModule, type FactoryProvider, Module, type ModuleMetadata } from '@nestjs/common';

import type { ServiceTokenModuleOptions } from './service-token-module-options.interface';
import { SERVICE_TOKEN_MODULE_OPTIONS } from './service-token.constant';
import { ServiceTokenService } from './service-token.service';

/** How {@link ServiceTokenModule.forRootAsync} resolves its options. */
export interface ServiceTokenModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    /** Providers the factory takes, in order — `[ConfigService]` in every real case. */
    inject?: FactoryProvider['inject'];

    // `never[]` rather than `any[]`, for the reason ObjectStorageModule records.
    useFactory: (...args: never[]) => ServiceTokenModuleOptions | Promise<ServiceTokenModuleOptions>;
}

/**
 * One deployment's credential with `iveri-identity-api`.
 *
 * **`@Global()`, unlike `ObjectStorageModule`**, and the difference is real: a bucket belongs to
 * the feature that owns the objects in it, while there is exactly one identity credential per
 * deployment and a second instance would be a second cache. That matters rather than being
 * untidy — two caches mint two tokens from one API key, doubling the exchanges identity sees and
 * halving the value of the single-flight guard. `commerce-api` records reaching the same
 * conclusion about its own client the moment a second consumer appeared.
 *
 * `forRootAsync` only, deliberately: the URL and the key come from validated configuration in
 * every real case, and a synchronous variant invites reading `process.env` where a module is
 * defined, which is what startup validation exists to prevent.
 *
 * ```ts
 * ServiceTokenModule.forRootAsync({
 *     inject: [ConfigService],
 *     useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
 *         identityApiUrl: configService.get('IDENTITY_API_URL', { infer: true }),
 *         identityApiKey: configService.get('IDENTITY_API_KEY', { infer: true }),
 *         timeoutMs: configService.get('IDENTITY_TIMEOUT_MS', { infer: true }),
 *         refreshSkewSeconds: configService.get('SERVICE_TOKEN_REFRESH_SKEW_SECONDS', { infer: true }),
 *     }),
 * });
 * ```
 */
@Module({})
export class ServiceTokenModule {
    static forRootAsync(options: ServiceTokenModuleAsyncOptions): DynamicModule {
        return {
            module: ServiceTokenModule,
            global: true,
            // Imported here rather than required of the consumer: the HTTP client is this
            // module's own plumbing, and a consumer that forgot it would get a resolution error
            // naming HttpService rather than anything about a credential.
            imports: [HttpModule, ...(options.imports ?? [])],
            providers: [
                {
                    provide: SERVICE_TOKEN_MODULE_OPTIONS,
                    useFactory: options.useFactory,
                    inject: options.inject ?? [],
                },
                ServiceTokenService,
            ],
            exports: [ServiceTokenService],
        };
    }
}
