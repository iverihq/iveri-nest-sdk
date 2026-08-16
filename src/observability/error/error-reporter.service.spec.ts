import { Logger } from '@nestjs/common';

import type { ErrorReporterModuleOptions } from './error-reporter-module-options.interface';
import { ErrorReporterService } from './error-reporter.service';

const OPTIONS: ErrorReporterModuleOptions = { environment: 'local', serviceName: 'conduit-api' };

describe('ErrorReporterService', () => {
    beforeAll(() => {
        Logger.overrideLogger(false);
    });

    afterAll(() => {
        Logger.overrideLogger(true);
    });

    describe('when no DSN is configured', () => {
        it('reports itself disabled', () => {
            // The normal state locally. Absent is a supported configuration, not a mistake —
            // the same arrangement REDIS_URL and REALTIME_API_URL use.
            expect(new ErrorReporterService(OPTIONS).isEnabled()).toBe(false);
            expect(new ErrorReporterService({ ...OPTIONS, dsn: null }).isEnabled()).toBe(false);
            expect(new ErrorReporterService({ ...OPTIONS, dsn: '' }).isEnabled()).toBe(false);
        });

        it('swallows a capture instead of throwing', () => {
            const service = new ErrorReporterService(OPTIONS);

            // Called from the exception filter, on the path that is already handling a failure.
            // Throwing here would replace a 500 with a crash.
            expect(() => service.capture(new Error('boom'), { correlationId: 'cid-1' })).not.toThrow();
        });

        it('shuts down without waiting on a flush that cannot happen', async () => {
            await expect(new ErrorReporterService(OPTIONS).onApplicationShutdown()).resolves.toBeUndefined();
        });
    });
});
