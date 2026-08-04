import { UserPermission, type UUID } from '@iveri/contracts';
import { type AccessTokenPayload, PrincipalType } from '@iveri/contracts/identity';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { HeaderKey } from '../constant/header-key.constant';
import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator';
import { UnauthenticatedException } from '../exception/unauthenticated.exception';

import type { AccessTokenService } from './access-token.service';
import { AuthGuard } from './auth.guard';
import type { AuthenticatedRequestContext } from './authenticated-request-context.interface';
import { IS_PUBLIC_KEY } from './public.decorator';

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001' as UUID;
const API_KEY_ID = 'bbbbbbbb-0000-4000-8000-000000000002' as UUID;
const TENANT_ID = 'cccccccc-0000-4000-8000-000000000003' as UUID;

interface RequestStub {
    headers: Record<string, string | string[] | undefined>;
    [REQUEST_CONTEXT_PROPERTY]?: AuthenticatedRequestContext;
}

const buildPayload = (overrides: Partial<AccessTokenPayload> = {}): AccessTokenPayload => ({
    sub: USER_ID,
    pt: PrincipalType.USER,
    tid: TENANT_ID,
    perms: [UserPermission.UNIBOX_CONVERSATION_READ],
    ...overrides,
});

const buildHarness = (options: { headers?: Record<string, string>; isPublic?: boolean } = {}) => {
    const request: RequestStub = { headers: options.headers ?? {} };
    const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => undefined,
        getClass: () => undefined,
    } as unknown as ExecutionContext;

    const reflector = {
        getAllAndOverride: (key: string) => (key === IS_PUBLIC_KEY ? options.isPublic : undefined),
    } as unknown as Reflector;

    const verify = jest.fn<Promise<AccessTokenPayload>, [string]>().mockResolvedValue(buildPayload());
    const accessTokenService = { verify } as unknown as AccessTokenService;

    return { guard: new AuthGuard(reflector, accessTokenService), context, request, verify };
};

describe('AuthGuard', () => {
    it('lets a @Public() route through without looking for a token', async () => {
        const { guard, context, verify } = buildHarness({ isPublic: true });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(verify).not.toHaveBeenCalled();
    });

    it('refuses a request with no Authorization header', async () => {
        const { guard, context } = buildHarness();

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthenticatedException);
    });

    it.each([
        ['Bearer token', 'Bearer abc.def.ghi'],
        // RFC 7235 makes the scheme case-insensitive, and clients genuinely send it lowercase.
        ['lowercase bearer', 'bearer abc.def.ghi'],
    ])('accepts a %s', async (_name, header) => {
        const { guard, context, verify } = buildHarness({ headers: { [HeaderKey.AUTHORIZATION]: header } });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(verify).toHaveBeenCalledWith('abc.def.ghi');
    });

    it.each([
        ['a scheme it does not understand', 'Basic abc'],
        ['a bearer scheme with no token', 'Bearer   '],
    ])('refuses %s', async (_name, header) => {
        const { guard, context } = buildHarness({ headers: { [HeaderKey.AUTHORIZATION]: header } });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthenticatedException);
    });

    it('takes the tenant from the token, never from a header', async () => {
        // §9: a client-supplied tenant is the whole multi-tenancy guarantee failing at once.
        const { guard, context, request } = buildHarness({
            headers: { [HeaderKey.AUTHORIZATION]: 'Bearer t', 'x-tenant-id': 'ffffffff-0000-4000-8000-00000000000f' },
        });

        await guard.canActivate(context);

        expect(request[REQUEST_CONTEXT_PROPERTY]?.tenantId).toBe(TENANT_ID);
    });

    it('assigns a user token’s subject to userId and leaves apiKeyId null', async () => {
        const { guard, context, request, verify } = buildHarness({
            headers: { [HeaderKey.AUTHORIZATION]: 'Bearer t' },
        });

        verify.mockResolvedValue(buildPayload({ sub: USER_ID, pt: PrincipalType.USER }));
        await guard.canActivate(context);

        expect(request[REQUEST_CONTEXT_PROPERTY]).toMatchObject({ userId: USER_ID, apiKeyId: null });
    });

    it('assigns a service token’s subject to apiKeyId and leaves userId null', async () => {
        // The bug this pins: `sub` on a service token is an `api_key.id`, and writing it to
        // `userId` puts it in audit columns naming a person who does not exist.
        const { guard, context, request, verify } = buildHarness({
            headers: { [HeaderKey.AUTHORIZATION]: 'Bearer t' },
        });

        verify.mockResolvedValue(buildPayload({ sub: API_KEY_ID, pt: PrincipalType.SERVICE }));
        await guard.canActivate(context);

        expect(request[REQUEST_CONTEXT_PROPERTY]).toMatchObject({ userId: null, apiKeyId: API_KEY_ID });
    });

    it.each([
        ['no accept-language', undefined, 'en'],
        ['a single tag', 'ka', 'ka'],
        ['a weighted list', 'ka-GE,ka;q=0.9,en;q=0.8', 'ka-GE'],
    ])('resolves the locale from %s', async (_name, header, expected) => {
        const { guard, context, request } = buildHarness({
            headers: {
                [HeaderKey.AUTHORIZATION]: 'Bearer t',
                ...(header === undefined ? {} : { [HeaderKey.ACCEPT_LANGUAGE]: header }),
            },
        });

        await guard.canActivate(context);

        expect(request[REQUEST_CONTEXT_PROPERTY]?.locale).toBe(expected);
    });
});
