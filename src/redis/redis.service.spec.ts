import { RedisService } from './redis.service';

/**
 * The no-URL path only.
 *
 * Everything else this class does is connection behaviour, which is a claim about ioredis and
 * about a real server — `conduit-api` proves it against a Redis in Testcontainers. What is worth
 * pinning here is that an absent URL is a **supported state** rather than a crash, because that
 * is the contract every consumer's degraded path is written against.
 */
describe('RedisService without a URL', () => {
    it('constructs rather than throwing', () => {
        expect(() => new RedisService({})).not.toThrow();
    });

    it('reports that it is not configured', () => {
        expect(new RedisService({}).isConfigured()).toBe(false);
    });

    it('hands back no client, so callers take their degraded path', () => {
        expect(new RedisService({}).getClient()).toBeNull();
    });

    it('treats an empty string as absent', () => {
        // An unset variable that has been through a `.env` file arrives as `''` rather than
        // `undefined`, and connecting to an empty URL is a confusing crash at boot.
        expect(new RedisService({ url: '' }).isConfigured()).toBe(false);
    });

    it('shuts down cleanly with nothing to close', async () => {
        await expect(new RedisService({}).onApplicationShutdown()).resolves.toBeUndefined();
    });
});
