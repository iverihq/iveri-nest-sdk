import type { ErrorEvent, Event } from '@sentry/node';

import {
    MAX_SCRUB_DEPTH,
    REDACTED_PLACEHOLDER,
    REPORTABLE_HEADER_NAMES,
    SENSITIVE_KEY_PATTERN,
} from './error-reporter.constant';

/**
 * Strips everything from an outbound error report that we are not willing to store in a third
 * party's database.
 *
 * This function is the entire safety case for sending errors off the machine, and it is why
 * `sendDefaultPii` is never enabled: the SDK's defaults are written for an ordinary web
 * application, and two Iveri services are not ordinary.
 *
 * - **`conduit-api`'s product is raw webhook bytes.** The request body it is holding when
 *   something throws is a customer's payload from Meta or Stripe, and the URL it arrived on
 *   contains the ingress token — the credential that authorises posting to that endpoint.
 * - **`iveri-identity-api` handles passwords, refresh tokens and API keys**, all of which live
 *   in request bodies on exactly the routes most likely to throw.
 *
 * So the request is reduced to the two things that are diagnostic and safe: the **method** and
 * the **allowlisted headers**. The URL is dropped wholesale rather than sanitised, and the
 * route pattern is reported instead as a tag — the same substitution the metrics module makes,
 * for the same reason: a pattern says where the failure was, and an instance says who it was.
 */
export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
    const scrubbed: ErrorEvent = {
        ...event,
        ...(event.extra ? { extra: scrubRecord(event.extra, 0) } : {}),
        ...(event.contexts ? { contexts: scrubRecord(event.contexts, 0) as Event['contexts'] } : {}),
    };

    if (event.request) {
        // Rebuilt from nothing rather than deleted field by field. A future Sentry release
        // adding another request field would otherwise be forwarded by default, and the whole
        // point of this function is that new things are excluded until someone decides they are
        // safe.
        scrubbed.request = {
            method: event.request.method,
            headers: filterHeaders(event.request.headers),
        };
    }

    if (event.user) {
        // An id identifies a row we own; the rest describes a person. `ip_address` is also what
        // moves a report into the scope of a data-protection question we have not answered.
        scrubbed.user = { id: event.user.id };
    }

    if (event.breadcrumbs) {
        scrubbed.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
            ...breadcrumb,
            ...(breadcrumb.data ? { data: scrubRecord(breadcrumb.data, 0) } : {}),
        }));
    }

    return scrubbed;
};

const filterHeaders = (headers: Record<string, string> | undefined): Record<string, string> => {
    if (!headers) {
        return {};
    }

    const filtered: Record<string, string> = {};

    for (const [name, value] of Object.entries(headers)) {
        // Node lowercases inbound header names, but an event can be assembled from anywhere, so
        // the comparison is folded rather than trusted.
        if (REPORTABLE_HEADER_NAMES.includes(name.toLowerCase())) {
            filtered[name] = value;
        }
    }

    return filtered;
};

const scrubRecord = (record: Record<string, unknown>, depth: number): Record<string, unknown> => {
    const scrubbed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
        scrubbed[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_PLACEHOLDER : scrubValue(value, depth + 1);
    }

    return scrubbed;
};

const scrubValue = (value: unknown, depth: number): unknown => {
    // Also what terminates a cyclic structure. Reporting the placeholder rather than dropping
    // the branch keeps the shape readable — a reader can see something was there.
    if (depth > MAX_SCRUB_DEPTH) {
        return REDACTED_PLACEHOLDER;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => scrubValue(entry, depth + 1));
    }

    if (typeof value === 'object' && value !== null) {
        return scrubRecord(value as Record<string, unknown>, depth);
    }

    return value;
};
