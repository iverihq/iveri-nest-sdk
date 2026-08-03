import type { Nullable } from '@iveri/contracts';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import type { RedisModuleOptions } from './redis-module-options.interface';
import {
    REDIS_CONNECT_TIMEOUT_MS,
    REDIS_DEFAULT_COMMAND_TIMEOUT_MS,
    REDIS_ERROR_LOG_INTERVAL_MS,
    REDIS_MODULE_OPTIONS,
    REDIS_RECONNECT_MAX_DELAY_MS,
} from './redis.constant';

/**
 * Owns the one Redis connection a process holds.
 *
 * **A Redis that is down must never become a service that is down.** Three connection options
 * exist for that and nothing else:
 *
 * - **`enableOfflineQueue: false`** — a command issued while disconnected rejects immediately
 *   instead of being buffered until the connection returns. Buffering is ioredis's default and
 *   it is the wrong default on any request path: the request would hang holding a caller's
 *   timeout budget, so a Redis outage becomes failed requests rather than a degraded feature.
 * - **`maxRetriesPerRequest: 1`** — the same reasoning for the window where the socket is up
 *   but the server is not answering.
 * - **`commandTimeout`** — bounds a server that accepts the connection and then wedges, which
 *   neither of the above covers.
 *
 * **No URL is a supported state**, not an error: {@link getClient} returns `null` and callers
 * degrade. Whether that is acceptable is a question about the service, not about the SDK, so a
 * service for which Redis is mandatory enforces it in its own env validation.
 *
 * This is deliberately **not** offered as a readiness check. Whether losing Redis should take an
 * instance out of rotation depends entirely on what the service uses it for — for a rate limiter
 * that fails open the answer is emphatically no, since it would stop traffic to protect a
 * control that has already given up. A service that genuinely cannot serve without Redis should
 * write that check itself, where the reasoning is visible.
 */
@Injectable()
export class RedisService implements OnApplicationShutdown {
    private readonly logger = new Logger(RedisService.name);

    private readonly client: Nullable<Redis>;

    /** Instant of the last logged connection error, for the log throttle. */
    private lastErrorLoggedAt = 0;

    /** Errors swallowed by the throttle since that line, reported with the next one. */
    private suppressedErrorCount = 0;

    constructor(@Inject(REDIS_MODULE_OPTIONS) options: RedisModuleOptions) {
        if (!options.url) {
            this.client = null;
            this.logger.warn({ message: 'No Redis URL configured — anything backed by Redis is disabled' });

            return;
        }

        this.client = new Redis(options.url, {
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
            commandTimeout: options.commandTimeoutMs ?? REDIS_DEFAULT_COMMAND_TIMEOUT_MS,
            retryStrategy: (attempt: number): number => Math.min(attempt * 200, REDIS_RECONNECT_MAX_DELAY_MS),
        });

        // Not optional: an `error` event with no listener is rethrown by EventEmitter, and a
        // Redis that goes away would take the process down with it — the exact failure this
        // whole class is arranged to avoid.
        this.client.on('error', (error: Error) => this.logConnectionError(error));
        this.client.on('ready', () => this.logger.log({ message: 'Redis connection ready' }));
    }

    /**
     * The client, or `null` when no URL was configured.
     *
     * Callers must handle `null`. A returned client is **not** a promise that Redis is
     * reachable — commands on a disconnected client reject, by design.
     */
    getClient(): Nullable<Redis> {
        return this.client;
    }

    /** Whether a client exists at all. Says nothing about whether the server is answering. */
    isConfigured(): boolean {
        return this.client !== null;
    }

    async onApplicationShutdown(): Promise<void> {
        if (!this.client) {
            return;
        }

        try {
            // `quit` finishes in-flight commands and closes cleanly; `disconnect` severs the
            // socket. On a SIGTERM there may be a command mid-flight belonging to a request that
            // is still draining.
            await this.client.quit();
        } catch {
            // Already gone, or never connected. Shutting down is not the moment to care, and a
            // throw here would mask whatever else the shutdown sequence is doing.
            this.client.disconnect();
        }
    }

    /**
     * Logs at most one connection error per {@link REDIS_ERROR_LOG_INTERVAL_MS}.
     *
     * The count of what was swallowed travels with the next line, so the throttle hides volume
     * and not the fact.
     */
    private logConnectionError(error: Error): void {
        const now = Date.now();

        if (now - this.lastErrorLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) {
            this.suppressedErrorCount += 1;

            return;
        }

        this.logger.error({
            message: 'Redis connection error',
            error: error.message,
            suppressedSinceLastLog: this.suppressedErrorCount,
        });

        this.lastErrorLoggedAt = now;
        this.suppressedErrorCount = 0;
    }
}
