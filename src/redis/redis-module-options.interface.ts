import type { Maybe } from '@iveri/contracts';

/** How a service configures its Redis connection. */
export interface RedisModuleOptions {
    /**
     * `redis://` or `rediss://`.
     *
     * **Absent is legal and means "no Redis".** `RedisService.getClient()` then returns `null`
     * and every consumer degrades — which is what lets a service that only uses Redis for rate
     * limiting stay runnable with one container. A service for which Redis is not optional
     * enforces that in its **own** env validation, where the condition can be expressed
     * honestly; the SDK cannot know whether it matters.
     */
    url?: Maybe<string>;

    /**
     * Ceiling on a single command.
     *
     * Bounds the latency Redis can add to a request when the server accepts a connection and
     * then stops answering — which neither the disabled offline queue nor the connect timeout
     * covers.
     */
    commandTimeoutMs?: number;
}
