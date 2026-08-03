/** The two numbers a token bucket is configured by. */
export interface RateLimitPolicy {
    /**
     * Sustained rate, in requests per minute.
     *
     * Per minute rather than per second because that is the unit an operator reasons in, and the
     * conversion to the script's tokens-per-millisecond is arithmetic nobody should have to do
     * in a `.env` file.
     */
    perMinute: number;

    /**
     * Bucket capacity — how many requests may arrive at once after an idle period.
     *
     * Distinct from {@link perMinute} on purpose. Real callers arrive in spikes, and refusing a
     * spike is refusing normal traffic.
     */
    burst: number;
}
