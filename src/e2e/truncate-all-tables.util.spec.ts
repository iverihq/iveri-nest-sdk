import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { E2E_PRESERVED_TABLES } from './e2e.constant.js';
import { truncateAllTables } from './truncate-all-tables.util.js';

const dataSourceListing = (tables: string[]): { dataSource: DataSource; query: ReturnType<typeof vi.fn> } => {
    const query = vi
        .fn()
        .mockResolvedValueOnce(tables.map((tablename) => ({ tablename })))
        .mockResolvedValue([]);

    return { dataSource: { query } as unknown as DataSource, query };
};

describe('truncateAllTables', () => {
    it('empties every listed table in one statement, restarting identities', async () => {
        const { dataSource, query } = dataSourceListing(['taxi_ride', 'taxi_ride_outbox_event']);

        await truncateAllTables(dataSource);

        expect(query).toHaveBeenLastCalledWith(
            'TRUNCATE TABLE "public"."taxi_ride", "public"."taxi_ride_outbox_event" RESTART IDENTITY CASCADE',
        );
    });

    it("leaves the migration ledger and PostGIS's spatial_ref_sys out of the listing", async () => {
        const { dataSource, query } = dataSourceListing([]);

        await truncateAllTables(dataSource);

        expect(E2E_PRESERVED_TABLES).toEqual(expect.arrayContaining(['migrations', 'spatial_ref_sys']));
        expect(query).toHaveBeenCalledWith(expect.stringContaining('NOT (tablename = ANY($1))'), [
            E2E_PRESERVED_TABLES,
        ]);
    });

    it('issues no TRUNCATE when there is nothing to empty', async () => {
        const { dataSource, query } = dataSourceListing([]);

        await truncateAllTables(dataSource);

        expect(query).toHaveBeenCalledTimes(1);
    });

    it('quotes a table name rather than trusting it', async () => {
        const { dataSource, query } = dataSourceListing(['odd"name']);

        await truncateAllTables(dataSource);

        expect(query).toHaveBeenLastCalledWith('TRUNCATE TABLE "public"."odd""name" RESTART IDENTITY CASCADE');
    });
});
