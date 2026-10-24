import type { UUID } from '@iveri/contracts';

import { OutboxEventStatus } from './outbox-event-status.enum';
import type { OutboxEventEntity } from './outbox-event.entity';
import { nextOutboxAttemptAt } from './outbox-retry.util';

/** The knobs a service reads from its own validated environment. */
export interface OutboxProcessorConfig {
    isEnabled: boolean;
    pollIntervalMs: number;
    batchSize: number;
    claimTimeoutMs: number;
    maxAttempts: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
}

/**
 * What the loop needs of a store, which `OutboxEventRepository` satisfies structurally.
 *
 * A role interface rather than a `Pick` of the base class: the base is generic over an entity
 * that must also be an `ObjectLiteral`, and naming it here pushed that index signature out into
 * every consumer's own repository type, which then no longer matched. Found by the first consumer
 * rather than by this package's own tests — a published type is only as good as the first thing
 * that tries to satisfy it.
 */
export interface OutboxEventStore<TEntity extends OutboxEventEntity> {
    claimDueBatch(dto: { batchSize: number; claimTimeoutMs: number }): Promise<TEntity[]>;
    markPublished(dto: { id: UUID; tenantId: UUID; claimToken: UUID }): Promise<boolean>;
    recordFailure(dto: {
        id: UUID;
        tenantId: UUID;
        claimToken: UUID;
        attemptCount: number;
        nextAttemptAt: Date | null;
        isDeadLetter: boolean;
        lastError: string;
    }): Promise<boolean>;
}

/** Just enough of a logger to report a lost lease and a dead letter; `nestjs-pino` satisfies it. */
export interface OutboxLogger {
    warn(message: unknown, ...rest: unknown[]): void;
    error(message: unknown, ...rest: unknown[]): void;
}

export interface OutboxProcessorOptions<TEntity extends OutboxEventEntity> {
    /** Names this queue in log lines. Usually the repository's `queue`. */
    name: string;
    repository: OutboxEventStore<TEntity>;
    logger: OutboxLogger;
    /**
     * Read per cycle rather than captured once, so a test can change a value after the module is
     * initialised — which is how every e2e suite in the fleet pushes the poll interval out of the
     * way before driving `runCycle` by hand.
     */
    config: () => OutboxProcessorConfig;
    /** Sends the event. Throws to fail the attempt. */
    publish: (event: TEntity) => Promise<void>;
    /** True when retrying cannot help, so the event dead-letters on this attempt. */
    isPermanentFailure: (error: unknown) => boolean;
}

/**
 * Drains one outbox table: claim a batch, publish each row, then complete or reschedule it.
 *
 * Five services had their own copy of this loop, differing only in which environment variables
 * it read and which resource it named. The loop is here; what a service supplies is its config,
 * its publish call and its own judgement about which failures are permanent.
 *
 * **A cycle already in progress returns 0 and does nothing**, and that is load-bearing for the
 * tests rather than an optimisation: an e2e suite drives `runCycle` by hand while a background
 * interval may also be armed, and two overlapping cycles would have the manual one silently
 * claim nothing and the assertion read an untouched row. Conduit shipped exactly that flake.
 *
 * Call {@link start} from `onModuleInit` and {@link stop} from `onModuleDestroy`.
 */
export class OutboxProcessor<TEntity extends OutboxEventEntity> {
    private timer: NodeJS.Timeout | null = null;

    private isRunning = false;

    constructor(private readonly options: OutboxProcessorOptions<TEntity>) {}

    /** Arms the poll, unless this service has the processor switched off. */
    start(): void {
        const config = this.options.config();
        if (!config.isEnabled) return;

        this.timer = setInterval(() => {
            void this.runCycle().catch((error: unknown) =>
                this.options.logger.error(error, `${this.options.name} outbox cycle failed`),
            );
        }, config.pollIntervalMs);
        // Unreferenced, so a pending interval cannot hold the process open during shutdown.
        this.timer.unref();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Returns how many rows were claimed, which is what a test asserts against. */
    async runCycle(): Promise<number> {
        if (this.isRunning) return 0;
        this.isRunning = true;
        try {
            const config = this.options.config();
            const batch = await this.options.repository.claimDueBatch({
                batchSize: config.batchSize,
                claimTimeoutMs: config.claimTimeoutMs,
            });
            for (const event of batch) await this.process(event, config);

            return batch.length;
        } finally {
            this.isRunning = false;
        }
    }

    private async process(event: TEntity, config: OutboxProcessorConfig): Promise<void> {
        if (!event.claimToken || event.status !== OutboxEventStatus.PROCESSING) {
            // Refused rather than published: without a lease there is nothing to constrain the
            // terminal write, so a success would be unrecordable and retried forever.
            this.options.logger.error({
                message: `Refusing ${this.options.name} outbox event without a lease`,
                eventId: event.id,
            });

            return;
        }

        const claim = { id: event.id, tenantId: event.tenantId, claimToken: event.claimToken };
        const attemptCount = event.attemptCount + 1;
        try {
            await this.options.publish(event);
            await this.options.repository.markPublished(claim);
        } catch (error: unknown) {
            const permanent = this.options.isPermanentFailure(error);
            const isDeadLetter = permanent || attemptCount >= config.maxAttempts;
            const reason = error instanceof Error ? error.message : `Unknown ${this.options.name} publish failure`;
            await this.options.repository.recordFailure({
                ...claim,
                attemptCount,
                nextAttemptAt: isDeadLetter
                    ? null
                    : nextOutboxAttemptAt({
                          attemptCount,
                          baseMs: config.backoffBaseMs,
                          maxMs: config.backoffMaxMs,
                      }),
                isDeadLetter,
                lastError: reason,
            });
            if (isDeadLetter) {
                this.options.logger.warn({
                    message: `${this.options.name} outbox event dead-lettered`,
                    eventId: event.id,
                    tenantId: event.tenantId,
                    attemptCount,
                    reason,
                    permanent,
                });
            }
        }
    }
}
