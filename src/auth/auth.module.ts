import { type DynamicModule, Global, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AccessTokenService } from './access-token.service';
import type { AuthModuleAsyncOptions, AuthModuleOptions } from './auth-module-options.interface';

/** Injection token for the resolved {@link AuthModuleOptions}. */
export const AUTH_MODULE_OPTIONS = 'IVERI_AUTH_MODULE_OPTIONS';

/**
 * Provides {@link AccessTokenService} for a service that **verifies** `iveri-identity-api`
 * tokens.
 *
 * `@Global()` so a service can register {@link AuthGuard} as an `APP_GUARD` in its root module
 * without importing this into every feature module the guard runs in front of — which is all of
 * them.
 *
 * **The guards are exported as classes and registered by the service, not by this module.** Guard
 * *order* is a service-level decision with real consequences: `conduit-api` puts its rate limiter
 * between authentication and authorization, deliberately, so a caller hammering a route they have
 * no permission for is slowed down rather than merely refused. A module that registered its own
 * `APP_GUARD` would take that decision away and make it invisible.
 *
 * ```ts
 * AuthModule.forRootAsync({
 *     inject: [ConfigService],
 *     useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
 *         secret: configService.get('JWT_SECRET', { infer: true }),
 *         issuer: configService.get('JWT_ISSUER', { infer: true }),
 *         audience: configService.get('JWT_AUDIENCE', { infer: true }),
 *     }),
 * });
 * ```
 */
@Global()
@Module({})
export class AuthModule {
    static forRoot(options: AuthModuleOptions): DynamicModule {
        return AuthModule.build({ provide: AUTH_MODULE_OPTIONS, useValue: options });
    }

    static forRootAsync(options: AuthModuleAsyncOptions): DynamicModule {
        return AuthModule.build(
            {
                provide: AUTH_MODULE_OPTIONS,
                inject: options.inject ?? [],
                useFactory: options.useFactory,
            },
            options.imports,
        );
    }

    /**
     * `JwtService` is constructed here rather than through `JwtModule.registerAsync`.
     *
     * One factory instead of a factory wrapping a factory, and it keeps the whole configuration
     * surface in `AuthModuleOptions` — which is what makes "there is no way to sign a token with
     * this module" checkable by reading one interface.
     */
    private static build(
        optionsProvider: NonNullable<DynamicModule['providers']>[number],
        imports?: unknown[],
    ): DynamicModule {
        return {
            module: AuthModule,
            imports: (imports ?? []) as DynamicModule['imports'],
            providers: [
                optionsProvider,
                {
                    provide: JwtService,
                    inject: [AUTH_MODULE_OPTIONS],
                    useFactory: (options: AuthModuleOptions): JwtService =>
                        new JwtService({
                            secret: options.secret,
                            // Verification options only. `signOptions` is deliberately absent
                            // even though `JwtService` accepts it: with no signing defaults
                            // configured, a service that grew a `sign()` call would have to
                            // state every claim itself rather than inheriting identity's — which
                            // makes the mistake visible in review instead of producing a token
                            // that looks authentic.
                            verifyOptions: { issuer: options.issuer, audience: options.audience },
                        }),
                },
                AccessTokenService,
            ],
            exports: [AccessTokenService],
        } satisfies DynamicModule;
    }
}
