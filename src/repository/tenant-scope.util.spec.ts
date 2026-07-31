import type { UUID } from '@iveri/contracts';
import type { FindOptionsWhere } from 'typeorm';

import type { BaseEntity } from '../entity/base.entity';

import { scopeWhereToTenant, stripManagedColumns } from './tenant-scope.util';

interface ConversationEntity extends BaseEntity {
    contactId: UUID;
    isArchived: boolean;
}

const TENANT: UUID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT: UUID = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('scopeWhereToTenant', () => {
    it('adds the tenant predicate when no criteria are supplied', () => {
        expect(scopeWhereToTenant<ConversationEntity>(TENANT)).toEqual([{ tenantId: TENANT }]);
    });

    it('merges the tenant predicate into a single clause', () => {
        const scoped = scopeWhereToTenant<ConversationEntity>(TENANT, { isArchived: false });

        expect(scoped).toEqual([{ isArchived: false, tenantId: TENANT }]);
    });

    it('overrides a caller-supplied tenantId rather than honouring it', () => {
        // The whole point: a tenant id that flowed in from a request body cannot widen scope.
        const scoped = scopeWhereToTenant<ConversationEntity>(TENANT, { tenantId: OTHER_TENANT });

        expect(scoped).toEqual([{ tenantId: TENANT }]);
    });

    it('applies the tenant predicate to every branch of an OR', () => {
        // A tenant on only the first branch would leave the rest of the OR unscoped.
        const scoped = scopeWhereToTenant<ConversationEntity>(TENANT, [
            { isArchived: true },
            { contactId: OTHER_TENANT, tenantId: OTHER_TENANT },
        ]);

        expect(scoped).toEqual([
            { isArchived: true, tenantId: TENANT },
            { contactId: OTHER_TENANT, tenantId: TENANT },
        ]);
    });

    it('scopes an empty array rather than producing no criteria at all', () => {
        // `find({ where: [] })` matches every row in the table — never emit it.
        const scoped = scopeWhereToTenant<ConversationEntity>(TENANT, [] as FindOptionsWhere<ConversationEntity>[]);

        expect(scoped).toEqual([{ tenantId: TENANT }]);
    });

    it('does not mutate the caller-supplied criteria', () => {
        const where: FindOptionsWhere<ConversationEntity> = { isArchived: false };

        scopeWhereToTenant<ConversationEntity>(TENANT, where);

        expect(where).toEqual({ isArchived: false });
    });
});

describe('stripManagedColumns', () => {
    it('removes tenantId so an update cannot reassign a row to another tenant', () => {
        const stripped = stripManagedColumns<ConversationEntity>({
            isArchived: true,
            tenantId: OTHER_TENANT,
        });

        expect(stripped).toEqual({ isArchived: true });
    });

    it('removes the identity and timestamp columns the database owns', () => {
        const stripped = stripManagedColumns<ConversationEntity>({
            id: 'cccccccc-0000-4000-8000-000000000003',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: new Date(),
            isArchived: false,
        });

        expect(stripped).toEqual({ isArchived: false });
    });

    it('leaves an update with no assignable columns empty rather than throwing', () => {
        expect(stripManagedColumns<ConversationEntity>({ tenantId: OTHER_TENANT })).toEqual({});
    });
});
