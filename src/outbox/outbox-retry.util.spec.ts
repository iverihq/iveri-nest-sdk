import { nextOutboxAttemptAt } from './outbox-retry.util';

describe('nextOutboxAttemptAt', () => {
    it('never schedules in the past', () => {
        const before = Date.now();

        const next = nextOutboxAttemptAt({ attemptCount: 1, baseMs: 1_000, maxMs: 60_000 });

        expect(next.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('jitters across the whole interval rather than landing on one delay', () => {
        // A shared deterministic delay brings every row failed by one outage back in the same
        // instant, which is the synchronized herd that keeps a recovering service down.
        const delays = new Set(
            Array.from({ length: 50 }, () =>
                nextOutboxAttemptAt({ attemptCount: 6, baseMs: 1_000, maxMs: 600_000 }).getTime(),
            ),
        );

        expect(delays.size).toBeGreaterThan(1);
    });

    it('is bounded by maxMs however many attempts have been made', () => {
        const now = Date.now();

        const next = nextOutboxAttemptAt({ attemptCount: 1_000, baseMs: 1_000, maxMs: 5_000 });

        expect(next.getTime()).toBeLessThanOrEqual(now + 5_000);
    });

    it('treats a first attempt as the base interval, not double it', () => {
        const now = Date.now();

        const next = nextOutboxAttemptAt({ attemptCount: 1, baseMs: 2_000, maxMs: 600_000 });

        expect(next.getTime()).toBeLessThanOrEqual(now + 2_000);
    });
});
