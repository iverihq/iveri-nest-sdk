import type { MetricsModuleOptions } from './metrics-module-options.interface';
import { MetricsService } from './metrics.service';
import type { QueueDepthCollector, QueueDepthReading } from './queue-depth-collector.interface';

const OPTIONS: MetricsModuleOptions = { serviceName: 'conduit-api', collectDefaultMetrics: false };

const build = (options: Partial<MetricsModuleOptions> = {}, collectors: QueueDepthCollector[] = []): MetricsService =>
    new MetricsService({ ...OPTIONS, ...options }, collectors);

/** A collector that answers as told and counts how often it was asked. */
const stubCollector = (
    queue: string,
    result: QueueDepthReading[] | Error,
): QueueDepthCollector & { calls: () => number } => {
    let calls = 0;

    return {
        queue,
        calls: () => calls,
        collect: (): Promise<QueueDepthReading[]> => {
            calls += 1;

            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
    };
};

/** Parses the exposition format into the sample lines of one metric, ignoring HELP and TYPE. */
const samplesOf = (output: string, metric: string): string[] =>
    output
        .split('\n')
        .filter((line) => line.startsWith(`${metric}{`) || line === metric || line.startsWith(`${metric} `));

describe('MetricsService', () => {
    describe('registry isolation', () => {
        it('gives each instance its own registry', async () => {
            // Against prom-client's global default registry the *second* instance would throw on
            // construction with a duplicate-metric error, so every e2e suite that boots an app
            // twice would fail on import rather than on anything it was testing.
            const first = build();
            const second = build();

            first.observeHttpRequest({ method: 'GET', route: '/api/v1/captures', statusCode: 200, durationSeconds: 1 });

            expect(samplesOf(await first.render(), 'http_server_requests_total')).toHaveLength(1);
            expect(samplesOf(await second.render(), 'http_server_requests_total')).toHaveLength(0);
        });

        it('labels every series with the service name', async () => {
            const service = build();

            service.observeHttpRequest({
                method: 'GET',
                route: '/api/v1/captures',
                statusCode: 200,
                durationSeconds: 1,
            });

            expect(await service.render()).toContain('service="conduit-api"');
        });

        it('takes extra default labels', async () => {
            const service = build({ defaultLabels: { region: 'eu-central-1' } });

            service.observeHttpRequest({
                method: 'GET',
                route: '/api/v1/captures',
                statusCode: 200,
                durationSeconds: 1,
            });

            expect(await service.render()).toContain('region="eu-central-1"');
        });
    });

    describe('HTTP observations', () => {
        it('counts and times a request under the same labels', async () => {
            const service = build();

            service.observeHttpRequest({
                method: 'POST',
                route: '/api/v1/dispatches',
                statusCode: 202,
                durationSeconds: 0.03,
            });

            const output = await service.render();

            // The two series must carry identical labels, or a query joining rate and latency
            // silently returns nothing.
            expect(output).toContain('http_server_requests_total{method="POST",route="/api/v1/dispatches"');
            expect(output).toContain('status_code="202"');
            expect(output).toContain('http_server_request_duration_seconds_bucket{le="0.05"');
        });

        it('keeps one series per label combination rather than per observation', async () => {
            const service = build();

            for (let index = 0; index < 5; index += 1) {
                service.observeHttpRequest({
                    method: 'GET',
                    route: '/api/v1/captures/:captureId',
                    statusCode: 200,
                    durationSeconds: 0.01,
                });
            }

            const counted = samplesOf(await service.render(), 'http_server_requests_total');

            expect(counted).toHaveLength(1);
            expect(counted[0]).toContain(' 5');
        });
    });

    describe('queue depth', () => {
        it('reports every state a collector returns', async () => {
            const service = build({}, [
                stubCollector('delivery', [
                    { state: 'pending', depth: 12 },
                    { state: 'dead_lettered', depth: 3 },
                ]),
            ]);

            const output = await service.render();

            expect(output).toContain('iveri_queue_depth{queue="delivery",state="pending"');
            expect(output).toContain('iveri_queue_depth{queue="delivery",state="dead_lettered"');
            expect(output).toContain(' 3');
        });

        it('re-reads on every scrape rather than caching', async () => {
            // The gauge must not go stale when the processor stops, which is the moment the
            // number is worth looking at.
            const collector = stubCollector('delivery', [{ state: 'pending', depth: 1 }]);
            const service = build({}, [collector]);

            await service.render();
            await service.render();

            expect(collector.calls()).toBe(2);
        });

        it('drops a queue from the output when its collector fails', async () => {
            const service = build({}, [stubCollector('delivery', new Error('connection refused'))]);

            // Absent, not stale. A leftover value is a claim that the backlog is fine, made by
            // the one component that just proved it cannot see the backlog.
            expect(samplesOf(await service.render(), 'iveri_queue_depth')).toHaveLength(0);
        });

        it('still renders the rest of the scrape when a collector fails', async () => {
            const service = build({}, [
                stubCollector('delivery', new Error('connection refused')),
                stubCollector('dispatch', [{ state: 'pending', depth: 7 }]),
            ]);

            const output = await service.render();

            // A database blip must not also blind us to heap, event loop and request rate.
            expect(output).toContain('iveri_queue_depth{queue="dispatch",state="pending"');
            expect(output).not.toContain('queue="delivery"');
        });

        it('clears a stale reading when a later scrape no longer reports that state', async () => {
            let readings: QueueDepthReading[] = [{ state: 'dead_lettered', depth: 4 }];
            const service = build({}, [
                { queue: 'delivery', collect: (): Promise<QueueDepthReading[]> => Promise.resolve(readings) },
            ]);

            await service.render();
            readings = [{ state: 'pending', depth: 0 }];

            // Without the reset in `refreshQueueDepth` the dead-letter series would persist at 4
            // forever and hold a page open on a queue that has since been drained.
            expect(await service.render()).not.toContain('state="dead_lettered"');
        });
    });

    describe('exposition', () => {
        it('reports the registry content type rather than a hardcoded one', () => {
            expect(build().contentType).toContain('text/plain');
        });

        it('collects default process metrics when asked', async () => {
            const service = build({ collectDefaultMetrics: true });

            expect(await service.render()).toContain('process_cpu_user_seconds_total');
        });

        it('empties the registry on shutdown', async () => {
            const service = build();

            service.observeHttpRequest({
                method: 'GET',
                route: '/api/v1/captures',
                statusCode: 200,
                durationSeconds: 1,
            });
            service.onApplicationShutdown();

            expect((await service.render()).trim()).toBe('');
        });
    });
});
