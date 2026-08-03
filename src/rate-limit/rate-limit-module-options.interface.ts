/** How a service configures the rate limiter. */
export interface RateLimitModuleOptions {
    /**
     * First segment of every key the limiter writes — the owning service, e.g. `conduit`.
     *
     * One Redis is shared by the fleet, the way one Postgres instance is, so this is what keeps
     * two services' buckets apart. It names *which service wrote this key*, which is a fact
     * about the codebase rather than the environment, so pass a constant and not a variable.
     */
    namespace: string;
}
