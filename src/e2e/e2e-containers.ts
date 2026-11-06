import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';

import type { E2eContainersOptions } from './e2e-containers-options.interface.js';
import { E2E_MIGRATIONS_TABLE, E2E_POSTGRES_COMMAND, E2E_POSTGRES_IMAGE, E2E_REDIS_IMAGE } from './e2e.constant.js';

declare module 'vitest' {
    export interface ProvidedContext {
        /** Connection URL of the suite's throwaway Postgres; read it with `e2eDatabaseUrl()`. */
        iveriE2eDatabaseUrl: string;
        /** Connection URL of its Redis, or `null` when the suite asked for none. */
        iveriE2eRedisUrl: string | null;
    }
}

/** Loaded only when asked for, so a service with no Redis need not install the module. */
const startRedis = async (): Promise<StartedRedisContainer> => {
    const { RedisContainer } = await import('@testcontainers/redis');

    return new RedisContainer(E2E_REDIS_IMAGE).start();
};

/** A Vitest `globalSetup` function: runs once, before any worker, and returns its teardown. */
export type E2eGlobalSetup = (project: TestProject) => Promise<() => Promise<void>>;

/**
 * Builds a service's Vitest `globalSetup`: one throwaway Postgres, its migrations applied, and a
 * Redis when asked for, all stopped when the run ends.
 *
 * ```ts
 * // test/helper/global-setup.ts
 * export const setup = e2eGlobalSetup({ database: 'taxi_test', migrations: MIGRATIONS });
 * ```
 *
 * **Never the Compose database.** A run must not be able to see or corrupt the data being
 * developed against, and a container thrown away afterwards makes a clean start structural rather
 * than a discipline. **Real migrations, never `synchronize`**: that would build the schema from the
 * entities — exactly the schema the migrations may have drifted from — and the suite would stay
 * green while production broke.
 *
 * The URLs reach the workers through Vitest's `provide`, the channel that exists for this, rather
 * than through environment variables written by one process and read by another.
 */
export const e2eGlobalSetup =
    (options: E2eContainersOptions): E2eGlobalSetup =>
    async (project) => {
        const postgres = await new PostgreSqlContainer(options.postgresImage ?? E2E_POSTGRES_IMAGE)
            .withDatabase(options.database)
            .withUsername('iveri')
            .withPassword('iveri')
            .withCommand(E2E_POSTGRES_COMMAND)
            .start();

        const databaseUrl = postgres.getConnectionUri();
        const dataSource = new DataSource({
            type: 'postgres',
            url: databaseUrl,
            migrations: options.migrations,
            migrationsTableName: E2E_MIGRATIONS_TABLE,
        });

        await dataSource.initialize();
        try {
            await dataSource.runMigrations();
        } finally {
            await dataSource.destroy();
        }

        const redis = options.redis ? await startRedis() : null;

        project.provide('iveriE2eDatabaseUrl', databaseUrl);
        project.provide('iveriE2eRedisUrl', redis?.getConnectionUrl() ?? null);

        return async () => {
            await Promise.all([postgres.stop(), redis?.stop()]);
        };
    };
