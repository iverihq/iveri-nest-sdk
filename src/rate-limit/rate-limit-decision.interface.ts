/** Outcome of consuming from a bucket. */
export interface RateLimitDecision {
    /** Whether the request may proceed. `true` when the limiter could not run — see below. */
    isAllowed: boolean;

    /**
     * Whether a limit was actually applied.
     *
     * `false` means the limiter could not reach Redis and the request was allowed **without**
     * being counted. It exists so a caller can tell "you have allowance left" from "nobody
     * checked", which are the same `isAllowed` and very different facts: the first belongs in a
     * response header, the second in a log line someone should act on.
     */
    isEnforced: boolean;

    /** Bucket capacity, reported as the limit. */
    limit: number;

    /** Tokens left after this request, floored. */
    remaining: number;

    /** Seconds until the next request would be allowed. `0` when this one was. */
    retryAfterSeconds: number;
}
