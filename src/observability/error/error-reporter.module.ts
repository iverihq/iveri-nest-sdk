import { type DynamicModule, type FactoryProvider, Global, Module, type ModuleMetadata } from '@nestjs/common';

import type { ErrorReporterModuleOptions } from './error-reporter-module-options.interface';
import { ERROR_REPORTER_MODULE_OPTIONS } from './error-reporter.constant';
import { ErrorReporterService } from './error-reporter.service';

/** How {@link ErrorReporterModule.forRootAsync} resolves its options. */
export interface ErrorReporterModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    /** Providers the factory takes, in order — `[ConfigService]` in every real case. */
    inject?: FactoryProvider['inject'];

    // `never[]` rather than `any[]`, matching `RedisModule`: a factory of any concrete parameter
    // list is assignable to it, and `any` is banned fleet-wide.
    useFactory: (...args: never[]) => ErrorReporterModuleOptions | Promise<ErrorReporterModuleOptions>;
}

/**
 * Provides {@link ErrorReporterService}.
 *
 * `forRootAsync` only, for the reason `RedisModule` has no synchronous variant: the DSN comes
 * from validated configuration, and a `forRoot` invites reading `process.env` where a module is
 * defined — which is exactly what startup validation exists to prevent.
 *
 * `@Global()` so a processor can report a dead letter without importing this into its feature
 * module.
 *
 * ```ts
 * ErrorReporterModule.forRootAsync({
 *     inject: [ConfigService],
 *     useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
 *         dsn: configService.get('SENTRY_DSN', { infer: true }),
 *         environment: configService.get('NODE_ENV', { infer: true }),
 *         release: configService.get('RELEASE', { infer: true }),
 *         serviceName: 'conduit-api',
 *     }),
 * });
 * ```
 *
 * Registering it does **not** by itself report anything from an HTTP failure — pass the
 * resolved service to `GlobalExceptionFilter` as its `reporter`, which is where the decision
 * about *which* failures are worth reporting lives.
 */
@Global()
@Module({})
export class ErrorReporterModule {
    static forRootAsync(options: ErrorReporterModuleAsyncOptions): DynamicModule {
        return {
            module: ErrorReporterModule,
            imports: options.imports ?? [],
            providers: [
                {
                    provide: ERROR_REPORTER_MODULE_OPTIONS,
                    useFactory: options.useFactory,
                    inject: options.inject ?? [],
                },
                ErrorReporterService,
            ],
            exports: [ErrorReporterService],
        };
    }
}
