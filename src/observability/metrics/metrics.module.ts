import { type DynamicModule, Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { HttpMetricsMiddleware } from './http-metrics.middleware';
import type { MetricsModuleOptions } from './metrics-module-options.interface';
import { METRICS_MODULE_OPTIONS } from './metrics.constant';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Registers `GET /metrics` and starts counting HTTP traffic.
 *
 * ```ts
 * MetricsModule.forRoot({ serviceName: 'conduit-api' });
 * ```
 *
 * **The middleware is applied here, not by the consuming service.** Every service wants it on
 * every route, so leaving the wiring to each `AppModule` would add an identical block to ten
 * files whose only possible variation is being forgotten — and a service missing it looks
 * healthy in exactly the way an unmonitored service looks healthy.
 *
 * `@Global()` so `MetricsService` is injectable wherever a feature wants a metric of its own,
 * without every module importing this one.
 *
 * **This module deliberately takes no `imports` and no list of collectors.** Being global means
 * Nest adds it to every module's context, so importing a feature module here would put it on
 * both sides of a cycle — and Nest does not report that, it hangs forever inside `compile()`.
 * A feature that owns a queue calls `MetricsService.registerQueueDepthCollector` instead, which
 * also keeps the dependency pointing the way a shared package needs it to.
 *
 * `forRoot` rather than `forRootAsync`, unlike `RedisModule`: nothing here comes from the
 * environment. The service name is a constant, and whether metrics are *scraped* is a property
 * of the deployment, not something the process needs to be told.
 */
@Global()
@Module({})
export class MetricsModule implements NestModule {
    static forRoot(options: MetricsModuleOptions): DynamicModule {
        return {
            module: MetricsModule,
            controllers: [MetricsController],
            providers: [{ provide: METRICS_MODULE_OPTIONS, useValue: options }, MetricsService, HttpMetricsMiddleware],
            exports: [MetricsService],
        };
    }

    configure(consumer: MiddlewareConsumer): void {
        // Every route, including the ones excluded from the global prefix. What is *not*
        // measured is decided in one place — `ignoredRoutes` — rather than by which paths this
        // matcher happens to reach.
        consumer.apply(HttpMetricsMiddleware).forRoutes('*');
    }
}
