/**
 * How one service exchanges its own API key for a bearer token.
 *
 * Options rather than fixed environment names, like {@link ObjectStorageModuleOptions}: every
 * consumer reads these from its own validated config class, and the SDK cannot type against
 * twelve different ones.
 */
export interface ServiceTokenModuleOptions {
    /**
     * `iveri-identity-api`'s base URL. A trailing slash is tolerated and stripped.
     *
     * Empty or absent means **no credential is configured**, which is a supported state: a
     * service whose outbound work is behind a feature flag boots without one, and
     * `isConfigured()` is how it checks before arming that work rather than discovering it on
     * the first attempt.
     */
    identityApiUrl?: string;

    /** This deployment's tenant-scoped identity API key. Empty or absent means unconfigured. */
    identityApiKey?: string;

    /** How long the exchange itself may take. */
    timeoutMs: number;

    /**
     * How far before expiry a cached token is replaced.
     *
     * It exists because a token that is valid when the decision is made can expire in flight,
     * and the far end's answer to that is a 401 on work that was fine. Every consumer in the
     * fleet uses 30 seconds.
     */
    refreshSkewSeconds: number;
}
