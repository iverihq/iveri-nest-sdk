import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import type { MetricsModuleOptions } from './metrics-module-options.interface';
import {
    HTTP_DURATION_BUCKETS_SECONDS,
    HTTP_REQUESTS_TOTAL,
    HTTP_REQUEST_DURATION_SECONDS,
    METRICS_MODULE_OPTIONS,
    QUEUE_DEPTH_GAUGE,
    STATUS_CODE_LABEL,
} from './metrics.constant';
import { QUEUE_DEPTH_COLLECTORS, type QueueDepthCollector } from './queue-depth-collector.interface';

/** One request, as recorded by {@link MetricsService.observeHttpRequest}. */
export interface HttpRequestObservation {
    method: string;
    /** The **route pattern** (`/api/v1/captures/:captureId`), never the resolved URL. */
    route: string;
    statusCode: number;
    durationSeconds: number;
}

/** Label names shared by the two HTTP series, so they join cleanly in a query. */
const HTTP_LABEL_NAMES = ['method', 'route', 'status_code'] as const;

/**
 * Owns this process's metric registry and everything registered into it.
 *
 * **The registry is private to the instance, not prom-client's global default.** Two reasons,
 * and the second is the one that bites: a library that registers into the global registry
 * would silently appear in our scrape output, and — more immediately — registering the same
 * metric name twice throws, so a second `MetricsModule` in a test run would fail on import
 * rather than on anything the test was about.
 *
 * **No label here is ever tenant-scoped.** That is a hard rule with two separate justifications
 * that happen to agree:
 *
 * - *Cost.* Every distinct label combination is a stored time series. Tenants are unbounded and
 *   grow with the business, so a `tenant_id` label makes the metric set grow with the customer
 *   list — and it never shrinks, because Prometheus keeps a series for its retention window
 *   after the last write.
 * - *Exposure.* The scrape endpoint is unauthenticated. Keeping tenant identifiers out of it by
 *   construction is what makes that acceptable, rather than something resting on an ingress
 *   rule somebody has to remember to write.
 *
 * Per-tenant questions have a home already: `iveri-billing-api` meters usage per tenant, and
 * every structured log line carries `tenantId`.
 */
@Injectable()
export class MetricsService implements OnApplicationShutdown {
    private readonly logger = new Logger(MetricsService.name);

    private readonly registry = new Registry();

    private readonly httpRequests: Counter<(typeof HTTP_LABEL_NAMES)[number]>;

    private readonly httpDuration: Histogram<(typeof HTTP_LABEL_NAMES)[number]>;

    private readonly queueDepth: Gauge<'queue' | 'state'>;

    constructor(
        @Inject(METRICS_MODULE_OPTIONS) options: MetricsModuleOptions,
        @Inject(QUEUE_DEPTH_COLLECTORS) private readonly queueDepthCollectors: QueueDepthCollector[],
    ) {
        this.registry.setDefaultLabels({ service: options.serviceName, ...options.defaultLabels });

        if (options.collectDefaultMetrics ?? true) {
            collectDefaultMetrics({ register: this.registry });
        }

        this.httpRequests = new Counter({
            name: HTTP_REQUESTS_TOTAL,
            help: 'Total HTTP requests served, by method, route pattern and status code.',
            labelNames: HTTP_LABEL_NAMES,
            registers: [this.registry],
        });

        this.httpDuration = new Histogram({
            name: HTTP_REQUEST_DURATION_SECONDS,
            help: 'HTTP request duration in seconds, by method, route pattern and status code.',
            labelNames: HTTP_LABEL_NAMES,
            buckets: [...HTTP_DURATION_BUCKETS_SECONDS],
            registers: [this.registry],
        });

        this.queueDepth = new Gauge({
            name: QUEUE_DEPTH_GAUGE,
            help: 'Rows still outstanding in a durable work queue, by queue and state.',
            labelNames: ['queue', 'state'],
            registers: [this.registry],
        });
    }

    /** Content type the scrape response must carry, as the registry itself reports it. */
    get contentType(): string {
        return this.registry.contentType;
    }

    /**
     * Renders the whole registry in the Prometheus exposition format.
     *
     * Queue depths are refreshed here rather than through prom-client's per-gauge `collect`
     * hook, so that the one path which produces a scrape is also the one that populates it —
     * there is no way to render a stale gauge by reaching for the registry directly.
     */
    async render(): Promise<string> {
        await this.refreshQueueDepth();

        return this.registry.metrics();
    }

    observeHttpRequest({ method, route, statusCode, durationSeconds }: HttpRequestObservation): void {
        const labels = { method, route, [STATUS_CODE_LABEL]: statusCode };

        this.httpRequests.inc(labels);
        this.httpDuration.observe(labels, durationSeconds);
    }

    /** The underlying registry, for a service that needs to register a metric of its own. */
    getRegistry(): Registry {
        return this.registry;
    }

    /**
     * Re-reads every queue's depth.
     *
     * The gauge is reset first, so a collector that throws leaves **no** series for its queue
     * this scrape rather than the value it last reported. A gap is honest about not knowing;
     * a stale number is a claim that the backlog is fine, and it would be made at exactly the
     * moment the database it could not reach is the reason it is not.
     *
     * One collector failing never fails the scrape. A database blip must not also blind us to
     * heap, event loop and request rate — those are what a scrape is for when a dependency is
     * the thing going wrong.
     */
    private async refreshQueueDepth(): Promise<void> {
        this.queueDepth.reset();

        await Promise.all(this.queueDepthCollectors.map((collector) => this.refreshOne(collector)));
    }

    private async refreshOne(collector: QueueDepthCollector): Promise<void> {
        try {
            const readings = await collector.collect();

            for (const { state, depth } of readings) {
                this.queueDepth.set({ queue: collector.queue, state }, depth);
            }
        } catch (error: unknown) {
            this.logger.warn({
                message: 'Queue depth collection failed — the gauge reports no value for this queue',
                queue: collector.queue,
                error: error instanceof Error ? error.message : 'unknown failure',
            });
        }
    }

    onApplicationShutdown(): void {
        // Stops the default collector's handles and drops the registered metrics, so a process
        // that boots an app more than once — every e2e suite — does not accumulate registries.
        this.registry.clear();
    }
}
