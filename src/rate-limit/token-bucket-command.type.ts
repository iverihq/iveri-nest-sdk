import type { Result } from 'ioredis';

/**
 * Types the custom command {@link RateLimitService} registers with `defineCommand`.
 *
 * ioredis attaches scripts to the client at runtime, so without this the call site is an `any`
 * — and `any` is banned fleet-wide for the reason on display here: the script takes four
 * positional numeric arguments in an order nothing else enforces, and returns a three-element
 * tuple whose meaning is entirely positional.
 *
 * Declaration merging into `RedisCommander` is the mechanism ioredis documents. The file is
 * imported for its side effect; it emits no runtime code.
 */
declare module 'ioredis' {
    interface RedisCommander<Context> {
        /**
         * @param key bucket key
         * @param capacity burst, in tokens
         * @param refillTokensPerMs sustained rate
         * @param nowMs caller's clock
         * @param cost tokens this request spends
         * @returns `[allowed, remaining, retryAfterMs]`
         */
        iveriTokenBucket(
            key: string,
            capacity: string,
            refillTokensPerMs: string,
            nowMs: string,
            cost: string,
        ): Result<[number, number, number], Context>;
    }
}
