import { type ApiErrorResponse, ErrorCode, type Maybe } from '@iveri/contracts';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { HeaderKey } from '../constant/header-key.constant';
import { isInfrastructureRoute } from '../constant/infrastructure-route.constant';
import { REQUEST_CONTEXT_PROPERTY } from '../context/current-request-context.decorator';
import type { RequestContext } from '../context/request-context.interface';
import type { ErrorReporter } from '../observability/error/error-reporter.interface';
import { readRoutePattern } from '../observability/route-pattern.util';

import { DomainException } from './domain.exception';

/** Message returned in place of an unexpected error's own, which is logged but never sent. */
const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred';

/**
 * PostgreSQL SQLSTATE codes worth translating. Everything else falls through to a 500 —
 * a constraint we did not anticipate is a bug, and dressing it up as a 4xx hides it.
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const POSTGRES_ERROR_MAP: Record<string, { code: ErrorCode; status: HttpStatus; message: string }> = {
    '23505': {
        code: ErrorCode.RESOURCE_ALREADY_EXISTS,
        status: HttpStatus.CONFLICT,
        message: 'A resource with these values already exists',
    },
    '23503': {
        code: ErrorCode.RESOURCE_CONFLICT,
        status: HttpStatus.CONFLICT,
        message: 'A referenced resource does not exist or is still in use',
    },
    '23514': {
        code: ErrorCode.UNPROCESSABLE_ENTITY,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'A value violates a database constraint',
    },
};

/**
 * Status → code for a framework `HttpException` that carries no code of its own.
 *
 * Keyed by `number`, not `HttpStatus`: `HttpException.getStatus()` returns a plain number, and
 * a handler is free to throw a status this enum does not name.
 */
const STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
    [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
    [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
    [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
    [HttpStatus.NOT_FOUND]: ErrorCode.RESOURCE_NOT_FOUND,
    [HttpStatus.CONFLICT]: ErrorCode.RESOURCE_CONFLICT,
    [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
    [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE_ENTITY,
    [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
    [HttpStatus.BAD_GATEWAY]: ErrorCode.EXTERNAL_SERVICE_ERROR,
    [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
    [HttpStatus.GATEWAY_TIMEOUT]: ErrorCode.DEPENDENCY_TIMEOUT,
};

export interface GlobalExceptionFilterOptions {
    /**
     * Return an unexpected error's real message and stack to the client.
     *
     * **Local development only.** Internal messages carry table names, query fragments and
     * upstream URLs. Drive it from `NODE_ENV`, never hardcode `true`.
     */
    exposeInternalErrors?: boolean;

    /**
     * Where 5xx failures are reported — `ErrorReporterService` in a service that has one.
     *
     * Optional, and absent is a supported state: a service with no error tracker configured
     * behaves exactly as it did before, logging and nothing else.
     */
    reporter?: ErrorReporter;
}

/** The normalized form every branch below produces before it is rendered. */
interface NormalizedError {
    code: ErrorCode;
    status: HttpStatus;
    message: string;
    details: Maybe<Record<string, unknown>>;
}

/**
 * The single place that turns a thrown value into an HTTP response.
 *
 * Business code throws typed {@link DomainException}s and never touches a status code; this
 * filter renders the {@link ApiErrorResponse} envelope, logs with the correlation id, and
 * makes sure an unexpected failure leaks nothing.
 *
 * Register it globally in `AppModule` so it participates in DI:
 *
 * ```ts
 * providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }]
 * ```
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);
    private readonly exposeInternalErrors: boolean;
    private readonly reporter: Maybe<ErrorReporter>;

    constructor(options: GlobalExceptionFilterOptions = {}) {
        this.exposeInternalErrors = options.exposeInternalErrors ?? false;
        this.reporter = options.reporter;
    }

    catch(exception: unknown, host: ArgumentsHost): void {
        const http = host.switchToHttp();
        const request = http.getRequest<Request>();
        const response = http.getResponse<Response>();

        const normalized = this.normalize(exception);
        const correlationId = this.readCorrelationId(request);

        this.log(exception, normalized, request, correlationId);
        this.report(exception, normalized, request, correlationId);

        const body: ApiErrorResponse = {
            success: false,
            error: {
                code: normalized.code,
                message: normalized.message,
                details: normalized.details,
                correlationId,
            },
            timestamp: new Date().toISOString(),
            path: request.path,
        };

        response.status(normalized.status).json(body);
    }

    private normalize(exception: unknown): NormalizedError {
        if (exception instanceof DomainException) {
            return {
                code: exception.code,
                status: exception.status,
                message: exception.message,
                details: exception.details,
            };
        }

        if (exception instanceof HttpException) {
            return this.fromHttpException(exception);
        }

        const postgres = this.fromPostgresError(exception);
        if (postgres) {
            return postgres;
        }

        return {
            code: ErrorCode.INTERNAL_ERROR,
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message:
                this.exposeInternalErrors && exception instanceof Error ? exception.message : GENERIC_INTERNAL_MESSAGE,
            details: this.exposeInternalErrors && exception instanceof Error ? { stack: exception.stack } : undefined,
        };
    }

    /**
     * Framework exceptions, including the one the global `ValidationPipe` throws. That one
     * carries the per-field constraint messages, which are the most useful thing we can hand
     * a client, so they are lifted into `details` rather than flattened into one string.
     */
    private fromHttpException(exception: HttpException): NormalizedError {
        const status = exception.getStatus();
        const payload: unknown = exception.getResponse();

        const violations = this.readValidationViolations(payload);
        if (violations) {
            return {
                code: ErrorCode.VALIDATION_FAILED,
                status: HttpStatus.BAD_REQUEST,
                message: 'Request validation failed',
                details: { violations },
            };
        }

        const message =
            typeof payload === 'string' ? payload : (this.readStringProperty(payload, 'message') ?? exception.message);

        return {
            code: STATUS_TO_ERROR_CODE[status] ?? ErrorCode.INTERNAL_ERROR,
            status,
            message,
            details: undefined,
        };
    }

    /**
     * Duck-typed rather than importing from `typeorm` or `pg`: the driver's error shape is
     * stable, and a type-level dependency on it would drag the whole ORM into the SDK's
     * public surface for the sake of two constraint codes.
     */
    private fromPostgresError(exception: unknown): Maybe<NormalizedError> {
        if (typeof exception !== 'object' || exception === null) {
            return undefined;
        }

        const driverError = 'driverError' in exception ? exception.driverError : exception;
        const sqlState = this.readStringProperty(driverError, 'code');
        const mapped = sqlState ? POSTGRES_ERROR_MAP[sqlState] : undefined;

        if (!mapped) {
            return undefined;
        }

        return {
            code: mapped.code,
            status: mapped.status,
            message: mapped.message,
            // The driver's `detail` names columns and echoes the conflicting values —
            // useful in a log, not something to hand back over the wire.
            details: sqlState ? { constraint: this.readStringProperty(driverError, 'constraint') } : undefined,
        };
    }

    private readValidationViolations(payload: unknown): Maybe<string[]> {
        if (typeof payload !== 'object' || payload === null || !('message' in payload)) {
            return undefined;
        }

        const { message } = payload;

        return Array.isArray(message) && message.every((entry) => typeof entry === 'string') ? message : undefined;
    }

    private readStringProperty(source: unknown, property: string): Maybe<string> {
        if (typeof source !== 'object' || source === null || !(property in source)) {
            return undefined;
        }

        const value: unknown = (source as Record<string, unknown>)[property];

        return typeof value === 'string' ? value : undefined;
    }

    /**
     * Sends the failures worth a human's attention to the error tracker.
     *
     * **5xx only.** A 4xx is the caller getting it wrong and the system saying so correctly —
     * capturing all sixteen typed domain exceptions would bury the one real bug under a week of
     * validation failures on the first day, which is how a team learns to ignore the tracker.
     *
     * Infrastructure routes are excluded for a related reason: a readiness probe answers 503
     * for as long as a dependency is down, so reporting each one turns a single outage into
     * thousands of events that say nothing the first already said.
     */
    private report(exception: unknown, normalized: NormalizedError, request: Request, correlationId: string): void {
        if (
            !this.reporter?.isEnabled() ||
            normalized.status < HttpStatus.INTERNAL_SERVER_ERROR ||
            isInfrastructureRoute(request.path)
        ) {
            return;
        }

        this.reporter.capture(exception, {
            correlationId,
            tenantId: this.readTenantId(request),
            method: request.method,
            // The pattern, never the URL — `conduit-api`'s ingress path carries the endpoint's
            // credential, and this value leaves the machine.
            route: readRoutePattern(request),
            extra: { code: normalized.code, status: normalized.status },
        });
    }

    /**
     * Tenant the request was acting in, when the auth layer resolved one.
     *
     * Read defensively: this runs on the failure path, which includes requests that threw
     * before the guard that populates the context ever ran.
     */
    private readTenantId(request: Request): Maybe<string> {
        const requestContext: unknown = Reflect.get(request, REQUEST_CONTEXT_PROPERTY);

        return this.readStringProperty(requestContext, 'tenantId' satisfies keyof RequestContext);
    }

    private readCorrelationId(request: Request): string {
        const value = request.headers[HeaderKey.CORRELATION_ID];

        return (Array.isArray(value) ? value[0] : value) ?? '';
    }

    /**
     * 5xx is our fault and gets the stack; 4xx is the caller's and would drown the logs.
     * Both carry the correlation id, which is the only way to reassemble a request later.
     */
    private log(exception: unknown, normalized: NormalizedError, request: Request, correlationId: string): void {
        const context = {
            correlationId,
            code: normalized.code,
            status: normalized.status,
            method: request.method,
            path: request.path,
        };

        if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
            this.logger.error(
                { ...context, message: normalized.message },
                exception instanceof Error ? exception.stack : String(exception),
            );

            return;
        }

        this.logger.warn({ ...context, message: normalized.message });
    }
}
