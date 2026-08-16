import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Gauge } from 'prom-client';
import { DataSource } from 'typeorm';

import type { MetricSource } from './metric-source.interface';
import { DATABASE_POOL_GAUGE } from './metrics.constant';
import { MetricsService } from './metrics.service';

/** The three numbers `pg.Pool` keeps, duck-typed off the TypeORM driver. */
interface PoolCounts {
    total: number;
    idle: number;
    waiting: number;
}

/**
 * Reports Postgres connection-pool saturation — §17's "DB connection saturation" alert, which
 * had nothing behind it.
 *
 * **`waiting` is the number that matters.** Anything above zero means requests are queued for a
 * connection, and from outside the process that is indistinguishable from a slow database: the
 * latency graph rises, the query itself is fast, and nothing in the service's own logs explains
 * it. `total` against the pool's configured maximum is what says whether raising the limit is
 * the fix.
 *
 * The pool is reached by **duck-typing the driver**, not by importing `pg`. TypeORM exposes no
 * public accessor for it, and a type-level dependency on the driver package would drag it into
 * the SDK's public surface for three integers. If the shape ever changes, this reports nothing
 * rather than throwing — a metric that disappears is a much smaller problem than a scrape that
 * fails, and `MetricsService` is what makes that distinction visible.
 */
@Injectable()
export class DatabasePoolMetricSource implements MetricSource {
    readonly name = 'database-pool';

    private readonly connections: Gauge<'state'>;

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        metricsService: MetricsService,
    ) {
        this.connections = metricsService.gauge({
            name: DATABASE_POOL_GAUGE,
            help: 'Postgres connections held by this process, by state.',
            labelNames: ['state'],
        });
    }

    refresh(): void {
        const counts = this.readPoolCounts();

        if (!counts) {
            // Absent rather than zero. Zero idle connections and "we cannot see the pool" are
            // very different claims, and only one of them should be alertable.
            this.connections.reset();

            return;
        }

        this.connections.set({ state: 'total' }, counts.total);
        this.connections.set({ state: 'idle' }, counts.idle);
        // Derived rather than read: `pg.Pool` counts a connection as idle or checked out, and
        // the difference is the one an application actually holds.
        this.connections.set({ state: 'in_use' }, counts.total - counts.idle);
        this.connections.set({ state: 'waiting' }, counts.waiting);
    }

    private readPoolCounts(): PoolCounts | undefined {
        const pool: unknown = Reflect.get(this.dataSource.driver, 'master');

        if (typeof pool !== 'object' || pool === null) {
            return undefined;
        }

        const total = DatabasePoolMetricSource.readNumber(pool, 'totalCount');
        const idle = DatabasePoolMetricSource.readNumber(pool, 'idleCount');
        const waiting = DatabasePoolMetricSource.readNumber(pool, 'waitingCount');

        if (total === undefined || idle === undefined || waiting === undefined) {
            return undefined;
        }

        return { total, idle, waiting };
    }

    private static readNumber(source: object, property: string): number | undefined {
        const value: unknown = Reflect.get(source, property);

        return typeof value === 'number' ? value : undefined;
    }
}
