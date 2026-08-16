import { Test } from '@nestjs/testing';

import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';
import type { QueueDepthCollector, QueueDepthReading } from './queue-depth-collector.interface';

const build = async (module: ReturnType<typeof MetricsModule.forRoot>) => {
    const testingModule = await Test.createTestingModule({ imports: [module] }).compile();

    return {
        service: testingModule.get(MetricsService),
        controller: testingModule.get(MetricsController),
    };
};

const collector = (queue: string, readings: QueueDepthReading[]): QueueDepthCollector => ({
    queue,
    collect: (): Promise<QueueDepthReading[]> => Promise.resolve(readings),
});

describe('MetricsModule', () => {
    it('registers the controller and the service', async () => {
        const { service, controller } = await build(
            MetricsModule.forRoot({ serviceName: 'conduit-api', collectDefaultMetrics: false }),
        );

        expect(controller).toBeInstanceOf(MetricsController);
        expect(service).toBeInstanceOf(MetricsService);
    });

    it('compiles without importing anything', async () => {
        // The whole point of the registration model. `MetricsModule` is `@Global()`, so Nest
        // adds it to every module's context — a version of it that imported feature modules sat
        // on both sides of a cycle, and Nest does not report that. It hangs inside `compile()`
        // until the caller times out, with nothing logged. This spec would time out if that
        // shape ever came back.
        await expect(
            build(MetricsModule.forRoot({ serviceName: 'conduit-api', collectDefaultMetrics: false })),
        ).resolves.toBeDefined();
    });

    it('renders queues a feature registered after boot', async () => {
        const { service } = await build(
            MetricsModule.forRoot({ serviceName: 'conduit-api', collectDefaultMetrics: false }),
        );

        service.registerQueueDepthCollector(collector('delivery', [{ state: 'pending', depth: 2 }]));
        service.registerQueueDepthCollector(collector('dispatch', [{ state: 'dead_lettered', depth: 1 }]));

        const output = await service.render();

        expect(output).toContain('iveri_queue_depth{queue="delivery",state="pending"');
        expect(output).toContain('iveri_queue_depth{queue="dispatch",state="dead_lettered"');
    });

    it('renders nothing for a service that registered no queue', async () => {
        const { service } = await build(
            MetricsModule.forRoot({ serviceName: 'iveri-identity-api', collectDefaultMetrics: false }),
        );

        expect(await service.render()).not.toContain('iveri_queue_depth{');
    });
});
