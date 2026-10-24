import type { MetricsModuleOptions } from './metrics-module-options.interface';
import { RETENTION_SWEEP_LAST_SUCCESS_GAUGE, RETENTION_SWEEP_ROWS_TOTAL } from './metrics.constant';
import { MetricsService } from './metrics.service';
import { RetentionSweepMetrics } from './retention-sweep.metrics';

const OPTIONS: MetricsModuleOptions = { serviceName: 'taxi-api', collectDefaultMetrics: false };

const SWEEP = 'taxi-ride-location';

const build = (): { metrics: MetricsService; sweeps: RetentionSweepMetrics } => {
    const metrics = new MetricsService(OPTIONS);
    return { metrics, sweeps: new RetentionSweepMetrics(metrics) };
};

const sampleFor = (scraped: string, metric: string, sweep: string): number | null => {
    const line = scraped
        .split('\n')
        .find((candidate) => candidate.startsWith(`${metric}{`) && candidate.includes(`sweep="${sweep}"`));
    return line === undefined ? null : Number(line.slice(line.lastIndexOf(' ') + 1));
};

/**
 * Whether each retention sweep is still running.
 *
 * The behaviour worth pinning is **`register`**, because it is what lets the alert see the worst
 * case rather than the obvious one: a sweep whose cron was never wired produces no series at all,
 * and a rule comparing the gauge against `time()` would match nothing and stay silent.
 */
describe('RetentionSweepMetrics', () => {
    it('reports a series from registration, before any sweep has run', async () => {
        const { metrics, sweeps } = build();

        sweeps.register(SWEEP);

        // Without this, a service whose sweep never fires is invisible — the loudest failure
        // producing the quietest signal.
        const scraped = await metrics.render();
        expect(sampleFor(scraped, RETENTION_SWEEP_LAST_SUCCESS_GAUGE, SWEEP)).toBeGreaterThan(0);
        expect(sampleFor(scraped, RETENTION_SWEEP_ROWS_TOTAL, SWEEP)).toBe(0);
    });

    it('advances the timestamp when a sweep completes', async () => {
        const { metrics, sweeps } = build();
        sweeps.register(SWEEP);
        const seeded = sampleFor(await metrics.render(), RETENTION_SWEEP_LAST_SUCCESS_GAUGE, SWEEP);

        jest.spyOn(Date, 'now').mockReturnValue((seeded! + 3_600) * 1_000);
        sweeps.recordSuccess({ sweep: SWEEP, rows: 7 });

        const scraped = await metrics.render();
        expect(sampleFor(scraped, RETENTION_SWEEP_LAST_SUCCESS_GAUGE, SWEEP)).toBeCloseTo(seeded! + 3_600, 0);
        expect(sampleFor(scraped, RETENTION_SWEEP_ROWS_TOTAL, SWEEP)).toBe(7);
        jest.restoreAllMocks();
    });

    it('advances the timestamp even when a sweep expires nothing', async () => {
        const { metrics, sweeps } = build();
        sweeps.register(SWEEP);
        const seeded = sampleFor(await metrics.render(), RETENTION_SWEEP_LAST_SUCCESS_GAUGE, SWEEP);

        jest.spyOn(Date, 'now').mockReturnValue((seeded! + 3_600) * 1_000);
        sweeps.recordSuccess({ sweep: SWEEP, rows: 0 });

        // A sweep that finds nothing is the normal state most hours, and it is still a sweep that
        // ran. Treating it as no signal would make a healthy service alert.
        const scraped = await metrics.render();
        expect(sampleFor(scraped, RETENTION_SWEEP_LAST_SUCCESS_GAUGE, SWEEP)).toBeCloseTo(seeded! + 3_600, 0);
        expect(sampleFor(scraped, RETENTION_SWEEP_ROWS_TOTAL, SWEEP)).toBe(0);
        jest.restoreAllMocks();
    });

    it('keeps two sweeps in one service apart', async () => {
        const { metrics, sweeps } = build();
        sweeps.register('delivery-proof');
        sweeps.register('delivery-job-location');

        sweeps.recordSuccess({ sweep: 'delivery-proof', rows: 3 });

        // Several services run more than one sweep, and they fail for unrelated reasons — one
        // number could not say which had stopped.
        const scraped = await metrics.render();
        expect(sampleFor(scraped, RETENTION_SWEEP_ROWS_TOTAL, 'delivery-proof')).toBe(3);
        expect(sampleFor(scraped, RETENTION_SWEEP_ROWS_TOTAL, 'delivery-job-location')).toBe(0);
    });

    it('carries no label but the sweep, beside the default service label', async () => {
        const { metrics, sweeps } = build();
        sweeps.register(SWEEP);
        sweeps.recordSuccess({ sweep: SWEEP, rows: 1 });

        const lines = (await metrics.render())
            .split('\n')
            .filter((line) => line.startsWith(`${RETENTION_SWEEP_LAST_SUCCESS_GAUGE}{`));

        expect(lines).toHaveLength(1);
        // The fleet-wide rule: nothing tenant-scoped reaches an unauthenticated scrape endpoint.
        expect(lines[0]).not.toContain('tenant');
        expect(lines[0]).toContain('sweep="taxi-ride-location"');
        expect(lines[0]).toContain('service="taxi-api"');
    });
});
