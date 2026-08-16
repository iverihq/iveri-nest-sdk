import type { Maybe } from '@iveri/contracts';

/** How a service configures error reporting. */
export interface ErrorReporterModuleOptions {
    /**
     * Sentry DSN. **Absent is a supported state**, not a misconfiguration.
     *
     * Locally there is no tracker and no need for one — errors go to structured logs on a
     * machine whose logs you are already reading. Leaving this unset makes every capture a
     * no-op and every other surface behave identically, which is the same arrangement
     * `REDIS_URL` and `REALTIME_API_URL` use: the feature is off, the service is not.
     */
    dsn?: Maybe<string>;

    /** Value of Sentry's `environment` facet — pass `NODE_ENV`. */
    environment: string;

    /**
     * Which service the report came from, as a tag.
     *
     * One Sentry project holds the whole fleet, so without this an unhandled rejection is a
     * stack trace with no statement of whose process it was.
     */
    serviceName: string;

    /**
     * Build identifier, so a spike can be attributed to a deploy. Typically the commit SHA the
     * image was built from.
     */
    release?: Maybe<string>;

    /**
     * Fraction of errors actually sent, `0`–`1`. Defaults to `1`.
     *
     * Sampling errors is not like sampling traces: the interesting failure is usually the rare
     * one, so turn this down only when a known-noisy loop is drowning the project, and prefer
     * fixing the loop.
     */
    sampleRate?: number;
}
