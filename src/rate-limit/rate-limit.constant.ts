/** Key segment naming what the limiter stores, per `<service>:<entity>:<id>`. */
export const RATE_LIMIT_KEY_ENTITY = 'ratelimit';

/**
 * What one request costs.
 *
 * A named constant because the first thing that wants a different number is a bulk operation —
 * a redrive, an import — which should cost more than a page load.
 */
export const RATE_LIMIT_DEFAULT_COST = 1;

/** Characters of the SHA-256 hex digest kept when an identifier is hashed into a key. */
export const RATE_LIMIT_HASH_LENGTH = 32;

/** Injection token for the resolved {@link RateLimitModuleOptions}. */
export const RATE_LIMIT_MODULE_OPTIONS = Symbol('RATE_LIMIT_MODULE_OPTIONS');
