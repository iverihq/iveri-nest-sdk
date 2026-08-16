import {
    type DynamicModule,
    Global,
    type MiddlewareConsumer,
    Module,
    type NestModule,
    type Provider,
    type Type,
} from '@nestjs/common';

import { HttpMetricsMiddleware } from './http-metrics.middleware';
import type { MetricsModuleOptions } from './metrics-module-options.interface';
import { METRICS_MODULE_OPTIONS } from './metrics.constant';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { QUEUE_DEPTH_COLLECTORS, type QueueDepthCollector } from './queue-depth-collector.interface';

/**
 * Registers `GET /metrics` and starts counting HTTP traffic.
 *
 * ```ts
 * MetricsModule.forRoot({
 *     serviceName: 'conduit-api',
 *     queueDepthCollectors: [DeliveryRepository, DispatchRepository],
 *     imports: [DeliveryModule, DispatchModule],
 * });
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
 * `forRoot` rather than `forRootAsync`, unlike `RedisModule`: nothing here comes from the
 * environment. The service name is a constant, and whether metrics are *scraped* is a property
 * of the deployment, not something the process needs to be told.
 */
@Global()
@Module({})
export class MetricsModule implements NestModule {
    static forRoot(options: MetricsModuleOptions): DynamicModule {
        const collectors = options.queueDepthCollectors ?? [];

        return {
            module: MetricsModule,
            imports: options.imports ?? [],
            controllers: [MetricsController],
            providers: [
                { provide: METRICS_MODULE_OPTIONS, useValue: options },
                ...collectors,
                MetricsModule.collect(collectors),
                MetricsService,
                HttpMetricsMiddleware,
            ],
            exports: [MetricsService],
        };
    }

    /**
     * Collects resolved collector instances into the array {@link MetricsService} injects.
     *
     * Nest has no native multi-provider, so they are injected positionally and gathered by a
     * factory — the same arrangement `HealthModule` uses for its checks, and worth keeping
     * identical so that reading one explains the other.
     */
    private static collect(collectors: Type<QueueDepthCollector>[]): Provider {
        return {
            provide: QUEUE_DEPTH_COLLECTORS,
            useFactory: (...resolved: QueueDepthCollector[]): QueueDepthCollector[] => resolved,
            inject: collectors,
        };
    }

    configure(consumer: MiddlewareConsumer): void {
        // Every route, including the ones excluded from the global prefix. What is *not*
        // measured is decided in one place — `ignoredRoutes` — rather than by which paths this
        // matcher happens to reach.
        consumer.apply(HttpMetricsMiddleware).forRoutes('*');
    }
}
