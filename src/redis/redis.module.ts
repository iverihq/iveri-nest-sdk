import { type DynamicModule, type FactoryProvider, Global, Module, type ModuleMetadata } from '@nestjs/common';

import type { RedisModuleOptions } from './redis-module-options.interface';
import { REDIS_MODULE_OPTIONS } from './redis.constant';
import { RedisService } from './redis.service';

/** How {@link RedisModule.forRootAsync} resolves its options. */
export interface RedisModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    /** Providers the factory takes, in order — `[ConfigService]` in every real case. */
    inject?: FactoryProvider['inject'];

    // `never[]` rather than `any[]`: a factory of any concrete parameter list is assignable to
    // it, and `any` is banned fleet-wide. The consumer's own annotation is what types it.
    useFactory: (...args: never[]) => RedisModuleOptions | Promise<RedisModuleOptions>;
}

/**
 * Owns the Redis connection, the way a service's `DatabaseModule` owns the Postgres one.
 *
 * `@Global()` for the same reason: one connection per process, wanted by unrelated modules, and
 * threading an import through each of them adds a line everywhere and expresses nothing.
 *
 * **`forRootAsync` only, deliberately — there is no `forRoot`.** The URL comes from validated
 * configuration in every real case, and a synchronous variant invites reading `process.env`
 * where a module is defined, which is exactly what startup validation exists to prevent.
 *
 * ```ts
 * RedisModule.forRootAsync({
 *     inject: [ConfigService],
 *     useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
 *         url: configService.get('REDIS_URL', { infer: true }),
 *         commandTimeoutMs: configService.get('REDIS_COMMAND_TIMEOUT_MS', { infer: true }),
 *     }),
 * });
 * ```
 */
@Global()
@Module({})
export class RedisModule {
    static forRootAsync(options: RedisModuleAsyncOptions): DynamicModule {
        return {
            module: RedisModule,
            imports: options.imports ?? [],
            providers: [
                {
                    provide: REDIS_MODULE_OPTIONS,
                    useFactory: options.useFactory,
                    inject: options.inject ?? [],
                },
                RedisService,
            ],
            exports: [RedisService],
        };
    }
}
