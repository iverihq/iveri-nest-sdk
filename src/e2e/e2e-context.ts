import { inject } from 'vitest';

/**
 * The suite's Postgres URL, from inside a worker.
 *
 * Throws rather than returning an empty string: a suite whose `globalSetup` never ran would
 * otherwise boot an application against whatever `DATABASE_URL` the shell happened to hold — the
 * developer's own database, which is the one thing this harness exists to keep a test away from.
 */
export const e2eDatabaseUrl = (): string => {
    const url = inject('iveriE2eDatabaseUrl');
    if (!url) {
        throw new Error('No e2e database URL was provided — is e2eGlobalSetup() the globalSetup of this project?');
    }

    return url;
};

/** The suite's Redis URL, from inside a worker. Throws when the suite did not ask for one. */
export const e2eRedisUrl = (): string => {
    const url = inject('iveriE2eRedisUrl');
    if (!url) {
        throw new Error('No e2e Redis URL was provided — pass { redis: true } to e2eGlobalSetup().');
    }

    return url;
};
