import type { DataSourceOptions } from 'typeorm';

/** What one service's end-to-end suite needs started before its first spec runs. */
export interface E2eContainersOptions {
    /** Name of the throwaway database, conventionally `<service>_test`. */
    database: string;

    /**
     * The service's migrations: the same exported list its runtime and CLI data sources run, so
     * every suite proves they apply cleanly to an empty database.
     */
    migrations: NonNullable<DataSourceOptions['migrations']>;

    /** {@link E2E_POSTGIS_IMAGE} for a service with PostGIS migrations; the plain image otherwise. */
    postgresImage?: string;

    /**
     * Start a real Redis as well. For a service whose correctness rests on Redis's own execution
     * model — the rate limiter's atomic Lua script — which a fake written by the same person
     * making the claim cannot test.
     */
    redis?: boolean;
}
