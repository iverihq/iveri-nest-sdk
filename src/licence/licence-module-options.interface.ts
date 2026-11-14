import type { IveriProduct } from '@iveri/contracts/platform';

/**
 * How one product asks `iveri-billing-api` whether a company may use it.
 *
 * Options rather than fixed environment names, like {@link ServiceTokenModuleOptions}: each product reads them from
 * its own validated config class, under its own names (`HR_LICENCE_CHECK_ENABLED`, `CLINIC_LICENCE_CACHE_SECONDS`).
 */
export interface LicenceModuleOptions {
    /** The product this deployment is. Billing is asked about it, and an answer about any other is refused. */
    product: IveriProduct;

    /**
     * Whether the check runs at all. Off, nothing asks billing and nothing is refused, so a deployment that has not
     * given its companies licences yet keeps working. The product's config refuses to start with it on and billing's
     * address or the operator key missing.
     */
    isEnabled: boolean;

    /** `iveri-billing-api`'s base URL. A trailing slash is tolerated. Empty while the check is off. */
    billingApiUrl?: string;

    /** How long one licence check may take. */
    billingTimeoutMs: number;

    /** How long one answer about a company is trusted before billing is asked again. */
    cacheSeconds: number;

    /** `iveri-identity-api`'s base URL, where the operator key is exchanged for a token. */
    identityApiUrl?: string;

    /**
     * An API key in Iveri's operator workspace holding only `platform:licence:check`. It is a second credential beside
     * the product's own `IDENTITY_API_KEY`, because that one belongs to a company and a company can never hold a
     * platform permission.
     */
    platformApiKey?: string;

    /** How long the token exchange may take. */
    identityTimeoutMs: number;

    /** How far before expiry the operator token is replaced. Every consumer uses 30 seconds. */
    refreshSkewSeconds: number;
}
