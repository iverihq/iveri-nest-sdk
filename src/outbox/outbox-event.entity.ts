import type { UUID } from '@iveri/contracts';
import { Column } from 'typeorm';

import { BaseEntity } from '../entity';

import { OutboxEventStatus } from './outbox-event-status.enum';

/**
 * The columns a durable publish intent carries, shared by every service's outbox table.
 *
 * Extending this changes no schema: the column names, types, lengths and defaults are the ones
 * five services had already written out identically, so `migration:generate` must still come
 * back empty after a service switches to it. **That is the acceptance test for this class**, not
 * a passing unit suite — TypeORM reads inherited `@Column` metadata the same way it reads a
 * declared one, and the only way to know a length or a default did not drift is to ask it.
 *
 * What stays on the subclass is what genuinely differs: the `@Entity` name, the table's indexes
 * and `CHECK` constraint, the relation back to the aggregate, the `event_type` default, and any
 * extra key a service needs to make its uniqueness index correct — `subject_id` in Mobility,
 * where one aggregate emits events about two different subjects and version numbers restart.
 */
export abstract class OutboxEventEntity extends BaseEntity {
    @Column({ type: 'uuid', name: 'aggregate_id' })
    aggregateId: UUID;

    /**
     * The version of the aggregate this event describes.
     *
     * **When an event names resource A but describes aggregate B, this must be B's version.** A
     * dispatch-keyed event carrying a dispatch's unchanged version repeats a published value and
     * is silently eaten by the uniqueness index — a bug Mobility shipped once and the reason its
     * two callers go through one `enqueue` helper.
     */
    @Column({ type: 'integer', name: 'aggregate_version' })
    aggregateVersion: number;

    @Column({ type: 'varchar', length: 128, name: 'correlation_id' })
    correlationId: string;

    @Column({ type: 'varchar', length: 20, default: OutboxEventStatus.PENDING, name: 'status' })
    status: OutboxEventStatus;

    @Column({ type: 'integer', default: 0, name: 'attempt_count' })
    attemptCount: number;

    @Column({ type: 'timestamptz', nullable: true, name: 'next_attempt_at' })
    nextAttemptAt: Date | null;

    @Column({ type: 'timestamptz', nullable: true, name: 'claimed_at' })
    claimedAt: Date | null;

    /** Identifies one claim, so a terminal write can only land for the attempt that made it. */
    @Column({ type: 'uuid', nullable: true, name: 'claim_token' })
    claimToken: UUID | null;

    @Column({ type: 'timestamptz', nullable: true, name: 'published_at' })
    publishedAt: Date | null;

    @Column({ type: 'varchar', length: 500, nullable: true, name: 'last_error' })
    lastError: string | null;
}
