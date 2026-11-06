import type { DataSource } from 'typeorm';

import { E2E_PRESERVED_TABLES } from './e2e.constant.js';

/**
 * Empties every table in `public` so each spec starts from nothing.
 *
 * `TRUNCATE … CASCADE` in one statement rather than a `DELETE` per table: foreign keys stop
 * mattering, and identities restart so ids in one spec cannot depend on another having run. The
 * migration ledger and PostGIS's `spatial_ref_sys` survive (see `E2E_PRESERVED_TABLES`).
 */
export const truncateAllTables = async (dataSource: DataSource): Promise<void> => {
    const rows: { tablename: string }[] = await dataSource.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT (tablename = ANY($1))`,
        [E2E_PRESERVED_TABLES],
    );

    if (rows.length === 0) {
        return;
    }

    const tables = rows.map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`).join(', ');
    await dataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
};
