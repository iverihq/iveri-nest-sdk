/**
 * The Postgres image every service's suite runs against: the major the Compose stack and RDS run.
 * A suite that passes on a different major than production is testing a database we do not ship.
 */
export const E2E_POSTGRES_IMAGE = 'postgres:17-alpine';

/**
 * For a service whose migrations create PostGIS objects. A plain image lets the suite pass until
 * the first such migration, then fail only in an environment that matters.
 */
export const E2E_POSTGIS_IMAGE = 'postgis/postgis:17-3.5';

/** The Redis major in the Compose stack, pinned for the same reason. */
export const E2E_REDIS_IMAGE = 'redis:7-alpine';

/** The ledger table TypeORM records applied migrations in — the name every service configures. */
export const E2E_MIGRATIONS_TABLE = 'migrations';

/**
 * Tables that belong to the database rather than to the service, and so survive truncation.
 *
 * PostGIS installs `spatial_ref_sys` into `public` like any other table. Truncating it leaves the
 * schema intact and every `geography` query failing with `Cannot find SRID (4326)` — which
 * `iveri-mobility-api` met the day its first distance query ran, after a worker slice that never
 * consulted the table had passed for weeks.
 */
export const E2E_PRESERVED_TABLES: readonly string[] = [E2E_MIGRATIONS_TABLE, 'spatial_ref_sys'];

/**
 * Durability is startup cost paid on every run for nothing: the data lives for seconds and is
 * thrown away.
 */
export const E2E_POSTGRES_COMMAND = [
    'postgres',
    '-c',
    'fsync=off',
    '-c',
    'synchronous_commit=off',
    '-c',
    'full_page_writes=off',
];
