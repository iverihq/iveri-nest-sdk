import { describe, expect, it } from 'vitest';

import { e2eDatabaseUrl, e2eRedisUrl } from './e2e-context.js';

describe('e2e context', () => {
    // This suite has no e2eGlobalSetup, which is exactly the misconfiguration being named.
    it('refuses to hand out a database URL nothing provided', () => {
        expect(() => e2eDatabaseUrl()).toThrow(/e2eGlobalSetup\(\)/u);
    });

    it('refuses to hand out a Redis URL nothing provided', () => {
        expect(() => e2eRedisUrl()).toThrow(/\{ redis: true \}/u);
    });
});
