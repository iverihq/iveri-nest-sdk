import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';
import {
    QUEUE_DEPTH_COLLECTORS,
    type QueueDepthCollector,
    type QueueDepthReading,
} from './queue-depth-collector.interface';

@Injectable()
class DeliveryRepository implements QueueDepthCollector {
    readonly queue = 'delivery';

    collect(): Promise<QueueDepthReading[]> {
        return Promise.resolve([{ state: 'pending', depth: 2 }]);
    }
}

@Injectable()
class DispatchRepository implements QueueDepthCollector {
    readonly queue = 'dispatch';

    collect(): Promise<QueueDepthReading[]> {
        return Promise.resolve([{ state: 'dead_lettered', depth: 1 }]);
    }
}

interface Clock {
    depth: () => number;
}

const CLOCK = Symbol('CLOCK');

@Module({
    providers: [{ provide: CLOCK, useValue: { depth: (): number => 9 } satisfies Clock }],
    exports: [CLOCK],
})
class ClockModule {}

@Injectable()
class NotificationRepository implements QueueDepthCollector {
    readonly queue = 'notification-delivery';

    constructor(@Inject(CLOCK) private readonly clock: Clock) {}

    collect(): Promise<QueueDepthReading[]> {
        return Promise.resolve([{ state: 'pending', depth: this.clock.depth() }]);
    }
}

const build = async (module: ReturnType<typeof MetricsModule.forRoot>) => {
    const testingModule = await Test.createTestingModule({ imports: [module] }).compile();

    return {
        collectors: testingModule.get<QueueDepthCollector[]>(QUEUE_DEPTH_COLLECTORS),
        service: testingModule.get(MetricsService),
        controller: testingModule.get(MetricsController),
    };
};

describe('MetricsModule', () => {
    it('registers the controller with no collectors by default', async () => {
        const { collectors, controller } = await build(
            MetricsModule.forRoot({ serviceName: 'conduit-api', collectDefaultMetrics: false }),
        );

        expect(collectors).toEqual([]);
        expect(controller).toBeInstanceOf(MetricsController);
    });

    it('resolves queue depth collectors through DI and preserves their order', async () => {
        const { collectors } = await build(
            MetricsModule.forRoot({
                serviceName: 'conduit-api',
                collectDefaultMetrics: false,
                queueDepthCollectors: [DeliveryRepository, DispatchRepository],
            }),
        );

        expect(collectors.map((collector) => collector.queue)).toEqual(['delivery', 'dispatch']);
    });

    it('feeds the resolved collectors into the rendered scrape', async () => {
        const { service } = await build(
            MetricsModule.forRoot({
                serviceName: 'conduit-api',
                collectDefaultMetrics: false,
                queueDepthCollectors: [DeliveryRepository, DispatchRepository],
            }),
        );

        const output = await service.render();

        expect(output).toContain('iveri_queue_depth{queue="delivery",state="pending"');
        expect(output).toContain('iveri_queue_depth{queue="dispatch",state="dead_lettered"');
    });

    it('imports modules the collectors depend on', async () => {
        const { service } = await build(
            MetricsModule.forRoot({
                serviceName: 'iveri-notification-api',
                collectDefaultMetrics: false,
                queueDepthCollectors: [NotificationRepository],
                imports: [ClockModule],
            }),
        );

        expect(await service.render()).toContain(
            'iveri_queue_depth{queue="notification-delivery",state="pending",service="iveri-notification-api"} 9',
        );
    });
});
