import type { UserPermission, UUID } from '@iveri/contracts';
import { type AccessTokenPayload, PrincipalType } from '@iveri/contracts/identity';
import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';

import { TokenExpiredException } from '../exception/token-expired.exception';
import { UnauthenticatedException } from '../exception/unauthenticated.exception';

/**
 * Verifies access tokens issued by `iveri-identity-api`.
 *
 * **Verification only — nothing here mints a token.** There is no signing method on purpose: the
 * moment a consuming service can issue one it becomes a second identity provider, and the shared
 * secret stops being a verification key and starts being a minting key in every repo that holds
 * it.
 *
 * No database round trip and no call to identity. Permissions arrive inside the token, which is
 * exactly what identity's stateless-JWT decision bought — see its `CLAUDE.md`. The price is a
 * revocation window bounded by identity's `JWT_ACCESS_TOKEN_TTL`, and a service must not "fix"
 * that by adding a lookup here, because doing so puts identity on every other service's hot path.
 */
@Injectable()
export class AccessTokenService {
    constructor(private readonly jwtService: JwtService) {}

    /**
     * Verifies signature, expiry, issuer and audience.
     *
     * Expiry is separated from every other failure: a client seeing `TOKEN_EXPIRED` knows to
     * refresh and retry, whereas a bad signature means stop. Collapsing both into one 401 makes a
     * normal refresh cycle indistinguishable from an attack in the logs.
     *
     * @throws {@link TokenExpiredException} when the token has expired.
     * @throws {@link UnauthenticatedException} for every other verification failure.
     */
    async verify(token: string): Promise<AccessTokenPayload> {
        let claims: Record<string, unknown>;

        try {
            // Typed as a bare record on purpose. A verified signature proves the token came from
            // identity; it proves nothing about the *shape* of what identity put inside. Asking
            // `verifyAsync<AccessTokenPayload>` for the payload would assert that shape without
            // checking it, and the first thing to go wrong downstream would be an untenanted
            // query rather than a 401.
            claims = await this.jwtService.verifyAsync<Record<string, unknown>>(token);
        } catch (error: unknown) {
            if (error instanceof TokenExpiredError) {
                throw new TokenExpiredException('Access token has expired');
            }

            // The underlying message ("invalid signature", "jwt malformed") is not returned: it
            // tells a probing client which part of its forgery to fix.
            throw new UnauthenticatedException('Access token is not valid');
        }

        return AccessTokenService.narrowClaims(claims);
    }

    /**
     * Turns verified-but-unchecked claims into an {@link AccessTokenPayload}.
     *
     * A token missing `tid` would otherwise authenticate a request into an untenanted context,
     * where every scoped query runs against `undefined` — the single worst outcome this codebase
     * can produce. Identity always sets these claims; this is what keeps a future change over
     * there from becoming a data leak over here.
     *
     * A missing or malformed `perms` becomes an empty array rather than an error: no permissions
     * is the safe reading, and it degrades to "403 on everything gated" instead of locking out a
     * tenant whose token is merely unusual.
     *
     * **`pt` gets the strict treatment instead, because it has no safe reading.** It says whether
     * `sub` is a user id or an API key id, and neither guess degrades to less privilege — the
     * permissions are identical either way. Guessing "user" writes an API key id into an audit
     * column naming a person who does not exist; guessing "service" silently drops a real
     * operator's name off one. With no safe default available, refusing beats picking. It also
     * means identity must ship the claim before a verifier requires it, which is the sort of
     * ordering worth knowing before a deploy order is chosen.
     */
    private static narrowClaims(claims: Record<string, unknown>): AccessTokenPayload {
        const { sub, tid, perms, pt } = claims;

        if (typeof sub !== 'string' || sub.length === 0 || typeof tid !== 'string' || tid.length === 0) {
            throw new UnauthenticatedException('Access token is missing its subject or tenant claim');
        }

        if (pt !== PrincipalType.USER && pt !== PrincipalType.SERVICE) {
            throw new UnauthenticatedException('Access token does not say what kind of principal it names');
        }

        return {
            sub: sub as UUID,
            pt,
            tid: tid as UUID,
            perms: Array.isArray(perms) ? (perms.filter((entry) => typeof entry === 'string') as UserPermission[]) : [],
            iat: typeof claims.iat === 'number' ? claims.iat : undefined,
            exp: typeof claims.exp === 'number' ? claims.exp : undefined,
            iss: typeof claims.iss === 'string' ? claims.iss : undefined,
            aud: typeof claims.aud === 'string' ? claims.aud : undefined,
        };
    }
}
