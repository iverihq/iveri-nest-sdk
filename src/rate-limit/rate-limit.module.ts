import { type DynamicModule, Global, Module } from '@nestjs/common';

import type { RateLimitModuleOptions } from './rate-limit-module-options.interface';
import { RATE_LIMIT_MODULE_OPTIONS } from './rate-limit.constant';
import { RateLimitService } from './rate-limit.service';

/**
 * Provides {@link RateLimitService}.
 *
 * Requires `RedisModule.forRootAsync(...)` to have been registered; the limiter degrades to
 * allowing everything when no Redis is configured, which is deliberate — see the service.
 *
 * `@Global()` so a service can register its guard as an `APP_GUARD` without importing this into
 * every feature module the guard runs in front of, which is all of them.
 *
 * **The guard itself is not here.** How a key is chosen — which route counts against which
 * identity — is the service-specific half, and it is the half worth reading in the service that
 * owns the routes.
 *
 * ```ts
 * RateLimitModule.forRoot({ namespace: 'conduit' });
 * ```
 */
@Global()
@Module({})
export class RateLimitModule {
    static forRoot(options: RateLimitModuleOptions): DynamicModule {
        return {
            module: RateLimitModule,
            providers: [{ provide: RATE_LIMIT_MODULE_OPTIONS, useValue: options }, RateLimitService],
            exports: [RateLimitService],
        };
    }
}
