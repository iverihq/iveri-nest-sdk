/**
 * Name the script is registered under on the ioredis client.
 *
 * `defineCommand` handles the `EVALSHA` → `NOSCRIPT` → `EVAL` dance, so the script body crosses
 * the wire once per server rather than once per request. Namespaced because the client is
 * shared and a second custom command must not be able to overwrite this one.
 */
export const TOKEN_BUCKET_COMMAND = 'iveriTokenBucket';

/**
 * Token bucket, evaluated server-side in one round trip.
 *
 * **Why a token bucket and not a fixed window.** A fixed window (`INCR` + `EXPIRE`) is three
 * lines shorter and lets a caller spend the whole allowance at the end of one window and the
 * whole allowance at the start of the next — twice the configured rate, at the worst possible
 * moment. A bucket also separates the two numbers a window conflates: the **sustained rate** a
 * service is willing to carry, and the **burst** a caller is allowed to arrive in. Real traffic
 * comes in spikes — a webhook provider hands over a few hundred events at once after a backlog
 * clears, a panel fires a screen's worth of queries on one page load — and neither is abuse.
 *
 * **Why Lua and not a pipeline.** Read-modify-write across separate commands lets two replicas
 * interleave and both see enough tokens. A script is the only way to make the check and the
 * decrement one atomic step, and it is also what keeps the whole limiter to a single round trip
 * on the ingress path.
 *
 * `now` is supplied by the caller rather than read from `redis.call('TIME')`. TIME inside a
 * script is allowed on modern servers but its interaction with replication has changed across
 * versions, and a limiter that behaves differently on the Redis someone happens to run is worse
 * than one whose clock can drift by milliseconds. Skew is contained by only ever advancing
 * `updatedAt` — see below.
 *
 * KEYS[1] bucket key
 * ARGV[1] capacity — the burst, in tokens
 * ARGV[2] refillTokensPerMs — the sustained rate
 * ARGV[3] now — caller's clock, milliseconds
 * ARGV[4] cost — tokens this request spends
 *
 * Returns `{ allowed, remaining, retryAfterMs }`.
 */
export const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local stored = redis.call('HMGET', key, 'tokens', 'updatedAt')
local tokens = tonumber(stored[1])
local updatedAt = tonumber(stored[2])

-- An absent bucket and a full bucket are the same thing. That equivalence is what lets the key
-- carry a TTL and expire when idle, instead of one key per caller living forever.
if tokens == nil or updatedAt == nil then
    tokens = capacity
    updatedAt = now
end

-- Only ever move forward. Replicas do not share a clock, and one running a few milliseconds
-- behind must not be able to rewind the bucket — that would refill it again on the next call
-- from a replica that is ahead, handing out free tokens at exactly the moment of contention.
if now > updatedAt then
    tokens = math.min(capacity, tokens + (now - updatedAt) * refillPerMs)
    updatedAt = now
end

local allowed = 0
if tokens >= cost then
    allowed = 1
    tokens = tokens - cost
end

-- Fractional tokens are stored, not rounded. At 600/min a request costs 0.1 seconds of refill;
-- rounding here would mean a bucket that never quite refills and a limit quietly stricter than
-- the one configured.
redis.call('HSET', key, 'tokens', tokens, 'updatedAt', updatedAt)

-- TTL is the time this bucket needs to refill to full, plus a second of slack. Expiring earlier
-- would forgive a caller their spent tokens; expiring later keeps a key nobody will read.
redis.call('PEXPIRE', key, math.ceil((capacity - tokens) / refillPerMs) + 1000)

local retryAfterMs = 0
if allowed == 0 then
    retryAfterMs = math.ceil((cost - tokens) / refillPerMs)
end

-- Lua numbers truncate on their way into an integer reply, so remaining is floored deliberately
-- rather than by accident: reporting 4 tokens left when there are 4.9 is the honest direction.
return { allowed, math.floor(tokens), retryAfterMs }
`;
