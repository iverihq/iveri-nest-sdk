import { PrincipalType } from '@iveri/contracts/identity';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { HeaderKey } from '../constant/header-key.constant';
import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator';
import { UnauthenticatedException } from '../exception/unauthenticated.exception';

import { AccessTokenService } from './access-token.service';
import type { AuthenticatedRequestContext } from './authenticated-request-context.interface';
import { IS_PUBLIC_KEY } from './public.decorator';

/** RFC 7235 makes the scheme case-insensitive, and clients genuinely send `bearer`. */
const BEARER_SCHEME = 'bearer';

interface RequestWithContext extends Request {
    [REQUEST_CONTEXT_PROPERTY]?: AuthenticatedRequestContext;
}

/**
 * Authenticates every request and populates the {@link AuthenticatedRequestContext}.
 *
 * Registered globally by the consuming service, so **authentication is the default** and
 * `@Public()` is the explicit exception. The inverse — remembering to add a guard — fails open on
 * the one route nobody re-reviewed.
 *
 * One credential type: `Authorization: Bearer <jwt>`, minted by `iveri-identity-api` and verified
 * here with the shared secret. **Identity's own guard has a second, API-key branch and this
 * deliberately does not**, because an identity API key is a row in identity's database and
 * checking it would put a cross-service call on the hot path — the exact cost the stateless-JWT
 * design was chosen to avoid. A service holding a key trades it for a token at identity's
 * `POST /auth/token` and presents that here, so this single branch covers people and machines
 * alike and still reads no state.
 *
 * The tenant always comes from the verified token, never from a header or a body (§9).
 *
 * **A route with no principal must be `@Public()` and authenticate some other way.** Conduit's
 * ingress is the standing example: a provider cannot log in, so it proves itself with an HMAC
 * signature — a different mechanism answering a different question, *did this really come from
 * Stripe* rather than *who is this user*.
 */
@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly accessTokenService: AccessTokenService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (this.isPublic(context)) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RequestWithContext>();
        const token = AuthGuard.readBearerToken(request);

        if (!token) {
            throw new UnauthenticatedException('No credentials presented');
        }

        const payload = await this.accessTokenService.verify(token);
        const isService = payload.pt === PrincipalType.SERVICE;

        request[REQUEST_CONTEXT_PROPERTY] = {
            tenantId: payload.tid,
            // `sub` is the *principal*, not the user. For a token minted from an API key it is an
            // `api_key.id`, and assigning it to `userId` would write it into audit columns naming
            // a person who does not exist.
            userId: isService ? null : payload.sub,
            apiKeyId: isService ? payload.sub : null,
            permissions: payload.perms,
            locale: AuthGuard.readLocale(request),
            correlationId: AuthGuard.readHeader(request, HeaderKey.CORRELATION_ID) ?? '',
        };

        return true;
    }

    private isPublic(context: ExecutionContext): boolean {
        // The generic is widened with `| undefined` deliberately: `getAllAndOverride` is typed as
        // returning `T`, but it returns `undefined` for a route carrying no metadata at all —
        // which is most of them.
        return (
            this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) ?? false
        );
    }

    private static readBearerToken(request: Request): string | undefined {
        const header = AuthGuard.readHeader(request, HeaderKey.AUTHORIZATION);

        if (!header) {
            return undefined;
        }

        const [scheme, ...rest] = header.split(' ');
        const token = rest.join(' ').trim();

        if (scheme.toLowerCase() !== BEARER_SCHEME || token.length === 0) {
            return undefined;
        }

        return token;
    }

    private static readLocale(request: Request): string {
        const header = AuthGuard.readHeader(request, HeaderKey.ACCEPT_LANGUAGE);

        if (!header) {
            return 'en';
        }

        // First tag only, quality values dropped. Full RFC 4647 negotiation is not worth its
        // weight until something actually localises output.
        const [primary] = header.split(',');

        return primary.split(';')[0].trim() || 'en';
    }

    private static readHeader(request: Request, key: string): string | undefined {
        const value = request.headers[key];

        return Array.isArray(value) ? value[0] : value;
    }
}
