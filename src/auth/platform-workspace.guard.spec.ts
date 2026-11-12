import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator.js';
import { ForbiddenActionException } from '../exception/forbidden-action.exception.js';

import { PlatformWorkspaceGuard } from './platform-workspace.guard.js';

const OPERATORS = 'cccccccc-0000-4000-8000-000000000001';
const COMPANY = 'cccccccc-0000-4000-8000-000000000002';

const context = (tenantId?: string): ExecutionContext =>
    ({
        switchToHttp: () => ({
            getRequest: () => ({
                [REQUEST_CONTEXT_PROPERTY]: tenantId === undefined ? undefined : { tenantId, permissions: [] },
            }),
        }),
    }) as unknown as ExecutionContext;

const guard = (platformTenantId?: string): PlatformWorkspaceGuard =>
    new PlatformWorkspaceGuard({ get: () => platformTenantId } as unknown as ConfigService<
        Record<string, unknown>,
        true
    >);

describe('PlatformWorkspaceGuard', () => {
    it('admits a token from the operator workspace', () => {
        expect(guard(OPERATORS).canActivate(context(OPERATORS))).toBe(true);
    });

    it("refuses a company's token, whatever it carries", () => {
        expect(() => guard(OPERATORS).canActivate(context(COMPANY))).toThrow(ForbiddenActionException);
    });

    it('refuses everybody when no operator workspace is named', () => {
        expect(() => guard(undefined).canActivate(context(OPERATORS))).toThrow(ForbiddenActionException);
        expect(() => guard('').canActivate(context(OPERATORS))).toThrow(ForbiddenActionException);
    });

    it('refuses a request no token reached', () => {
        expect(() => guard(OPERATORS).canActivate(context())).toThrow(ForbiddenActionException);
    });
});
