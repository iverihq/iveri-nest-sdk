/**
 * How long a Redis connection error is suppressed after one is logged.
 *
 * ioredis emits an `error` event on **every** reconnect attempt, so an outage that lasts a
 * night writes tens of thousands of identical lines and buries whatever else happened. One
 * line a minute, carrying the count it stands for, says the same thing.
 */
export const REDIS_ERROR_LOG_INTERVAL_MS = 60_000;

/** Longest a reconnect attempt backs off to. */
export const REDIS_RECONNECT_MAX_DELAY_MS = 5_000;

/** How long the initial connection may take before it is retried. */
export const REDIS_CONNECT_TIMEOUT_MS = 5_000;

/** Default ceiling on a single command, when a service does not set its own. */
export const REDIS_DEFAULT_COMMAND_TIMEOUT_MS = 1_000;

/** Injection token for the resolved {@link RedisModuleOptions}. */
export const REDIS_MODULE_OPTIONS = Symbol('REDIS_MODULE_OPTIONS');
