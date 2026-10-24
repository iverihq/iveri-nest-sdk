import { randomUUID } from 'node:crypto';

import type { UUID } from '@iveri/contracts';
import type { DataSource, EntityTarget, FindOptionsWhere, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import type { QueueDepthCollector, QueueDepthReading } from '../observability';
import { BaseRepository } from '../repository';

import { OutboxEventStatus } from './outbox-event-status.enum';
import type { OutboxEventEntity } from './outbox-event.entity';

/**
 * Claim, complete and retry for one outbox table.
 *
 * Five services had written this out identically — two of them 137 lines apart in exactly two
 * lines — so the queries live here once. What is left to a subclass is `enqueue`, which maps a
 * domain aggregate to a row and is the only part that genuinely differs.
 *
 * **Every query here is deliberately unscoped by tenant.** A background processor has no request
 * principal, so there is no tenant to scope to; what keeps it safe is that every terminal write
 * is constrained by the tenant id and claim token the claim handed back. That is why
 * {@link markPublished} and {@link recordFailure} take a `tenantId` they could have read from the
 * row: it makes the constraint explicit in the `WHERE`, where a reviewer can see it.
 */
export abstract class OutboxEventRepository<TEntity extends OutboxEventEntity & ObjectLiteral>
    extends BaseRepository<TEntity>
    implements QueueDepthCollector
{
    protected constructor(
        dataSource: DataSource,
        entityTarget: EntityTarget<TEntity>,
        /** The `queue` label this table reports depth under. Must be unique across the service. */
        readonly queue: string,
    ) {
        super(dataSource, entityTarget);
    }

    /**
     * Current depth per state, read at scrape time.
     *
     * **Read, never pushed.** A gauge the processor writes goes stale exactly when the processor
     * stops, which is the moment a backlog matters; a failed read leaves no series at all, and a
     * gap is honest about not knowing where a stale number claims the queue is fine.
     *
     * Zeroes are reported, so "drained" and "cannot read the table" stay distinguishable — the
     * one distinction a dead-letter alert is built on.
     */
    async collect(): Promise<QueueDepthReading[]> {
        const rows = await this.repository()
            .createQueryBuilder('event')
            .select('event.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('event.deleted_at IS NULL')
            .andWhere('event.status IN (:...statuses)', {
                statuses: [OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING, OutboxEventStatus.DEAD_LETTER],
            })
            .groupBy('event.status')
            .getRawMany<{ status: OutboxEventStatus; count: string }>();
        const depths = new Map(rows.map((row) => [row.status, Number(row.count)]));

        return [
            { state: 'pending', depth: depths.get(OutboxEventStatus.PENDING) ?? 0 },
            { state: 'in_flight', depth: depths.get(OutboxEventStatus.PROCESSING) ?? 0 },
            { state: 'dead_lettered', depth: depths.get(OutboxEventStatus.DEAD_LETTER) ?? 0 },
        ];
    }

    /**
     * Takes up to `batchSize` due rows and stamps them with one fresh claim token.
     *
     * **`SKIP LOCKED` is what makes this safe across replicas, and there is no distributed lock.**
     * Two processes running this take disjoint sets by construction, and a process that dies
     * mid-batch leaves rows `processing` with an old `claimed_at` rather than a lease somewhere
     * else that has to expire. A Redis lock here would be a second source of truth that can
     * disagree with the rows it guards, and would stop publishing entirely whenever Redis is down.
     *
     * **The same query is the crash-recovery path.** A row stuck `processing` past
     * `claimTimeoutMs` is re-claimed, which is where at-least-once becomes visible and why the
     * row id is the gateway's idempotency key.
     */
    async claimDueBatch(dto: { batchSize: number; claimTimeoutMs: number }): Promise<TEntity[]> {
        const claimToken = randomUUID();

        return this.dataSource.transaction(async (manager) => {
            const rows = await this.repository(manager)
                .createQueryBuilder('event')
                .where('event.deleted_at IS NULL')
                .andWhere('event.status IN (:...statuses)', {
                    statuses: [OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING],
                })
                .andWhere('event.next_attempt_at <= NOW()')
                .andWhere(
                    `(event.status = :pending OR event.claimed_at IS NULL OR event.claimed_at < NOW() - (:claimTimeoutMs * INTERVAL '1 millisecond'))`,
                    { pending: OutboxEventStatus.PENDING, claimTimeoutMs: dto.claimTimeoutMs },
                )
                .orderBy('event.next_attempt_at', 'ASC')
                .addOrderBy('event.created_at', 'ASC')
                .take(dto.batchSize)
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .getMany();
            if (rows.length === 0) return [];

            const claimedAt = new Date();
            for (const row of rows) {
                row.status = OutboxEventStatus.PROCESSING;
                row.claimedAt = claimedAt;
                row.claimToken = claimToken;
            }

            return this.repository(manager).save(rows);
        });
    }

    /** Returns false when the claim was already taken over, which means another attempt owns it. */
    async markPublished(dto: { id: UUID; tenantId: UUID; claimToken: UUID }): Promise<boolean> {
        return this.updateClaimed(dto, {
            status: OutboxEventStatus.PUBLISHED,
            publishedAt: new Date(),
            nextAttemptAt: null,
            claimedAt: null,
            claimToken: null,
            lastError: null,
        });
    }

    /**
     * Records a failed attempt, scheduling a retry or dead-lettering it.
     *
     * `lastError` is truncated to the column's width here rather than at the call site, because a
     * provider message is whatever a provider felt like sending and an insert that fails while
     * recording a failure loses the failure.
     */
    async recordFailure(dto: {
        id: UUID;
        tenantId: UUID;
        claimToken: UUID;
        attemptCount: number;
        nextAttemptAt: Date | null;
        isDeadLetter: boolean;
        lastError: string;
    }): Promise<boolean> {
        return this.updateClaimed(dto, {
            status: dto.isDeadLetter ? OutboxEventStatus.DEAD_LETTER : OutboxEventStatus.PENDING,
            attemptCount: dto.attemptCount,
            nextAttemptAt: dto.isDeadLetter ? null : dto.nextAttemptAt,
            claimedAt: null,
            claimToken: null,
            lastError: dto.lastError.slice(0, 500),
        });
    }

    /**
     * Applies a terminal write, but only for the attempt that holds the claim.
     *
     * The `claim_token` in the predicate is the whole safety property: a stale attempt whose row
     * was re-claimed after `claimTimeoutMs` updates nothing and is told so by the `false` return,
     * rather than overwriting the state the new owner just wrote.
     *
     * `patch` is typed against {@link OutboxEventEntity}, so its fields are still checked; the two
     * casts only widen that to the subclass. TypeORM's `update` signatures resolve to a deferred
     * conditional type when the entity is a generic parameter, and there is no spelling of this
     * that keeps full inference — so it is done once, here, rather than at each call site.
     */
    private async updateClaimed(
        claim: { id: UUID; tenantId: UUID; claimToken: UUID },
        patch: QueryDeepPartialEntity<OutboxEventEntity>,
    ): Promise<boolean> {
        const where = {
            id: claim.id,
            tenantId: claim.tenantId,
            claimToken: claim.claimToken,
        } as FindOptionsWhere<TEntity>;
        const result = await this.repository().update(where, patch as QueryDeepPartialEntity<TEntity>);

        return (result.affected ?? 0) === 1;
    }
}
