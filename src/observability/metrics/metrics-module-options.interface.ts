import type { ModuleMetadata, Type } from '@nestjs/common';

import type { QueueDepthCollector } from './queue-depth-collector.interface';

/** How a service configures metrics collection. */
export interface MetricsModuleOptions {
    /**
     * Value of the `service` label attached to every series this process emits, e.g.
     * `conduit-api`.
     *
     * A fact about the codebase rather than the environment, so pass a constant. Prometheus
     * also adds its own `job` label per scrape target, but that one is chosen by whoever wrote
     * the scrape config, and the two disagreeing is a question nobody can answer from the
     * metric alone.
     */
    serviceName: string;

    /**
     * Extra labels attached to every series.
     *
     * **Nothing unbounded belongs here.** A label's cardinality multiplies the whole metric
     * set, so a tenant id, user id or version-per-deploy string turns one series into as many
     * series as there are distinct values — permanently, since Prometheus keeps them for the
     * retention window whether or not they are still being written.
     */
    defaultLabels?: Record<string, string>;

    /**
     * Collect Node and process metrics — heap, event loop lag, GC, file descriptors, CPU.
     * Defaults to `true`.
     *
     * Worth leaving on: they are the metrics that explain a latency graph, and they cost one
     * collection per scrape. Specs turn them off to keep expected output small.
     */
    collectDefaultMetrics?: boolean;

    /**
     * Repositories to resolve as {@link QueueDepthCollector}s, feeding the queue-depth gauge.
     *
     * A service with no durable work queue passes nothing and the gauge is simply never
     * populated.
     */
    queueDepthCollectors?: Type<QueueDepthCollector>[];

    /**
     * Request paths excluded from the HTTP metrics, matched by prefix. Defaults to the probe
     * and scrape routes.
     *
     * Pass this to *extend* the defaults, not to replace them — spread
     * `DEFAULT_IGNORED_METRICS_ROUTES` into whatever you add.
     */
    ignoredRoutes?: readonly string[];

    /** Modules exporting anything the queue-depth collectors inject. */
    imports?: ModuleMetadata['imports'];
}
