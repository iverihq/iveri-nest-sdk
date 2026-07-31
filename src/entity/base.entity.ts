import type { Nullable, UUID } from '@iveri/contracts';
import { Column, CreateDateColumn, DeleteDateColumn, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * The columns every Iveri table carries.
 *
 * `tenantId` is here — not on an opt-in mixin — because §9 of the workspace guide makes it
 * unconditional: every table has it, so {@link BaseRepository} can scope every query without
 * asking whether this particular entity happens to be tenant-owned. An entity that opts out
 * is an entity `BaseRepository` cannot protect.
 *
 * The one self-referential case is identity's `tenant` table, where `tenant_id` equals `id`.
 * That is deliberate: it keeps the rule absolute and costs one redundant column.
 *
 * Column names are spelled out explicitly per `.claude/rules/sql.md` — never rely on
 * TypeORM's camelCase→column inference, so the schema stays predictable and greppable.
 */
export abstract class BaseEntity {
    @PrimaryGeneratedColumn('uuid', { name: 'id' })
    id: UUID;

    /**
     * Owning tenant. Set from the authenticated principal's `RequestContext`, never from a
     * request body or a client-supplied header.
     */
    @Index()
    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId: UUID;

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
    updatedAt: Date;

    /**
     * Soft-delete marker. TypeORM excludes rows with a non-null value from every query unless
     * `withDeleted` is set, so a delete stays recoverable and an audit trail stays intact.
     */
    @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
    deletedAt: Nullable<Date>;
}
