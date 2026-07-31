import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { HeaderKey } from '../constant/header-key.constant';

import { CorrelationIdService } from './correlation-id.service';

/**
 * Opens a correlation context for every inbound HTTP request.
 *
 * Echoes an incoming `x-correlation-id` when there is one, so a request arriving from another
 * Iveri service keeps the id it started with, and mints a fresh UUID at a true entry point.
 * The id is written back onto the response so a caller — or a customer reading a browser
 * network tab — can quote it in a support ticket.
 *
 * Register it for all routes in `AppModule`:
 *
 * ```ts
 * export class AppModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer): void {
 *         consumer.apply(CorrelationIdMiddleware).forRoutes('*');
 *     }
 * }
 * ```
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
    constructor(private readonly correlationIdService: CorrelationIdService) {}

    use(request: Request, response: Response, next: NextFunction): void {
        const incoming = request.headers[HeaderKey.CORRELATION_ID];
        const correlationId = this.normalize(incoming) ?? randomUUID();

        request.headers[HeaderKey.CORRELATION_ID] = correlationId;
        response.setHeader(HeaderKey.CORRELATION_ID, correlationId);

        this.correlationIdService.runWith({ correlationId }, () => {
            next();
        });
    }

    /**
     * A repeated header arrives as an array. Take the first value and reject anything empty
     * or implausibly long — the id ends up in log lines and outbound headers, so an unbounded
     * client-supplied string is a log-injection and header-size problem.
     */
    private normalize(value: string | string[] | undefined): string | undefined {
        const candidate = Array.isArray(value) ? value[0] : value;
        if (!candidate) {
            return undefined;
        }

        const trimmed = candidate.trim();

        return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : undefined;
    }
}
