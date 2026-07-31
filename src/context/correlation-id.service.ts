import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { Maybe } from '@iveri/contracts';
import { Injectable } from '@nestjs/common';

import type { CorrelationContext } from './correlation-context.interface';

/**
 * Owns the ambient correlation context.
 *
 * Every entry point that can start a unit of work — the HTTP middleware, a queue consumer, a
 * cron job — wraps its handler in {@link CorrelationIdService.runWith}. Everything downstream
 * reads the id from here rather than being handed it as a parameter.
 *
 * The storage itself is module-level, not an instance field: a service could be instantiated
 * once per module, and two instances with two stores would silently lose context across a
 * module boundary.
 */
@Injectable()
export class CorrelationIdService {
    private static readonly storage = new AsyncLocalStorage<CorrelationContext>();

    /**
     * Runs `callback` inside a fresh correlation context. Everything the callback starts,
     * synchronously or asynchronously, sees this context.
     */
    runWith<T>(context: CorrelationContext, callback: () => T): T {
        return CorrelationIdService.storage.run(context, callback);
    }

    /**
     * The current context, or `undefined` outside any `runWith` — a unit test, or code
     * reached before the middleware ran.
     */
    getContext(): Maybe<CorrelationContext> {
        return CorrelationIdService.storage.getStore();
    }

    /** The current correlation id, or `undefined` outside a context. */
    getCorrelationId(): Maybe<string> {
        return CorrelationIdService.storage.getStore()?.correlationId;
    }

    /**
     * The current correlation id, generating and *discarding* a fresh one when called outside
     * a context.
     *
     * Use this only where an id is structurally required and a missing one must not fail the
     * request — an outbound header, a log field. The generated id is not stored, so two calls
     * outside a context return two different ids; that is deliberate, because the alternative
     * is silently stitching unrelated work together under one id.
     */
    getCorrelationIdOrGenerate(): string {
        return this.getCorrelationId() ?? randomUUID();
    }

    /**
     * Merges fields into the current context so later log lines carry them. No-op outside a
     * context — enriching logs must never be the thing that throws.
     */
    addFields(fields: Record<string, unknown>): void {
        const context = CorrelationIdService.storage.getStore();
        if (!context) {
            return;
        }

        context.fields = { ...context.fields, ...fields };
    }
}
