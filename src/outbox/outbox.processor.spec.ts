import { OutboxEventStatus } from './outbox-event-status.enum';
import type { OutboxEventEntity } from './outbox-event.entity';
import { OutboxProcessor, type OutboxProcessorConfig } from './outbox.processor';

const CONFIG: OutboxProcessorConfig = {
    isEnabled: true,
    pollIntervalMs: 1_000,
    batchSize: 10,
    claimTimeoutMs: 60_000,
    maxAttempts: 3,
    backoffBaseMs: 100,
    backoffMaxMs: 1_000,
};

const event = (overrides: Partial<OutboxEventEntity> = {}): OutboxEventEntity =>
    ({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        tenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        claimToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        status: OutboxEventStatus.PROCESSING,
        attemptCount: 0,
        ...overrides,
    }) as OutboxEventEntity;

const harness = (
    options: {
        batch?: OutboxEventEntity[];
        publish?: jest.Mock;
        isPermanentFailure?: (error: unknown) => boolean;
        config?: () => OutboxProcessorConfig;
    } = {},
) => {
    const repository = {
        claimDueBatch: jest.fn().mockResolvedValue(options.batch ?? [event()]),
        markPublished: jest.fn().mockResolvedValue(true),
        recordFailure: jest.fn().mockResolvedValue(true),
    };
    const logger = { warn: jest.fn(), error: jest.fn() };
    const processor = new OutboxProcessor<OutboxEventEntity>({
        name: 'test',
        repository: repository,
        logger,
        config: options.config ?? ((): OutboxProcessorConfig => CONFIG),
        publish: options.publish ?? jest.fn().mockResolvedValue(undefined),
        isPermanentFailure: options.isPermanentFailure ?? ((): boolean => false),
    });

    return { processor, repository, logger };
};

describe('OutboxProcessor', () => {
    it('publishes each claimed row and completes it against its claim', async () => {
        const publish = jest.fn().mockResolvedValue(undefined);
        const { processor, repository } = harness({ publish });

        await expect(processor.runCycle()).resolves.toBe(1);

        expect(publish).toHaveBeenCalledTimes(1);
        expect(repository.markPublished).toHaveBeenCalledWith({
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            tenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            claimToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        });
    });

    it('does nothing when a cycle is already in progress', async () => {
        // Load-bearing for the e2e suites: a background interval landing inside a hand-driven
        // cycle would claim nothing and leave the assertion reading an untouched row.
        let release = (): void => undefined;
        const publish = jest.fn().mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
        const { processor, repository } = harness({ publish });

        const first = processor.runCycle();
        await expect(processor.runCycle()).resolves.toBe(0);
        release();
        await first;

        expect(repository.claimDueBatch).toHaveBeenCalledTimes(1);
    });

    it('refuses an event with no lease instead of publishing it', async () => {
        // Nothing would constrain the terminal write, so a success could not be recorded and the
        // event would be published again on every cycle.
        const publish = jest.fn();
        const { processor, repository, logger } = harness({ batch: [event({ claimToken: null })], publish });

        await processor.runCycle();

        expect(publish).not.toHaveBeenCalled();
        expect(repository.markPublished).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
    });

    it('refuses an event whose status is not processing', async () => {
        const publish = jest.fn();
        const { processor } = harness({ batch: [event({ status: OutboxEventStatus.PENDING })], publish });

        await processor.runCycle();

        expect(publish).not.toHaveBeenCalled();
    });

    it('reschedules a transient failure rather than dead-lettering it', async () => {
        const publish = jest.fn().mockRejectedValue(new Error('gateway down'));
        const { processor, repository, logger } = harness({ publish });

        await processor.runCycle();

        const failure = repository.recordFailure.mock.calls[0]?.[0] as {
            attemptCount: number;
            isDeadLetter: boolean;
            nextAttemptAt: Date | null;
            lastError: string;
        };
        expect(failure.isDeadLetter).toBe(false);
        expect(failure.attemptCount).toBe(1);
        expect(failure.nextAttemptAt).toBeInstanceOf(Date);
        expect(failure.lastError).toBe('gateway down');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('dead-letters a permanent failure on the first attempt', async () => {
        // Four more attempts cannot fix a rejected payload, and they add load to a service that
        // has already said no.
        const publish = jest.fn().mockRejectedValue(new Error('rejected'));
        const { processor, repository, logger } = harness({ publish, isPermanentFailure: () => true });

        await processor.runCycle();

        const failure = repository.recordFailure.mock.calls[0]?.[0] as {
            isDeadLetter: boolean;
            nextAttemptAt: Date | null;
        };
        expect(failure.isDeadLetter).toBe(true);
        expect(failure.nextAttemptAt).toBeNull();
        expect(logger.warn).toHaveBeenCalled();
    });

    it('dead-letters once the attempt budget is spent', async () => {
        const publish = jest.fn().mockRejectedValue(new Error('still down'));
        const { processor, repository } = harness({ batch: [event({ attemptCount: 2 })], publish });

        await processor.runCycle();

        expect((repository.recordFailure.mock.calls[0]?.[0] as { isDeadLetter: boolean }).isDeadLetter).toBe(true);
    });

    it('records a reason even when something threw a non-Error', async () => {
        const publish = jest.fn().mockRejectedValue('a bare string');
        const { processor, repository } = harness({ publish });

        await processor.runCycle();

        expect((repository.recordFailure.mock.calls[0]?.[0] as { lastError: string }).lastError).toContain('test');
    });

    it('reads its config per cycle, so a test can change it after module init', async () => {
        const config = jest.fn().mockReturnValue(CONFIG);
        const { processor } = harness({ config });

        await processor.runCycle();
        await processor.runCycle();

        expect(config.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('arms no interval when the processor is switched off', () => {
        const { processor, repository } = harness({ config: () => ({ ...CONFIG, isEnabled: false }) });

        processor.start();
        processor.stop();

        expect(repository.claimDueBatch).not.toHaveBeenCalled();
    });
});
