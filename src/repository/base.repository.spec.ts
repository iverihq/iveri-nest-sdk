import type { UUID } from '@iveri/contracts';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { BaseEntity } from '../entity/base.entity';

import { BaseRepository } from './base.repository';

class ConversationEntity extends BaseEntity {
    contactId: UUID;
    isArchived: boolean;
}

class ConversationRepository extends BaseRepository<ConversationEntity> {
    constructor(dataSource: DataSource) {
        super(dataSource, ConversationEntity);
    }
}

const TENANT: UUID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT: UUID = 'bbbbbbbb-0000-4000-8000-000000000002';
const CONVERSATION_ID: UUID = 'cccccccc-0000-4000-8000-000000000003';

/**
 * TypeORM's repository is mocked at its own boundary: these tests are about the criteria this
 * class hands to the ORM, which is exactly where a cross-tenant leak would originate. The
 * `tenant_id` column actually filtering rows is the database's job and is covered by each
 * service's integration suite.
 */
const buildHarness = (): {
    repository: ConversationRepository;
    typeOrmRepository: jest.Mocked<
        Pick<Repository<ConversationEntity>, 'findOne' | 'find' | 'save' | 'update' | 'softDelete' | 'count'>
    >;
    dataSource: DataSource;
    getRepository: jest.Mock;
} => {
    const typeOrmRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockImplementation((entity: unknown) => Promise.resolve(entity)),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
        count: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<
        Pick<Repository<ConversationEntity>, 'findOne' | 'find' | 'save' | 'update' | 'softDelete' | 'count'>
    >;

    const getRepository = jest.fn().mockReturnValue(typeOrmRepository);
    const dataSource = { manager: { getRepository } } as unknown as DataSource;

    return { repository: new ConversationRepository(dataSource), typeOrmRepository, dataSource, getRepository };
};

describe('BaseRepository', () => {
    describe('tenant scoping', () => {
        it('scopes findOneById to the supplied tenant', async () => {
            const { repository, typeOrmRepository } = buildHarness();

            await repository.findOneById({ tenantId: TENANT, id: CONVERSATION_ID });

            expect(typeOrmRepository.findOne).toHaveBeenCalledWith(
                expect.objectContaining({ where: [{ id: CONVERSATION_ID, tenantId: TENANT }] }),
            );
        });

        it('cannot be talked out of the tenant predicate by the caller', async () => {
            const { repository, typeOrmRepository } = buildHarness();

            await repository.findMany({ tenantId: TENANT, where: { tenantId: OTHER_TENANT } });

            expect(typeOrmRepository.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: [{ tenantId: TENANT }] }),
            );
        });

        it('scopes a count with no criteria at all', async () => {
            const { repository, typeOrmRepository } = buildHarness();

            await repository.count({ tenantId: TENANT });

            expect(typeOrmRepository.count).toHaveBeenCalledWith(
                expect.objectContaining({ where: [{ tenantId: TENANT }] }),
            );
        });

        it('scopes a soft delete, so deleting another tenant row affects nothing', async () => {
            const { repository, typeOrmRepository } = buildHarness();

            await repository.softDeleteOneById({ tenantId: TENANT, id: CONVERSATION_ID });

            expect(typeOrmRepository.softDelete).toHaveBeenCalledWith([{ id: CONVERSATION_ID, tenantId: TENANT }]);
        });
    });

    describe('writes', () => {
        it('stamps the tenant onto a saved entity, overriding whatever it carried', async () => {
            const { repository, typeOrmRepository } = buildHarness();

            await repository.saveOne({
                tenantId: TENANT,
                entity: { contactId: CONVERSATION_ID, tenantId: OTHER_TENANT },
            });

            expect(typeOrmRepository.save).toHaveBeenCalledWith({
                contactId: CONVERSATION_ID,
                tenantId: TENANT,
            });
        });

        it('stamps the tenant onto every entity in a batch save', async () => {
            const { repository, typeOrmRepository } = buildHarness();

            await repository.saveMany({
                tenantId: TENANT,
                entities: [{ isArchived: false }, { isArchived: true, tenantId: OTHER_TENANT }],
            });

            expect(typeOrmRepository.save).toHaveBeenCalledWith([
                { isArchived: false, tenantId: TENANT },
                { isArchived: true, tenantId: TENANT },
            ]);
        });

        it('refuses to let an update move a row to another tenant', async () => {
            const { repository, typeOrmRepository } = buildHarness();

            await repository.updateOneById({
                tenantId: TENANT,
                id: CONVERSATION_ID,
                values: { isArchived: true, tenantId: OTHER_TENANT },
            });

            expect(typeOrmRepository.update).toHaveBeenCalledWith([{ id: CONVERSATION_ID, tenantId: TENANT }], {
                isArchived: true,
            });
        });

        it('reports zero rows affected when the id belongs to another tenant', async () => {
            const { repository, typeOrmRepository } = buildHarness();
            typeOrmRepository.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] });

            const affected = await repository.updateOneById({
                tenantId: TENANT,
                id: CONVERSATION_ID,
                values: { isArchived: true },
            });

            expect(affected).toBe(0);
        });

        it('treats a driver that reports no affected count as zero rows', async () => {
            const { repository, typeOrmRepository } = buildHarness();
            typeOrmRepository.update.mockResolvedValueOnce({ affected: undefined, raw: [], generatedMaps: [] });

            const affected = await repository.updateOneById({
                tenantId: TENANT,
                id: CONVERSATION_ID,
                values: { isArchived: true },
            });

            expect(affected).toBe(0);
        });
    });

    describe('transaction propagation', () => {
        it('uses the caller-supplied EntityManager when one is passed', async () => {
            const { repository, getRepository } = buildHarness();
            const transactionalGetRepository = jest
                .fn()
                .mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
            const manager = { getRepository: transactionalGetRepository } as unknown as EntityManager;

            await repository.findOneById({ tenantId: TENANT, id: CONVERSATION_ID, manager });

            expect(transactionalGetRepository).toHaveBeenCalledWith(ConversationEntity);
            expect(getRepository).not.toHaveBeenCalled();
        });

        it('falls back to the DataSource manager when no transaction is in play', async () => {
            const { repository, getRepository } = buildHarness();

            await repository.findOneById({ tenantId: TENANT, id: CONVERSATION_ID });

            expect(getRepository).toHaveBeenCalledWith(ConversationEntity);
        });
    });

    describe('findOne result', () => {
        it('normalises TypeORM null to undefined so Maybe<T> narrowing works', async () => {
            const { repository } = buildHarness();

            await expect(repository.findOneById({ tenantId: TENANT, id: CONVERSATION_ID })).resolves.toBeUndefined();
        });
    });
});
