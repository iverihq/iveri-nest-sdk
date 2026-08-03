import { createHash } from 'node:crypto';

import type { Maybe } from '@iveri/contracts';

import { RATE_LIMIT_HASH_LENGTH, RATE_LIMIT_KEY_ENTITY } from './rate-limit.constant';

/**
 * Builds a bucket key.
 *
 * Shape: `<namespace>:ratelimit:<scope>:{<hashTag>}[:<suffix>]` — the fleet convention from
 * `.claude/rules/redis.md`, lowercase and colon-separated. The namespace is the owning service,
 * because one Redis is shared the way one Postgres instance is.
 *
 * **The braces are a cluster hash tag, and they are here despite every operation being
 * single-key.** ElastiCache runs in cluster mode; a hash tag pins a key to the slot its contents
 * hash to, so everything belonging to one caller lands on one node and a future lock or counter
 * for them can be touched in a single multi-key command. Adding tags later means rewriting keys
 * a live system is already reading — the one part of key naming that is genuinely expensive to
 * get wrong afterwards.
 *
 * The tag is therefore the part identifying **who is being limited**, and anything that merely
 * narrows it — a user inside a tenant — goes in the suffix, outside the braces, so a whole
 * tenant still shares a slot.
 */
export const buildRateLimitKey = (dto: {
    namespace: string;
    scope: string;
    hashTag: string;
    suffix?: Maybe<string>;
}): string => {
    const key = `${dto.namespace}:${RATE_LIMIT_KEY_ENTITY}:${dto.scope.toLowerCase()}:{${dto.hashTag}}`;

    return dto.suffix ? `${key}:${dto.suffix}` : key;
};

/**
 * Hashes an identifier that must not appear in a key in the clear.
 *
 * **Redis keys are the least private thing in a system** — they surface in `MONITOR`, in
 * `SLOWLOG`, in `--bigkeys`, in whatever a support session runs. Anything that is itself a
 * credential (a webhook ingress token, an API key) goes through here before it becomes part of
 * a key.
 *
 * SHA-256 truncated to {@link RATE_LIMIT_HASH_LENGTH} hex characters — 128 bits, so a collision
 * is not something anyone will meet, and one would merge two callers' buckets rather than let
 * either past a limit.
 *
 * Identifiers that are **not** secret — a tenant id, a user id, both already in the token the
 * caller presented — should not be hashed. Nothing is protected by obscuring them, and a
 * readable key is worth a great deal when someone is working out why a caller is being limited.
 */
export const hashRateLimitIdentifier = (value: string): string =>
    createHash('sha256').update(value).digest('hex').slice(0, RATE_LIMIT_HASH_LENGTH);
