import { type ApiErrorResponse, ErrorCode } from '@iveri/contracts';
import { type ArgumentsHost, BadRequestException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';

import { HeaderKey } from '../constant/header-key.constant';
import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator';
import type { ErrorReportContext, ErrorReporter } from '../observability/error/error-reporter.interface';

import { GlobalExceptionFilter } from './global-exception.filter';
import { ResourceNotFoundException } from './resource-not-found.exception';
import { ServiceUnavailableException } from './service-unavailable.exception';
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

    describe('error reporting', () => {
        interface Captured {
            exception: unknown;
            context?: ErrorReportContext;
        }

        const stubReporter = (isEnabled = true): ErrorReporter & { captured: Captured[] } => {
            const captured: Captured[] = [];

            return {
                captured,
                isEnabled: () => isEnabled,
                capture: (exception: unknown, context?: ErrorReportContext): void => {
                    captured.push({ exception, context });
                },
            };
        };

        /** A harness whose request also carries a matched route and a resolved tenant. */
        const buildRequestHarness = (
            path = '/api/v1/captures/6f1c1a5e-0b6a-4c6e-9d1f-4a2b7c8d9e01',
            route: string | undefined = '/api/v1/captures/:captureId',
        ): Harness => {
            const json = jest.fn();
            const status = jest.fn().mockReturnValue({ json });
            const host = {
                switchToHttp: () => ({
                    getRequest: () => ({
                        path,
                        method: 'GET',
                        baseUrl: '',
                        ...(route ? { route: { path: route } } : {}),
                        headers: { [HeaderKey.CORRELATION_ID]: CORRELATION_ID },
                        [REQUEST_CONTEXT_PROPERTY]: { tenantId: 'aaaaaaaa-0000-4000-8000-000000000001' },
                    }),
                    getResponse: () => ({ status }),
                }),
            } as unknown as ArgumentsHost;

            return { host, status, json, body: () => json.mock.calls[0][0] as ApiErrorResponse };
        };

        it('reports an unexpected failure', () => {
            const reporter = stubReporter();
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new Error('boom'), buildRequestHarness().host);

            expect(reporter.captured).toHaveLength(1);
            expect(reporter.captured[0].exception).toBeInstanceOf(Error);
        });

        it('reports a 5xx domain exception', () => {
            const reporter = stubReporter();
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new ServiceUnavailableException('Upstream is down'), buildRequestHarness().host);

            expect(reporter.captured).toHaveLength(1);
        });

        it('does not report a 4xx', () => {
            const reporter = stubReporter();
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new ValidationFailedException('Bad input'), buildRequestHarness().host);
            filter.catch(new ResourceNotFoundException('Missing'), buildRequestHarness().host);

            // A 4xx is the caller getting it wrong and the system saying so correctly. Capturing
            // every typed domain exception buries the one real bug under a week of these.
            expect(reporter.captured).toHaveLength(0);
        });

        it('does not report a failing health probe', () => {
            const reporter = stubReporter();
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new ServiceUnavailableException('database down'), buildRequestHarness('/health/ready').host);

            // A readiness probe answers 503 for as long as the dependency is down. Reporting
            // each one turns a single outage into thousands of identical events.
            expect(reporter.captured).toHaveLength(0);
        });

        it('reports the route pattern and never the resolved URL', () => {
            const reporter = stubReporter();
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new Error('boom'), buildRequestHarness().host);

            // conduit-api's ingress URL contains the endpoint's credential, and this value
            // leaves the machine.
            expect(reporter.captured[0].context?.route).toBe('/api/v1/captures/:captureId');
        });

        it('reports the correlation id and tenant', () => {
            const reporter = stubReporter();
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new Error('boom'), buildRequestHarness().host);

            expect(reporter.captured[0].context).toMatchObject({
                correlationId: CORRELATION_ID,
                tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
                method: 'GET',
            });
        });

        it('reports without a tenant when the request failed before the guard resolved one', () => {
            const reporter = stubReporter();
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new Error('boom'), buildHarness().host);

            expect(reporter.captured).toHaveLength(1);
            expect(reporter.captured[0].context?.tenantId).toBeUndefined();
        });

        it('does nothing when the reporter is disabled', () => {
            const reporter = stubReporter(false);
            const filter = new GlobalExceptionFilter({ reporter });

            filter.catch(new Error('boom'), buildRequestHarness().host);

            expect(reporter.captured).toHaveLength(0);
        });

        it('still renders the response when no reporter is configured', () => {
            // Every service registered this filter before the reporter existed; a missing one
            // must change nothing at all.
            const filter = new GlobalExceptionFilter();
            const harness = buildRequestHarness();

            filter.catch(new Error('boom'), harness.host);

            expect(harness.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        });
    });
});
