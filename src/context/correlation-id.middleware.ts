import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { HeaderKey } from '../constant/header-key.constant.js';

import { assignCorrelationId } from './assign-correlation-id.util.js';
import { CorrelationIdService } from './correlation-id.service.js';

/**
 * Opens a correlation context for every inbound HTTP request.
 *
 * Echoes an incoming `x-correlation-id` when there is one, so a request arriving from another
 * Iveri service keeps the id it started with, and mints a fresh UUID at a true entry point.
 * The id is written back onto the response so a caller — or a customer reading a browser
 * network tab — can quote it in a support ticket.
 *
 * The logger runs before any middleware, so a service passes `assignCorrelationId` as pino-http's
 * `genReqId` as well: the logger settles the id and this finds it, and one id covers the log lines,
 * the response and an error body.
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
        const correlationId = assignCorrelationId(request);

        response.setHeader(HeaderKey.CORRELATION_ID, correlationId);

        this.correlationIdService.runWith({ correlationId }, () => {
            next();
        });
    }
}
