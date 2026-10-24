import { Injectable } from '@nestjs/common';
import type { Counter, Gauge } from 'prom-client';

import {
    RETENTION_SWEEP_LABEL,
    RETENTION_SWEEP_LAST_SUCCESS_GAUGE,
    RETENTION_SWEEP_ROWS_TOTAL,
} from './metrics.constant';
import { MetricsService } from './metrics.service';

/** Milliseconds per second, for converting a JavaScript clock to the Prometheus base unit. */
const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Reports whether each retention sweep is still running, and how much it expires.
 *
 * **The gap this closes is that a sweep's tests prove it works and nothing proves it runs.** Every
 * retention sweep in this fleet is an `@Cron` method with e2e coverage against real PostgreSQL —
 * and if `ScheduleModule.forRoot()` were dropped from a service, or the method threw on every
 * pass, the data would simply accumulate and no alert would fire. The retention promise becomes
 * quietly false, which is the failure shape the fleet's own observability reasoning keeps naming:
 * a control nothing watches is a control nobody notices failing.
 *
 * **One service in the SDK rather than a gauge per repository.** `MetricsService` already exposes
 * `counter()` and `gauge()` factories, and six services reaching for them would produce six
 * nearly-identical names — exactly the outcome those factories' own documentation warns about. An
 * alert rule generic over the `sweep` label covers every service at once, the way the three
 * queue-depth rules already do, so adding a seventh sweep needs no `iveri-infra` change.
 *
 * **Registration happens in the owning service's constructor**, which is also where the fleet's
 * other domain metrics seed their series. Passing the sweep names to `MetricsModule.forRoot`
 * instead would put the global metrics module on both sides of a dependency cycle, which Nest does
 * not report — it hangs inside `compile()` with nothing logged.
 *
 * Usage, from a retention service:
 *
 * ```ts
 * constructor(private readonly sweepMetrics: RetentionSweepMetrics) {
 *     this.sweepMetrics.register(SWEEP);
 * }
 *
 * @Cron(CronExpression.EVERY_HOUR, { name: '…' })
 * async sweep(): Promise<number> {
 *     const removed = await this.work();
 *     this.sweepMetrics.recordSuccess({ sweep: SWEEP, rows: removed });
 *     return removed;
 * }
 * ```
 */
@Injectable()
export class RetentionSweepMetrics {
    private readonly lastSuccess: Gauge<typeof RETENTION_SWEEP_LABEL>;

    private readonly rows: Counter<typeof RETENTION_SWEEP_LABEL>;

    constructor(private readonly metricsService: MetricsService) {
        this.lastSuccess = this.metricsService.gauge({
            name: RETENTION_SWEEP_LAST_SUCCESS_GAUGE,
            help: 'Unix seconds at which a retention sweep last completed, by sweep.',
            labelNames: [RETENTION_SWEEP_LABEL],
        });
        this.rows = this.metricsService.counter({
            name: RETENTION_SWEEP_ROWS_TOTAL,
            help: 'Rows a retention sweep has expired, by sweep.',
            labelNames: [RETENTION_SWEEP_LABEL],
        });
    }

    /**
     * Seeds a sweep's series, so one that never runs still reports something that ages.
     *
     * **This is what makes the alert able to see the worst case.** A sweep whose cron was never
     * registered produces no series at all, and a rule comparing the gauge against `time()` would
     * match nothing — silent about the one failure it exists for. Seeding with the process's own
     * clock turns that into a series that stops advancing, which is indistinguishable from the
     * other way a sweep stops and wants exactly the same remedy.
     *
     * A restart therefore resets the clock, which is correct rather than a loophole: a fresh
     * process legitimately has not swept yet, and will within its first cron period. A process
     * restarting faster than that is a crash loop, which its own alerts already cover.
     */
    register(sweep: string): void {
        this.lastSuccess.set({ [RETENTION_SWEEP_LABEL]: sweep }, Date.now() / MILLISECONDS_PER_SECOND);
        this.rows.inc({ [RETENTION_SWEEP_LABEL]: sweep }, 0);
    }

    /**
     * Records a completed sweep.
     *
     * **Called after the work, never before.** A sweep that throws partway records nothing, so its
     * gauge ages and the alert fires — which is the conservative reading: half-finished work that
     * reports success is how a retention control passes every check while the data it was meant to
     * expire accumulates behind it.
     */
    recordSuccess(dto: { sweep: string; rows: number }): void {
        this.lastSuccess.set({ [RETENTION_SWEEP_LABEL]: dto.sweep }, Date.now() / MILLISECONDS_PER_SECOND);
        if (dto.rows > 0) this.rows.inc({ [RETENTION_SWEEP_LABEL]: dto.sweep }, dto.rows);
    }
}
