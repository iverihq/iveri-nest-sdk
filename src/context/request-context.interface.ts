import type { UUID } from '@iveri/contracts';

/**
 * Everything a service method needs to know about *who* is asking, threaded explicitly
 * through the service DTO layer.
 *
 * It is built **once**, at the edge, from the authenticated principal, and passed down. It is
 * never reconstructed from headers deeper in the stack and `tenantId` never comes from a
 * request body or a client-supplied header — that is the whole multi-tenancy guarantee in one
 * sentence.
 *
 * @typeParam TPermission - the service's permission enum. Defaults to `string` until
 * `iveri-identity-api` defines the real one in `@iveri/contracts`.
 */
export interface RequestContext<TPermission extends string = string> {
    /** Tenant the principal is acting within. Scopes every query made on their behalf. */
    tenantId: UUID;

    /**
     * User making the request, or `null` for a machine principal authenticating with a
     * service API key. Code that attributes a change to a person must handle both.
     */
    userId: UUID | null;

    /** Permissions granted to the principal, already resolved from their roles. */
    permissions: readonly TPermission[];

    /** BCP-47 tag from `accept-language`, for localised output. */
    locale: string;

    /** Correlation id for this request. Mirrors the ambient `CorrelationIdService` value. */
    correlationId: string;
}
