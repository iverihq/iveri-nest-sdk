import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
    Counter,
    type CounterConfiguration,
    Gauge,
    type GaugeConfiguration,
    Histogram,
    type HistogramConfiguration,
    Registry,
    collectDefaultMetrics,
} from 'prom-client';

import { METRIC_SOURCES, type MetricSource } from './metric-source.interface';
import type { MetricsModuleOptions } from './metrics-module-options.interface';
import {
    HTTP_DURATION_BUCKETS_SECONDS,
    HTTP_REQUESTS_IN_FLIGHT,
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

    private readonly httpInFlight: Gauge<string>;

    private readonly queueDepth: Gauge<'queue' | 'state'>;

    constructor(
        @Inject(METRICS_MODULE_OPTIONS) options: MetricsModuleOptions,
        @Inject(QUEUE_DEPTH_COLLECTORS) private readonly queueDepthCollectors: QueueDepthCollector[],
        @Inject(METRIC_SOURCES) private readonly metricSources: MetricSource[],
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

        this.httpInFlight = new Gauge({
            name: HTTP_REQUESTS_IN_FLIGHT,
            help: 'Requests currently being served.',
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
        await Promise.all([this.refreshQueueDepth(), this.refreshSources()]);

        return this.registry.metrics();
    }

    observeHttpRequest({ method, route, statusCode, durationSeconds }: HttpRequestObservation): void {
        const labels = { method, route, [STATUS_CODE_LABEL]: statusCode };

        this.httpRequests.inc(labels);
        this.httpDuration.observe(labels, durationSeconds);
    }

    /** Requests currently being served, incremented on entry and decremented when they end. */
    trackRequestStarted(): void {
        this.httpInFlight.inc();
    }

    trackRequestFinished(): void {
        this.httpInFlight.dec();
    }

    /**
     * Registers a domain counter — something that only ever goes up, like messages sent or
     * signatures rejected.
     *
     * These factories exist so a feature can own a metric without importing `prom-client` and
     * without reaching for {@link getRegistry}, which is the version of this that ends with ten
     * services each registering into a registry slightly differently.
     *
     * **The name and label set are a contract.** Alert rules and dashboards are written against
     * them, so renaming one silently empties a graph rather than breaking a build. The same
     * cardinality rule as everywhere else applies to the labels: nothing tenant-scoped, nothing
     * carrying an id, nothing a caller can vary freely.
     *
     * Registering the same name twice throws, deliberately — it means two features believe they
     * own one metric, and the values would interleave.
     */
    counter<TLabel extends string>(configuration: CounterConfiguration<TLabel>): Counter<TLabel> {
        return new Counter({ ...configuration, registers: [this.registry] });
    }

    /** Registers a domain gauge — something that goes up and down, like open connections. */
    gauge<TLabel extends string>(configuration: GaugeConfiguration<TLabel>): Gauge<TLabel> {
        return new Gauge({ ...configuration, registers: [this.registry] });
    }

    /**
     * Registers a domain histogram — a distribution, like provider response time.
     *
     * Every bucket is a stored series per label combination, so keep the bucket list short and
     * chosen for the thing being measured rather than copied from the HTTP one.
     */
    histogram<TLabel extends string>(configuration: HistogramConfiguration<TLabel>): Histogram<TLabel> {
        return new Histogram({ ...configuration, registers: [this.registry] });
    }

    /** The underlying registry, for the rare case the factories above do not cover. */
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

    /** Samples every {@link MetricSource}, with the same isolation queue depth gets. */
    private async refreshSources(): Promise<void> {
        await Promise.all(
            this.metricSources.map(async (source) => {
                try {
                    await source.refresh();
                } catch (error: unknown) {
                    this.logger.warn({
                        message: 'Metric source refresh failed — its series are absent from this scrape',
                        source: source.name,
                        error: error instanceof Error ? error.message : 'unknown failure',
                    });
                }
            }),
        );
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
