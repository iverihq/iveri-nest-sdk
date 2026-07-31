import type { Maybe } from '@iveri/contracts';
import type { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import type { BaseEntity } from '../entity/base.entity';

import type {
    CountDto,
    FindManyDto,
    FindOneByIdDto,
    FindOneDto,
    QueryBuilderDto,
    SaveManyDto,
    SaveOneDto,
    SoftDeleteByIdDto,
    UpdateByDto,
    UpdateOneByIdDto,
} from './base-repository.type';
import { scopeWhereToTenant, stripManagedColumns } from './tenant-scope.util';

/**
 * Base class for every repository in every Iveri service.
 *
 * **Tenant scoping is the default, not a thing each query remembers.** Every method takes a
 * required `tenantId` and applies it to the criteria itself; there is no unscoped overload
 * to reach for under deadline pressure. A repository method that can return cross-tenant rows
 * is a bug (§9), and this class is how that stays true without relying on discipline.
 *
 * Extend it per aggregate:
 *
 * ```ts
 * @Injectable()
 * export class ConversationRepository extends BaseRepository<ConversationEntity> {
 *     constructor(dataSource: DataSource) {
 *         super(dataSource, ConversationEntity);
 *     }
 * }
 * ```
 *
 * A query this class cannot express goes through {@link BaseRepository.scopedQueryBuilder},
 * which hands back a builder with the tenant predicate already applied.
 *
 * @typeParam TEntity - the entity this repository owns.
 */
export abstract class BaseRepository<TEntity extends BaseEntity & ObjectLiteral> {
    protected constructor(
        protected readonly dataSource: DataSource,
        protected readonly entityTarget: EntityTarget<TEntity>,
    ) {}

    async findOneById(dto: FindOneByIdDto<TEntity>): Promise<Maybe<TEntity>> {
        const found = await this.repository(dto.manager).findOne({
            where: scopeWhereToTenant<TEntity>(dto.tenantId, { id: dto.id } as never),
            relations: dto.relations,
            withDeleted: dto.withDeleted,
        });

        return found ?? undefined;
    }

    async findOne(dto: FindOneDto<TEntity>): Promise<Maybe<TEntity>> {
        const found = await this.repository(dto.manager).findOne({
            where: scopeWhereToTenant(dto.tenantId, dto.where),
            order: dto.order,
            relations: dto.relations,
            withDeleted: dto.withDeleted,
        });

        return found ?? undefined;
    }

    async findMany(dto: FindManyDto<TEntity>): Promise<TEntity[]> {
        return this.repository(dto.manager).find({
            where: scopeWhereToTenant(dto.tenantId, dto.where),
            order: dto.order,
            relations: dto.relations,
            withDeleted: dto.withDeleted,
            take: dto.take,
            skip: dto.skip,
        });
    }

    /**
     * Rows plus the total matching the same criteria, in one round trip — the shape
     * `Paginated<T>` needs. TypeORM runs the count with `take`/`skip` removed.
     */
    async findAndCount(dto: FindManyDto<TEntity>): Promise<[TEntity[], number]> {
        return this.repository(dto.manager).findAndCount({
            where: scopeWhereToTenant(dto.tenantId, dto.where),
            order: dto.order,
            relations: dto.relations,
            withDeleted: dto.withDeleted,
            take: dto.take,
            skip: dto.skip,
        });
    }

    async count(dto: CountDto<TEntity>): Promise<number> {
        return this.repository(dto.manager).count({
            where: scopeWhereToTenant(dto.tenantId, dto.where),
            withDeleted: dto.withDeleted,
        });
    }

    async exists(dto: CountDto<TEntity>): Promise<boolean> {
        return this.repository(dto.manager).exists({
            where: scopeWhereToTenant(dto.tenantId, dto.where),
            withDeleted: dto.withDeleted,
        });
    }

    /**
     * Inserts or updates one row, stamping `tenantId` from the argument.
     *
     * The stamp is applied after the caller's fields, so an entity carrying a stale or
     * attacker-supplied `tenantId` cannot land in the wrong tenant.
     */
    async saveOne(dto: SaveOneDto<TEntity>): Promise<TEntity> {
        return this.repository(dto.manager).save({ ...dto.entity, tenantId: dto.tenantId });
    }

    async saveMany(dto: SaveManyDto<TEntity>): Promise<TEntity[]> {
        return this.repository(dto.manager).save(dto.entities.map((entity) => ({ ...entity, tenantId: dto.tenantId })));
    }

    /**
     * @returns rows affected — `0` when the id does not exist **or** belongs to another
     * tenant. Callers that need to tell "missing" from "not yours" apart should not: the two
     * are deliberately indistinguishable, because distinguishing them confirms the row exists.
     */
    async updateOneById(dto: UpdateOneByIdDto<TEntity>): Promise<number> {
        const result = await this.repository(dto.manager).update(
            scopeWhereToTenant<TEntity>(dto.tenantId, { id: dto.id } as never),
            stripManagedColumns(dto.values) as QueryDeepPartialEntity<TEntity>,
        );

        return result.affected ?? 0;
    }

    async updateBy(dto: UpdateByDto<TEntity>): Promise<number> {
        const result = await this.repository(dto.manager).update(
            scopeWhereToTenant(dto.tenantId, dto.where),
            stripManagedColumns(dto.values) as QueryDeepPartialEntity<TEntity>,
        );

        return result.affected ?? 0;
    }

    /** Sets `deleted_at`; the row stays recoverable and out of every default query. */
    async softDeleteOneById(dto: SoftDeleteByIdDto): Promise<number> {
        const result = await this.repository(dto.manager).softDelete(
            scopeWhereToTenant<TEntity>(dto.tenantId, { id: dto.id } as never),
        );

        return result.affected ?? 0;
    }

    async restoreOneById(dto: SoftDeleteByIdDto): Promise<number> {
        const result = await this.repository(dto.manager).restore(
            scopeWhereToTenant<TEntity>(dto.tenantId, { id: dto.id } as never),
        );

        return result.affected ?? 0;
    }

    /**
     * A query builder with `WHERE <alias>.tenant_id = :tenantId` already applied, for joins,
     * aggregates and anything else the typed methods above cannot express.
     *
     * Use this rather than `dataSource.createQueryBuilder()`. Every `andWhere` you add
     * narrows within the tenant; an `orWhere` **does not** — it widens past the scope, so
     * wrap alternatives in a bracketed sub-condition instead.
     */
    protected scopedQueryBuilder(dto: QueryBuilderDto): SelectQueryBuilder<TEntity> {
        return this.repository(dto.manager)
            .createQueryBuilder(dto.alias)
            .where(`${dto.alias}.tenant_id = :tenantId`, { tenantId: dto.tenantId });
    }

    /**
     * The underlying TypeORM repository, bound to the caller's transaction when one is
     * supplied. Protected: an unscoped repository handed to a service is the hole this class
     * exists to close.
     */
    protected repository(manager?: Maybe<EntityManager>): Repository<TEntity> {
        return (manager ?? this.dataSource.manager).getRepository(this.entityTarget);
    }
}
