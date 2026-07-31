import { type ApiErrorResponse, ErrorCode } from '@iveri/contracts';
import { type ArgumentsHost, BadRequestException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';

import { HeaderKey } from '../constant/header-key.constant';

import { GlobalExceptionFilter } from './global-exception.filter';
import { ResourceNotFoundException } from './resource-not-found.exception';
import { ValidationFailedException } from './validation-failed.exception';

const CORRELATION_ID = 'dddddddd-0000-4000-8000-000000000004';

interface Harness {
    host: ArgumentsHost;
    status: jest.Mock;
    json: jest.Mock;
    body: () => ApiErrorResponse;
}

const buildHarness = (path = '/tenant/list'): Harness => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
        switchToHttp: () => ({
            getRequest: () => ({
                path,
                method: 'GET',
                headers: { [HeaderKey.CORRELATION_ID]: CORRELATION_ID },
            }),
            getResponse: () => ({ status }),
        }),
    } as unknown as ArgumentsHost;

    return { host, status, json, body: () => json.mock.calls[0][0] as ApiErrorResponse };
};

describe('GlobalExceptionFilter', () => {
    beforeAll(() => {
        // The filter logs every exception by design; silence it so the suite output is readable.
        Logger.overrideLogger(false);
    });

    afterAll(() => {
        Logger.overrideLogger(true);
    });

    describe('DomainException', () => {
        it('renders the exception code, status and details', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch(new ResourceNotFoundException('Tenant not found', { id: 'unknown' }), harness.host);

            expect(harness.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
            expect(harness.body()).toEqual({
                success: false,
                error: {
                    code: ErrorCode.RESOURCE_NOT_FOUND,
                    message: 'Tenant not found',
                    details: { id: 'unknown' },
                    correlationId: CORRELATION_ID,
                },
                timestamp: expect.any(String) as string,
                path: '/tenant/list',
            });
        });

        it('echoes the correlation id so the caller can quote it', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch(new ValidationFailedException('nope'), harness.host);

            expect(harness.body().error.correlationId).toBe(CORRELATION_ID);
        });
    });

    describe('framework exceptions', () => {
        it('lifts ValidationPipe field messages into details', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch(
                new BadRequestException(['contactId must be a UUID', 'message must be shorter']),
                harness.host,
            );

            expect(harness.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
            expect(harness.body().error).toMatchObject({
                code: ErrorCode.VALIDATION_FAILED,
                details: { violations: ['contactId must be a UUID', 'message must be shorter'] },
            });
        });

        it('maps a plain HttpException status onto an error code', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch(new NotFoundException('Route not found'), harness.host);

            expect(harness.body().error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
            expect(harness.body().error.message).toBe('Route not found');
        });
    });

    describe('Postgres driver errors', () => {
        it('maps a unique violation to a 409 rather than a 500', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch({ driverError: { code: '23505', constraint: 'uq_tenant_slug' } }, harness.host);

            expect(harness.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
            expect(harness.body().error).toMatchObject({
                code: ErrorCode.RESOURCE_ALREADY_EXISTS,
                details: { constraint: 'uq_tenant_slug' },
            });
        });

        it('maps a foreign key violation to a 409', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch({ code: '23503', constraint: 'fk_membership_tenant' }, harness.host);

            expect(harness.body().error.code).toBe(ErrorCode.RESOURCE_CONFLICT);
        });

        it('leaves an unrecognised SQLSTATE as a 500 instead of guessing', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch({ code: '42P01' }, harness.host);

            expect(harness.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(harness.body().error.code).toBe(ErrorCode.INTERNAL_ERROR);
        });
    });

    describe('unexpected failures', () => {
        it('replaces the real message with a generic one by default', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch(new Error('connect ECONNREFUSED 10.0.3.14:5432 for user iveri_app'), harness.host);

            expect(harness.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(harness.body().error.message).toBe('An unexpected error occurred');
            expect(harness.body().error.details).toBeUndefined();
        });

        it('exposes the message and stack only when explicitly opted in', () => {
            const filter = new GlobalExceptionFilter({ exposeInternalErrors: true });
            const harness = buildHarness();

            filter.catch(new Error('connect ECONNREFUSED'), harness.host);

            expect(harness.body().error.message).toBe('connect ECONNREFUSED');
            expect(harness.body().error.details).toHaveProperty('stack');
        });

        it('handles a thrown non-Error without crashing the filter', () => {
            const filter = new GlobalExceptionFilter();
            const harness = buildHarness();

            filter.catch('something threw a string', harness.host);

            expect(harness.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(harness.body().error.message).toBe('An unexpected error occurred');
        });
    });
});
