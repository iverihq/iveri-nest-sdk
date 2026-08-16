import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import * as Sentry from '@sentry/node';

import type { ErrorReporterModuleOptions } from './error-reporter-module-options.interface';
import { ERROR_REPORTER_FLUSH_TIMEOUT_MS, ERROR_REPORTER_MODULE_OPTIONS } from './error-reporter.constant';
import type { ErrorReportContext, ErrorReporter } from './error-reporter.interface';
import { scrubEvent } from './scrub-event.util';

/**
 * Reports unexpected failures to Sentry, or to nothing at all.
 *
 * A thin wrapper, not a provider abstraction. The seam exists because **the no-op path is the
 * normal one** — locally there is no DSN and errors go to structured logs — not because a
 * second tracker is planned. If one ever is, this is where it goes; until then there is no
 * interface here pretending to be vendor-neutral.
 *
 * **What gets captured is decided by `GlobalExceptionFilter`, not here.** Only 5xx and genuinely
 * unhandled failures are reported: a `ValidationFailedException` is a 400, which is the system
 * working correctly, and capturing all sixteen typed domain exceptions would bury the one real
 * bug under a week of caller mistakes on the first day.
 *
 * **Tenant ids are tagged here and forbidden as metric labels**, which looks inconsistent and
 * is not. A Prometheus label is a stored time series and an unauthenticated exposure; a Sentry
 * tag is neither — high cardinality is what its index is built for, the project is
 * authenticated, and "which customer hit this" is the first question asked about any error.
 */
@Injectable()
export class ErrorReporterService implements ErrorReporter, OnApplicationShutdown {
    private readonly logger = new Logger(ErrorReporterService.name);

    private readonly enabled: boolean;

    constructor(@Inject(ERROR_REPORTER_MODULE_OPTIONS) private readonly options: ErrorReporterModuleOptions) {
        this.enabled = Boolean(options.dsn);

        if (!this.enabled) {
            this.logger.log({ message: 'No Sentry DSN configured — error reporting is disabled' });

            return;
        }

        Sentry.init({
            dsn: options.dsn ?? undefined,
            environment: options.environment,
            release: options.release ?? undefined,
            sampleRate: options.sampleRate ?? 1,
            // Never enabled. The defaults are written for an ordinary web application; two
            // services here hold customers' provider credentials and raw webhook bytes, and
            // this flag is what decides whether those travel with a stack trace.
            sendDefaultPii: false,
            // Errors only. Tracing would instrument every outbound call in the process — for a
            // gateway whose job is outbound calls, that is a large bill for a question nothing
            // is asking yet, and it is a separate decision from wanting crash reports.
            tracesSampleRate: 0,
            beforeSend: (event) => scrubEvent(event),
        });

        this.logger.log({ message: 'Sentry error reporting enabled', environment: options.environment });
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    capture(exception: unknown, context: ErrorReportContext = {}): void {
        if (!this.enabled) {
            return;
        }

        Sentry.withScope((scope) => {
            scope.setTag('service', this.options.serviceName);

            for (const [name, value] of Object.entries({
                correlationId: context.correlationId,
                tenantId: context.tenantId,
                method: context.method,
                route: context.route,
            })) {
                if (value) {
                    scope.setTag(name, value);
                }
            }

            if (context.extra) {
                // Set as one object rather than merged into the event, so `beforeSend` sees it
                // in `extra` and scrubs it — nothing reaches the wire unscrubbed regardless of
                // what a caller attached.
                scope.setExtras(context.extra);
            }

            Sentry.captureException(exception);
        });
    }

    async onApplicationShutdown(): Promise<void> {
        if (!this.enabled) {
            return;
        }

        // Bounded. A container being drained must not be held open past the orchestrator's
        // patience for the sake of a crash report — SIGKILL would lose the report and the
        // graceful database shutdown with it.
        await Sentry.flush(ERROR_REPORTER_FLUSH_TIMEOUT_MS);
    }
}
