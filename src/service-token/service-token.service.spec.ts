import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

import type { ServiceTokenModuleOptions } from './service-token-module-options.interface';
import { ServiceTokenService } from './service-token.service';

const OPTIONS: ServiceTokenModuleOptions = {
    identityApiUrl: 'http://identity.internal:3000',
    identityApiKey: 'ik_live_example',
    timeoutMs: 5_000,
    refreshSkewSeconds: 30,
};

const ok = (body: unknown) => of({ status: 200, data: body } as never);

const serviceWith = (request: jest.Mock, overrides: Partial<ServiceTokenModuleOptions> = {}): ServiceTokenService =>
    new ServiceTokenService({ ...OPTIONS, ...overrides }, { request } as unknown as HttpService);

describe('ServiceTokenService', () => {
    /**
     * The behaviour that is correctness rather than an optimisation, and the reason this is one
     * shared implementation rather than six.
     *
     * A processor waking several claims at once would otherwise mint a token per claim, which
     * multiplies the exchanges identity sees by the batch size — on the one endpoint that is
     * deliberately rate limited per account.
     */
    it('makes one exchange for callers that arrive together', async () => {
        const request = jest.fn().mockReturnValue(ok({ accessToken: 'jwt', expiresInSeconds: 900 }));
        const service = serviceWith(request);

        const tokens = await Promise.all(Array.from({ length: 8 }, () => service.getAccessToken()));

        expect(request).toHaveBeenCalledTimes(1);
        expect(tokens).toEqual(Array.from({ length: 8 }, () => 'jwt'));
    });

    it('reuses the cached token until the skew window', async () => {
        const request = jest.fn().mockReturnValue(ok({ accessToken: 'jwt', expiresInSeconds: 900 }));
        const service = serviceWith(request);

        await service.getAccessToken();
        await service.getAccessToken();

        expect(request).toHaveBeenCalledTimes(1);
    });

    /**
     * The skew is what stops a token that was valid when the decision was made from expiring in
     * flight — the far end's answer to that is a 401 on work that was fine.
     */
    it('replaces a token already inside the skew window', async () => {
        const request = jest.fn().mockReturnValue(ok({ accessToken: 'jwt', expiresInSeconds: 20 }));
        const service = serviceWith(request);

        await service.getAccessToken();
        await service.getAccessToken();

        expect(request).toHaveBeenCalledTimes(2);
    });

    it('exchanges again after the cache is invalidated', async () => {
        const request = jest.fn().mockReturnValue(ok({ accessToken: 'jwt', expiresInSeconds: 900 }));
        const service = serviceWith(request);

        await service.getAccessToken();
        service.invalidate();
        await service.getAccessToken();

        expect(request).toHaveBeenCalledTimes(2);
    });

    /**
     * A failure must not be cached, and `finally` on the in-flight promise is what guarantees it.
     * Without that, one unreachable identity would make every later call reuse the rejection —
     * the service would never recover without a restart.
     */
    it('retries after a failure rather than caching it', async () => {
        const request = jest
            .fn()
            .mockReturnValueOnce(throwError(() => new Error('ECONNREFUSED')))
            .mockReturnValue(ok({ accessToken: 'jwt', expiresInSeconds: 900 }));
        const service = serviceWith(request);

        await expect(service.getAccessToken()).rejects.toThrow('Could not reach iveri-identity-api');
        await expect(service.getAccessToken()).resolves.toBe('jwt');
    });

    it('reports a refusal with its status and nothing else', async () => {
        const request = jest.fn().mockReturnValue(of({ status: 403, data: { message: 'ik_live_example rejected' } }));

        // The response body can quote the credential back; the caller gets the status, which is
        // the whole diagnosis — 401 is a wrong or revoked key, 403 one missing a permission.
        await expect(serviceWith(request).getAccessToken()).rejects.toThrow(
            'iveri-identity-api refused the service credential',
        );
    });

    /**
     * A 2xx carrying the wrong shape would otherwise cache `undefined` as a bearer token and
     * fail every downstream call with a 401, which reads as a permission problem rather than as
     * a malformed reply.
     */
    it.each([
        ['nothing', null],
        ['no token', { expiresInSeconds: 900 }],
        ['an empty token', { accessToken: '', expiresInSeconds: 900 }],
        ['no expiry', { accessToken: 'jwt' }],
        ['an expiry of zero', { accessToken: 'jwt', expiresInSeconds: 0 }],
    ])('refuses a 2xx carrying %s', async (_label, body) => {
        await expect(serviceWith(jest.fn().mockReturnValue(ok(body))).getAccessToken()).rejects.toThrow(
            /Service token response/,
        );
    });

    describe('when no credential is configured', () => {
        /**
         * A supported state, not a misconfiguration: a service whose outbound work is behind a
         * feature flag boots without one. `isConfigured()` is how it refuses to arm a processor
         * that could only ever fail, rather than discovering the gap on the first attempt and
         * dead-lettering a row for it.
         */
        it('says so rather than making a request', async () => {
            const request = jest.fn();
            const service = serviceWith(request, { identityApiKey: undefined });

            expect(service.isConfigured()).toBe(false);
            await expect(service.getAccessToken()).rejects.toThrow('No identity credential is configured');
            expect(request).not.toHaveBeenCalled();
        });

        it('is configured when both halves are present', () => {
            expect(serviceWith(jest.fn()).isConfigured()).toBe(true);
        });
    });

    it('tolerates a trailing slash on the identity URL', async () => {
        const request = jest.fn().mockReturnValue(ok({ accessToken: 'jwt', expiresInSeconds: 900 }));

        await serviceWith(request, { identityApiUrl: 'http://identity.internal:3000//' }).getAccessToken();

        expect(request).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'http://identity.internal:3000/api/v1/auth/token' }),
        );
    });
});
