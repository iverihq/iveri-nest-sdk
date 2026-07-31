import type { UUID } from '@iveri/contracts';
import type { DeepPartial, EntityManager, FindOptionsOrder, FindOptionsRelations, FindOptionsWhere } from 'typeorm';

import type { BaseEntity } from '../entity/base.entity';

/**
 * The two fields every repository call carries.
 *
 * `tenantId` is required on every single one — there is no unscoped overload, which is what
 * makes cross-tenant reads impossible rather than merely discouraged.
 *
 * `manager` is always optional and always threaded through, so any operation can be pulled
 * into a caller's transaction without the repository knowing whether it is in one.
 */
export interface TenantScopedDto {
    tenantId: UUID;
    manager?: EntityManager;
}

export interface FindOneByIdDto<TEntity extends BaseEntity> extends TenantScopedDto {
    id: UUID;
    relations?: FindOptionsRelations<TEntity>;
    withDeleted?: boolean;
}

export interface FindOneDto<TEntity extends BaseEntity> extends TenantScopedDto {
    where?: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[];
    order?: FindOptionsOrder<TEntity>;
    relations?: FindOptionsRelations<TEntity>;
    withDeleted?: boolean;
}

export interface FindManyDto<TEntity extends BaseEntity> extends FindOneDto<TEntity> {
    /** Maximum rows to return. */
    take?: number;

    /** Rows to skip. Pair with `order` — an unordered offset query has no stable meaning. */
    skip?: number;
}

export interface CountDto<TEntity extends BaseEntity> extends TenantScopedDto {
    where?: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[];
    withDeleted?: boolean;
}

export interface SaveOneDto<TEntity extends BaseEntity> extends TenantScopedDto {
    entity: DeepPartial<TEntity>;
}

export interface SaveManyDto<TEntity extends BaseEntity> extends TenantScopedDto {
    entities: DeepPartial<TEntity>[];
}

export interface UpdateOneByIdDto<TEntity extends BaseEntity> extends TenantScopedDto {
    id: UUID;

    /**
     * Columns to set. `id`, `tenantId` and the timestamps are stripped before the statement
     * is built — see `stripManagedColumns`.
     */
    values: Partial<TEntity>;
}

export interface UpdateByDto<TEntity extends BaseEntity> extends TenantScopedDto {
    where: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[];
    values: Partial<TEntity>;
}

export interface SoftDeleteByIdDto extends TenantScopedDto {
    id: UUID;
}

export interface QueryBuilderDto extends TenantScopedDto {
    /** Table alias the tenant predicate is applied to. */
    alias: string;
}
