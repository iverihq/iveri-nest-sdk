import type { Nullable, UserPermission, UUID } from '@iveri/contracts';

import type { RequestContext } from '../context/request-context.interface';

/**
 * A {@link RequestContext} built from a verified `iveri-identity-api` access token, narrowed to
 * the platform permission catalogue.
 *
 * The shape every service that *verifies* tokens ends up with, as opposed to identity, which
 * issues them and knows about credentials this cannot describe.
 *
 * `userId` and `apiKeyId` are the two halves of one question, and exactly one of them is set.
 * Since identity gained `POST /auth/token`, a vertical reaches another service with a token
 * minted from an API key, and for one of those there is no person — so code that attributes a
 * change to a user has to handle `null`, and code that only ever reads `userId` will silently
 * write nothing into an audit column.
 */
export interface AuthenticatedRequestContext extends RequestContext<UserPermission> {
    /**
     * The identity API key behind this request, or `null` for a human session.
     *
     * Recorded for two reasons that are easy to mistake for one. Two services sharing a tenant
     * must not share a rate-limit bucket — otherwise a busy one starves a quiet one — and an
     * operation recorded against nobody is not recorded.
     */
    apiKeyId: Nullable<UUID>;
}
