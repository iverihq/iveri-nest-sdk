import { buildRateLimitKey, hashRateLimitIdentifier } from './rate-limit-key.util';

describe('buildRateLimitKey', () => {
    it('leads with the service namespace and the limiter entity', () => {
        const key = buildRateLimitKey({ namespace: 'conduit', scope: 'INGRESS', hashTag: 'abc' });

        expect(key.startsWith('conduit:ratelimit:')).toBe(true);
    });

    it('lowercases the scope, so the key matches the documented convention', () => {
        expect(buildRateLimitKey({ namespace: 'identity', scope: 'AUTH', hashTag: 'abc' })).toBe(
            'identity:ratelimit:auth:{abc}',
        );
    });

    it('wraps the identity in a cluster hash tag', () => {
        expect(buildRateLimitKey({ namespace: 'conduit', scope: 'INGRESS', hashTag: 'abc' })).toBe(
            'conduit:ratelimit:ingress:{abc}',
        );
    });

    it('keeps a suffix outside the hash tag, so one tenant hashes to one slot', () => {
        // Inside the braces, a tenant's keys would land on different slots and a future
        // multi-key operation over that tenant would be impossible in a cluster.
        expect(buildRateLimitKey({ namespace: 'conduit', scope: 'ADMIN', hashTag: 'tenant-1', suffix: 'user-9' })).toBe(
            'conduit:ratelimit:admin:{tenant-1}:user-9',
        );
    });

    it('emits exactly one hash tag, whatever the suffix', () => {
        const key = buildRateLimitKey({
            namespace: 'conduit',
            scope: 'ADMIN',
            hashTag: 'tenant-1',
            suffix: 'user-9',
        });

        expect(key.match(/\{/g)).toHaveLength(1);
        expect(key.match(/\}/g)).toHaveLength(1);
    });

    it('omits the separator when there is no suffix', () => {
        expect(buildRateLimitKey({ namespace: 'conduit', scope: 'INGRESS', hashTag: 'abc', suffix: null })).toBe(
            'conduit:ratelimit:ingress:{abc}',
        );
    });

    it('separates two services sharing one Redis', () => {
        // The reason the namespace exists: one instance, the way there is one Postgres.
        const conduit = buildRateLimitKey({ namespace: 'conduit', scope: 'ADMIN', hashTag: 'same' });
        const identity = buildRateLimitKey({ namespace: 'identity', scope: 'ADMIN', hashTag: 'same' });

        expect(conduit).not.toBe(identity);
    });

    it('separates two scopes in one service', () => {
        const auth = buildRateLimitKey({ namespace: 'identity', scope: 'AUTH', hashTag: 'same' });
        const admin = buildRateLimitKey({ namespace: 'identity', scope: 'ADMIN', hashTag: 'same' });

        expect(auth).not.toBe(admin);
    });

    it('separates two callers in one scope', () => {
        const first = buildRateLimitKey({ namespace: 'conduit', scope: 'INGRESS', hashTag: 'one' });
        const second = buildRateLimitKey({ namespace: 'conduit', scope: 'INGRESS', hashTag: 'two' });

        expect(first).not.toBe(second);
    });
});

describe('hashRateLimitIdentifier', () => {
    it('never returns the value it was given', () => {
        const token = 'ing_supersecrettokenvalue';

        expect(hashRateLimitIdentifier(token)).not.toContain(token);
    });

    it('is stable, so the same caller keeps the same bucket', () => {
        expect(hashRateLimitIdentifier('ing_abc')).toBe(hashRateLimitIdentifier('ing_abc'));
    });

    it('separates callers', () => {
        expect(hashRateLimitIdentifier('ing_abc')).not.toBe(hashRateLimitIdentifier('ing_abd'));
    });

    it('produces 32 hex characters — 128 bits of a SHA-256 digest', () => {
        expect(hashRateLimitIdentifier('ing_abc')).toMatch(/^[0-9a-f]{32}$/);
    });

    it('cannot forge a hash tag, whatever it is given', () => {
        // Hex by construction, pinned because the key format depends on the tag containing
        // exactly one opening and one closing brace.
        const key = buildRateLimitKey({
            namespace: 'conduit',
            scope: 'INGRESS',
            hashTag: hashRateLimitIdentifier('ing_{}:evil'),
        });

        expect(key.match(/\{/g)).toHaveLength(1);
    });
});
