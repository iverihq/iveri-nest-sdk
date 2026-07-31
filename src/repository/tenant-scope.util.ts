import type { UUID } from '@iveri/contracts';
import type { FindOptionsWhere } from 'typeorm';

import type { BaseEntity } from '../entity/base.entity';

/**
 * Forces `tenantId` onto every clause of a caller-supplied `where`.
 *
 * The important detail is that `tenantId` is spread **last**. A caller who passes
 * `{ tenantId: someOtherTenant }` — by mistake, or because a value flowed in from a request
 * body — has it overwritten rather than honoured. Scoping that a caller can override is not
 * scoping.
 *
 * An array `where` is TypeORM's OR: each branch is a separate `WHERE` clause, so each needs
 * its own tenant predicate. Applying it to only the first branch would leave the rest
 * unscoped, which is the exact bug this function exists to make impossible.
 *
 * Exported separately from {@link BaseRepository} so it can be unit-tested as a pure
 * function, and reused by the rare query that has to build its own criteria.
 */
export const scopeWhereToTenant = <TEntity extends BaseEntity>(
    tenantId: UUID,
    where?: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[],
): FindOptionsWhere<TEntity>[] => {
    const clauses = Array.isArray(where) ? where : [where ?? {}];
    const effective = clauses.length > 0 ? clauses : [{} as FindOptionsWhere<TEntity>];

    return effective.map((clause) => ({ ...clause, tenantId }) as FindOptionsWhere<TEntity>);
};

/**
 * Strips the columns a caller must never set directly.
 *
 * `tenantId` is the one that matters: without this, an update carrying a `tenantId` would
 * hand a row to another tenant, and it would look like an ordinary field assignment in the
 * diff. The identity and timestamp columns are removed for the same reason — they are owned
 * by the database and by {@link BaseEntity}, not by application code.
 */
export const stripManagedColumns = <TEntity extends BaseEntity>(
    values: Partial<TEntity>,
): Omit<Partial<TEntity>, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'> => {
    const {
        id: _id,
        tenantId: _tenantId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        deletedAt: _deletedAt,
        ...rest
    } = values;

    return rest;
};
