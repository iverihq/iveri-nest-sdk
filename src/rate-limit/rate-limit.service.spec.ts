import type { Redis } from 'ioredis';

import type { RedisService } from '../redis/redis.service';

import { RateLimitService } from './rate-limit.service';

/** The four arguments the Lua script takes after its key, as strings on the wire. */
type BucketCall = [string, string, string, string, string];

const NOW = new Date('2026-08-03T12:00:00.000Z');

const OPTIONS = { namespace: 'conduit' };

/**
 * A client that records what the script was called with and answers as told.
 *
 * The script's own behaviour is proven against a real Redis in `conduit-api`'s
 * `rate-limit.e2e-spec.ts` — a fake that ran Lua would be a fake of the thing under test. What
 * is worth checking here is the translation *into* it, because a per-minute rate silently
 * floored to zero produces a bucket that never refills and a suite that never notices.
 */
const stubClient = (
    result: [number, number, number] | Error,
): { client: Redis; calls: BucketCall[]; defineCommandCount: () => number } => {
    const calls: BucketCall[] = [];
    let defineCommandCount = 0;

    const client = {
        defineCommand: (): void => {
            defineCommandCount += 1;
        },
        iveriTokenBucket: (...args: BucketCall): Promise<[number, number, number]> => {
            calls.push(args);

            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        },
    } as unknown as Redis;

    return { client, calls, defineCommandCount: () => defineCommandCount };
};

const redisServiceReturning = (client: Redis | null): RedisService =>
    ({ getClient: () => client, isConfigured: () => client !== null }) as unknown as RedisService;

const consume = (service: RateLimitService, policy = { perMinute: 600, burst: 200 }) =>
    service.consume({ input: { scope: 'INGRESS', hashTag: 'caller', policy, now: NOW } });

describe('RateLimitService', () => {
    describe('when Redis is not configured', () => {
        it('allows the request', async () => {
            const service = new RateLimitService(redisServiceReturning(null), OPTIONS);

            await expect(consume(service)).resolves.toMatchObject({ isAllowed: true });
        });

        it('reports that nothing was enforced, rather than a full allowance', async () => {
            const service = new RateLimitService(redisServiceReturning(null), OPTIONS);

            // The distinction a guard uses to decide whether to write a `RateLimit-*` header.
            // Claiming a full allowance would be a confident lie about a check that never ran.
            await expect(consume(service)).resolves.toMatchObject({ isEnforced: false });
        });
    });

    describe('when Redis is unreachable', () => {
        it('fails open rather than refusing the request', async () => {
            const { client } = stubClient(new Error('Connection is closed.'));
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            // The load-bearing decision in this class. Refusing traffic because the limiter is
            // unavailable turns a degraded dependency into an outage.
            await expect(consume(service)).resolves.toMatchObject({ isAllowed: true, isEnforced: false });
        });
    });

    describe('when Redis answers', () => {
        it('allows a request the script permitted', async () => {
            const { client } = stubClient([1, 42, 0]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await expect(consume(service)).resolves.toEqual({
                isAllowed: true,
                isEnforced: true,
                limit: 200,
                remaining: 42,
                retryAfterSeconds: 0,
            });
        });

        it('refuses a request the script denied', async () => {
            const { client } = stubClient([0, 0, 1_500]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await expect(consume(service)).resolves.toMatchObject({ isAllowed: false, isEnforced: true });
        });

        it('rounds the retry hint up, so a refused caller never retries immediately', async () => {
            const { client } = stubClient([0, 0, 1_500]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await expect(consume(service)).resolves.toMatchObject({ retryAfterSeconds: 2 });
        });

        it('never reports a zero-second wait on a refusal', async () => {
            const { client } = stubClient([0, 0, 1]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            // A sub-second wait rounded down would tell the client to retry at once, which is
            // the storm the hint exists to stop.
            await expect(consume(service)).resolves.toMatchObject({ retryAfterSeconds: 1 });
        });

        it('reports the burst as the limit, because that is the bucket capacity', async () => {
            const { client } = stubClient([1, 5, 0]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await expect(consume(service, { perMinute: 60, burst: 10 })).resolves.toMatchObject({ limit: 10 });
        });
    });

    describe('the arguments handed to the script', () => {
        it('converts a per-minute rate to fractional tokens per millisecond', async () => {
            const { client, calls } = stubClient([1, 1, 0]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await consume(service, { perMinute: 600, burst: 200 });

            // 600/60000 = 0.01. An integer conversion floors this to 0, and a bucket refilling
            // at zero tokens per millisecond limits every caller once and then forever.
            expect(calls[0][2]).toBe('0.01');
        });

        it('keeps a sub-token rate rather than flooring it', async () => {
            const { client, calls } = stubClient([1, 1, 0]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await consume(service, { perMinute: 6, burst: 2 });

            expect(Number(calls[0][2])).toBeGreaterThan(0);
        });

        it('passes the burst as the capacity and the caller-supplied instant', async () => {
            const { client, calls } = stubClient([1, 1, 0]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await consume(service, { perMinute: 600, burst: 200 });

            expect(calls[0][1]).toBe('200');
            expect(calls[0][3]).toBe(String(NOW.getTime()));
        });

        it('spends one token per request', async () => {
            const { client, calls } = stubClient([1, 1, 0]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await consume(service);

            expect(calls[0][4]).toBe('1');
        });

        it('namespaces and scopes the key', async () => {
            const { client, calls } = stubClient([1, 1, 0]);
            const service = new RateLimitService(redisServiceReturning(client), { namespace: 'identity' });

            await service.consume({
                input: {
                    scope: 'ADMIN',
                    hashTag: 'tenant',
                    suffix: 'user',
                    policy: { perMinute: 60, burst: 10 },
                    now: NOW,
                },
            });

            expect(calls[0][0]).toBe('identity:ratelimit:admin:{tenant}:user');
        });
    });

    describe('script registration', () => {
        it('defines the command once, however many requests arrive', async () => {
            const { client, defineCommandCount } = stubClient([1, 1, 0]);
            const service = new RateLimitService(redisServiceReturning(client), OPTIONS);

            await consume(service);
            await consume(service);
            await consume(service);

            // ioredis throws if the same command name is defined twice on one client.
            expect(defineCommandCount()).toBe(1);
        });
    });
});
