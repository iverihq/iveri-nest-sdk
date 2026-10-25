import { type DynamicModule, type FactoryProvider, Module, type ModuleMetadata } from '@nestjs/common';

import type { ObjectStorageModuleOptions } from './object-storage-module-options.interface';
import { OBJECT_STORAGE_MODULE_OPTIONS } from './object-storage.constant';
import { ObjectStorageService } from './object-storage.service';

/** How {@link ObjectStorageModule.forRootAsync} resolves its options. */
export interface ObjectStorageModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    /** Providers the factory takes, in order — `[ConfigService]` in every real case. */
    inject?: FactoryProvider['inject'];

    // `never[]` rather than `any[]`: a factory of any concrete parameter list is assignable to
    // it, and `any` is banned fleet-wide. The consumer's own annotation is what types it.
    useFactory: (...args: never[]) => ObjectStorageModuleOptions | Promise<ObjectStorageModuleOptions>;
}

/**
 * One service's object bucket.
 *
 * **Not `@Global()`, unlike `RedisModule`.** A service has one Redis connection wanted
 * everywhere, but a bucket belongs to the feature that owns the objects in it — proof photos to
 * delivery's job module, images to a catalogue's — and a second bucket in one service is a
 * realistic future that a global provider would make awkward. Import it where it is used.
 *
 * `forRootAsync` only, deliberately: the bucket and its credentials come from validated
 * configuration in every real case, and a synchronous variant invites reading `process.env` where
 * a module is defined, which is what startup validation exists to prevent.
 *
 * ```ts
 * ObjectStorageModule.forRootAsync({
 *     inject: [ConfigService],
 *     useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
 *         bucket: configService.get('PRODUCT_IMAGE_BUCKET', { infer: true }),
 *         endpoint: configService.get('PRODUCT_IMAGE_ENDPOINT', { infer: true }),
 *         timeoutMs: configService.get('PRODUCT_IMAGE_TIMEOUT_MS', { infer: true }),
 *     }),
 * });
 * ```
 */
@Module({})
export class ObjectStorageModule {
    static forRootAsync(options: ObjectStorageModuleAsyncOptions): DynamicModule {
        return {
            module: ObjectStorageModule,
            imports: options.imports ?? [],
            providers: [
                {
                    provide: OBJECT_STORAGE_MODULE_OPTIONS,
                    useFactory: options.useFactory,
                    inject: options.inject ?? [],
                },
                ObjectStorageService,
            ],
            exports: [ObjectStorageService],
        };
    }
}
