import type { ServiceToken } from '@iveri/contracts/identity';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ExternalServiceException } from '../exception';

import type { ServiceTokenModuleOptions } from './service-token-module-options.interface';
import { SERVICE_TOKEN_MODULE_OPTIONS } from './service-token.constant';

interface CachedToken {
    accessToken: string;
    expiresAt: number;
}

/**
 * Exchanges this deployment's tenant-scoped API key for a short-lived bearer token.
 *
 * **The whole reason this exists rather than each service presenting its API key directly** is
 * recorded in `conduit-api`'s guide: a service cannot check an API key without calling identity
 * on its own hot path, which is the cost the stateless-JWT design was made to avoid. The key is
 * exchanged once, the JWT is verified locally by everyone, and the exchange is cached here.
 *
 * Extracted at the **seventh** copy, which is well past the second-consumer rule and is recorded
 * as such. The six in `taxi-api`, `delivery-api`, `iveri-mobility-api`, `iveri-notification-api`,
 * `unibox-api` and `commerce-api` were measured by normalising identifiers and diffing: the logic
 * is the same in all of them, and what differed was brace style, error wording, whether a refusal
 * was logged before being thrown, and whether the skew was configurable.
 */
@Injectable()
export class ServiceTokenService {
    private readonly logger = new Logger(ServiceTokenService.name);

    private cached: CachedToken | null = null;

    /**
     * The in-flight exchange, shared by every concurrent caller.
     *
     * **Correctness rather than an optimisation.** A processor waking several claims at once
     * would otherwise mint a token per claim, which multiplies the exchanges identity sees by
     * the batch size — on the one endpoint that is deliberately rate limited per account.
     */
    private inFlight: Promise<string> | null = null;

    constructor(
        @Inject(SERVICE_TOKEN_MODULE_OPTIONS) private readonly options: ServiceTokenModuleOptions,
        private readonly httpService: HttpService,
    ) {}

    /**
     * Whether a credential is configured at all.
     *
     * For a service whose outbound work is behind a feature flag: checking here is how it
     * refuses to arm a processor that could only ever fail, rather than discovering the gap on
     * the first attempt and dead-lettering a row for it.
     */
    isConfigured(): boolean {
        return Boolean(this.options.identityApiUrl) && Boolean(this.options.identityApiKey);
    }

    async getAccessToken(): Promise<string> {
        const cached = this.cached;

        if (cached !== null && cached.expiresAt - this.options.refreshSkewSeconds * 1_000 > Date.now()) {
            return cached.accessToken;
        }

        this.inFlight ??= this.fetchToken().finally(() => {
            this.inFlight = null;
        });

        return this.inFlight;
    }

    /**
     * Discards the cached token.
     *
     * A caller that gets a 401 from a downstream service calls this and retries once: the token
     * may have been minted before a permission was granted, or identity may have been restarted
     * with a different signing key. Waiting out the skew instead would leave the caller failing
     * for up to its whole lifetime.
     */
    invalidate(): void {
        this.cached = null;
    }

    private async fetchToken(): Promise<string> {
        const { identityApiUrl, identityApiKey } = this.options;

        // Refused here rather than letting an empty URL become a request to a relative path.
        if (!identityApiUrl || !identityApiKey) {
            throw new ExternalServiceException('No identity credential is configured', {
                reason: 'Both an identity API URL and an API key are required to obtain a service token.',
            });
        }

        const baseUrl = identityApiUrl.replace(/\/+$/, '');
        let response: AxiosResponse<unknown>;

        try {
            response = await firstValueFrom(
                this.httpService.request<unknown>({
                    url: `${baseUrl}/api/v1/auth/token`,
                    method: 'POST',
                    headers: { 'x-api-key': identityApiKey, 'content-type': 'application/json' },
                    data: {},
                    timeout: this.options.timeoutMs,
                    // Every status is read below, so a non-2xx is a refusal to report rather than
                    // a thrown Axios error whose message would carry the request's own headers.
                    validateStatus: () => true,
                }),
            );
        } catch (error: unknown) {
            throw new ExternalServiceException('Could not reach iveri-identity-api for a service token', {
                reason: error instanceof Error ? error.message : 'unknown',
            });
        }

        if (response.status < 200 || response.status >= 300) {
            // Logged as well as thrown: the exception reaches a caller who can only retry, while
            // a refused credential is an operator's problem and this line is where they see it.
            // The status is the whole diagnosis — 401 is a wrong or revoked key, 403 a key
            // missing a permission — and it is deliberately the only thing recorded.
            this.logger.error({
                message: 'iveri-identity-api refused the service credential',
                status: response.status,
            });

            throw new ExternalServiceException('iveri-identity-api refused the service credential', {
                status: response.status,
            });
        }

        const token = ServiceTokenService.narrowToken(response.data);

        this.cached = {
            accessToken: token.accessToken,
            expiresAt: Date.now() + token.expiresInSeconds * 1_000,
        };

        return token.accessToken;
    }

    /**
     * Narrows the response rather than casting it.
     *
     * A 2xx carrying the wrong shape would otherwise cache `undefined` as a bearer token and
     * fail every downstream call with a 401, which reads as a permission problem rather than as
     * a malformed reply.
     */
    private static narrowToken(body: unknown): Pick<ServiceToken, 'accessToken' | 'expiresInSeconds'> {
        if (typeof body !== 'object' || body === null) {
            throw new ExternalServiceException('Service token response was invalid');
        }

        const { accessToken, expiresInSeconds } = body as Record<string, unknown>;

        if (
            typeof accessToken !== 'string' ||
            accessToken.length === 0 ||
            typeof expiresInSeconds !== 'number' ||
            expiresInSeconds <= 0
        ) {
            throw new ExternalServiceException('Service token response carried no usable token');
        }

        return { accessToken, expiresInSeconds };
    }
}
