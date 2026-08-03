import type { Maybe } from '@iveri/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

import type { RateLimitDecision } from './rate-limit-decision.interface';
import { buildRateLimitKey } from './rate-limit-key.util';
import type { RateLimitModuleOptions } from './rate-limit-module-options.interface';
import type { RateLimitPolicy } from './rate-limit-policy.interface';
import { RATE_LIMIT_DEFAULT_COST, RATE_LIMIT_MODULE_OPTIONS } from './rate-limit.constant';
// Declaration merging for the custom command registered below. Side-effect import: the file
// emits no runtime code, and without it `iveriTokenBucket` is not on the client's type.
import './token-bucket-command.type';
import { TOKEN_BUCKET_COMMAND, TOKEN_BUCKET_SCRIPT } from './token-bucket.constant';

/** Milliseconds in a minute, for converting a per-minute policy into the script's refill rate. */
const MS_PER_MINUTE = 60_000;

/** What a caller passes to spend a token. */
export interface ConsumeRateLimitInput {
    /**
     * What the limit is counted against — `INGRESS`, `AUTH`, `ADMIN`.
     *
     * A `string` rather than an SDK enum: what surfaces a service has, and which of them deserve
     * separate buckets, is the one part of rate limiting that is genuinely service-specific.
     * Each service declares its own enum and passes a member.
     */
    scope: string;

    /**
     * Who is being limited. Goes inside the cluster hash tag; hash it first with
     * `hashRateLimitIdentifier` when it is itself a credential.
     */
    hashTag: string;

    /** Narrows the bucket within a hash tag, e.g. a user inside a tenant. */
    suffix?: Maybe<string>;

    policy: RateLimitPolicy;

    /**
     * The instant to evaluate refill at.
     *
     * Supplied rather than read inside the service so a spec can move a bucket forward in time
     * without sleeping through it. A limiter whose tests take a real minute to prove a
     * per-minute rate is a limiter nobody will test.
     */
    now: Date;
}

/**
 * Consumes from a token bucket in Redis.
 *
 * ## This limiter fails **open**
 *
 * When Redis cannot be reached the request is allowed and the decision is marked
 * `isEnforced: false`. That is a real trade and worth stating rather than discovering: whoever
 * can take Redis down can also take the limit off.
 *
 * It is the right way round for what this is. Rate limiting bounds **resource exhaustion**; it
 * is not access control and authorizes nothing — the checks deciding whether a caller may be
 * here at all (authentication, permissions, signature verification) fail closed and none of them
 * touch Redis. Refusing traffic because the limiter is unavailable converts a degraded
 * dependency into an outage, and in a service whose job is receiving events from third parties,
 * a refused request can be permanently lost data.
 *
 * **A service that wants the opposite must implement it at the call site**, where the reasoning
 * can be written down: check `isEnforced` and refuse. The SDK does not offer a flag for it,
 * because a fail-closed limiter is a decision to take a whole surface down and should not be a
 * boolean somebody flips.
 *
 * The failure is never silent: every unenforced decision says so, and {@link RedisService} logs
 * the connection error behind it.
 */
@Injectable()
export class RateLimitService {
    private readonly logger = new Logger(RateLimitService.name);

    /** Whether the Lua script has been attached to the client yet. */
    private isCommandDefined = false;

    constructor(
        private readonly redisService: RedisService,
        @Inject(RATE_LIMIT_MODULE_OPTIONS) private readonly options: RateLimitModuleOptions,
    ) {}

    /**
     * Spends one token from a caller's bucket.
     *
     * One round trip, whether allowed or refused — the point of evaluating the bucket inside
     * Redis rather than reading, deciding and writing back.
     */
    async consume(dto: { input: ConsumeRateLimitInput }): Promise<RateLimitDecision> {
        const { input } = dto;
        const client = this.redisService.getClient();

        if (!client) {
            // No Redis configured. Not an error and not logged per request: `RedisService` said
            // so once at startup, and repeating it on every request would be the noise that
            // makes the startup warning worthless.
            return RateLimitService.unenforced(input.policy);
        }

        const key = buildRateLimitKey({
            namespace: this.options.namespace,
            scope: input.scope,
            hashTag: input.hashTag,
            suffix: input.suffix,
        });

        try {
            this.defineCommandOnce();

            const [allowed, remaining, retryAfterMs] = await client.iveriTokenBucket(
                key,
                String(input.policy.burst),
                String(RateLimitService.toRefillPerMs(input.policy)),
                String(input.now.getTime()),
                String(RATE_LIMIT_DEFAULT_COST),
            );

            return {
                isAllowed: allowed === 1,
                isEnforced: true,
                limit: input.policy.burst,
                remaining,
                // Rounded **up**: a client told to wait 0 seconds retries immediately and is
                // refused again, which is the retry storm the hint exists to prevent.
                retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
            };
        } catch (error: unknown) {
            this.logger.error({
                message: 'Rate limit check failed — allowing the request unlimited',
                scope: input.scope,
                error: error instanceof Error ? error.message : String(error),
            });

            return RateLimitService.unenforced(input.policy);
        }
    }

    /**
     * Attaches the script to the client on first use.
     *
     * Not in the constructor: the client may not exist there, and `defineCommand` throws if the
     * same name is registered twice. Once per process either way — this is a singleton and there
     * is one client.
     */
    private defineCommandOnce(): void {
        if (this.isCommandDefined) {
            return;
        }

        const client = this.redisService.getClient();

        if (client) {
            client.defineCommand(TOKEN_BUCKET_COMMAND, { numberOfKeys: 1, lua: TOKEN_BUCKET_SCRIPT });
            this.isCommandDefined = true;
        }
    }

    /**
     * Tokens per millisecond.
     *
     * Deliberately **not** rounded. At 600/minute a token is 0.01 per millisecond, and an
     * integer conversion would floor that to zero — a bucket that never refills, so every caller
     * would be limited exactly once and then permanently. The script stores fractional tokens
     * for the same reason.
     */
    private static toRefillPerMs(policy: RateLimitPolicy): number {
        return policy.perMinute / MS_PER_MINUTE;
    }

    /** The decision when no limit could be applied: allow, and say that nobody counted. */
    private static unenforced(policy: RateLimitPolicy): RateLimitDecision {
        return {
            isAllowed: true,
            isEnforced: false,
            limit: policy.burst,
            remaining: policy.burst,
            retryAfterSeconds: 0,
        };
    }
}
