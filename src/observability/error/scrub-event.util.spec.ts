import type { ErrorEvent } from '@sentry/node';

import { MAX_SCRUB_DEPTH, REDACTED_PLACEHOLDER } from './error-reporter.constant';
import { scrubEvent } from './scrub-event.util';

/**
 * Sentry's own field names. They are `snake_case` because they are its wire format rather than
 * ours, so they are referenced through constants instead of written as literal keys.
 */
const SENTRY_FIELD = { eventId: 'event_id', queryString: 'query_string', ipAddress: 'ip_address' } as const;

const buildEvent = (event: Partial<ErrorEvent> = {}): ErrorEvent => ({ ...event }) as ErrorEvent;

describe('scrubEvent', () => {
    describe('the request', () => {
        it('drops the body outright', () => {
            // conduit-api is holding a customer's Meta or Stripe payload when it throws, and
            // iveri-identity-api is holding a password.
            const scrubbed = scrubEvent(
                buildEvent({ request: { method: 'POST', data: { password: 'hunter2', card: '4111111111111111' } } }),
            );

            expect(scrubbed.request).not.toHaveProperty('data');
        });

        it('drops the URL, which carries conduit-api ingress tokens', () => {
            const scrubbed = scrubEvent(
                buildEvent({ request: { method: 'POST', url: 'https://api.iveri.dev/ingress/tok_live_9f2b1c' } }),
            );

            // The token in that path is the credential authorising posts to the endpoint. The
            // route pattern is reported as a tag instead.
            expect(scrubbed.request).not.toHaveProperty('url');
        });

        it('drops the query string and cookies', () => {
            const scrubbed = scrubEvent(
                buildEvent({
                    request: {
                        method: 'GET',
                        [SENTRY_FIELD.queryString]: 'access_token=abc',
                        cookies: { session: 'xyz' },
                    },
                }),
            );

            expect(scrubbed.request).not.toHaveProperty('query_string');
            expect(scrubbed.request).not.toHaveProperty('cookies');
        });

        it('keeps the method', () => {
            const scrubbed = scrubEvent(buildEvent({ request: { method: 'DELETE' } }));

            expect(scrubbed.request?.method).toBe('DELETE');
        });

        it('leaves a request-free event alone', () => {
            expect(scrubEvent(buildEvent()).request).toBeUndefined();
        });
    });

    describe('headers', () => {
        it('keeps only the allowlisted ones', () => {
            const scrubbed = scrubEvent(
                buildEvent({
                    request: {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-correlation-id': 'cid-1',
                            authorization: 'Bearer secret',
                            cookie: 'session=xyz',
                        },
                    },
                }),
            );

            expect(scrubbed.request?.headers).toEqual({
                'content-type': 'application/json',
                'x-correlation-id': 'cid-1',
            });
        });

        it('drops a signature header nobody has heard of yet', () => {
            // The reason this is an allowlist. Every provider Conduit integrates invents its own
            // signature header, and the next one is by definition not on a list written today.
            const scrubbed = scrubEvent(
                buildEvent({ request: { method: 'POST', headers: { 'x-newprovider-signature-512': 'deadbeef' } } }),
            );

            expect(scrubbed.request?.headers).toEqual({});
        });

        it('folds case before comparing', () => {
            const scrubbed = scrubEvent(
                buildEvent({ request: { method: 'POST', headers: { 'Content-Type': 'application/json' } } }),
            );

            expect(scrubbed.request?.headers).toEqual({ 'Content-Type': 'application/json' });
        });
    });

    describe('structured context', () => {
        it('redacts a value whose key names a secret', () => {
            const scrubbed = scrubEvent(
                buildEvent({ extra: { refreshToken: 'rt_live_1', clientSecret: 's3cr3t', endpointId: 'ep-1' } }),
            );

            expect(scrubbed.extra).toEqual({
                refreshToken: REDACTED_PLACEHOLDER,
                clientSecret: REDACTED_PLACEHOLDER,
                endpointId: 'ep-1',
            });
        });

        it('matches the key as a case-insensitive substring', () => {
            const scrubbed = scrubEvent(
                buildEvent({ extra: { WRAPPED_ENCRYPTION_KEY: 'k', 'X-Hub-Signature-256': 'sig', passphrase: 'p' } }),
            );

            expect(Object.values(scrubbed.extra ?? {})).toEqual([
                REDACTED_PLACEHOLDER,
                REDACTED_PLACEHOLDER,
                REDACTED_PLACEHOLDER,
            ]);
        });

        it('reaches into nested objects and arrays', () => {
            const scrubbed = scrubEvent(
                buildEvent({ extra: { connection: { credentials: [{ token: 'a' }], name: 'meta' } } }),
            );

            expect(scrubbed.extra).toEqual({
                connection: { credentials: REDACTED_PLACEHOLDER, name: 'meta' },
            });
        });

        it('stops at the depth bound rather than walking an arbitrary structure', () => {
            let nested: Record<string, unknown> = { leaf: 'value' };

            for (let index = 0; index < MAX_SCRUB_DEPTH + 3; index += 1) {
                nested = { level: nested };
            }

            // Bounded because the input is arbitrary — a cyclic object attached as context would
            // otherwise stall a process that is already handling an error.
            expect(() => scrubEvent(buildEvent({ extra: nested }))).not.toThrow();
        });

        it('terminates on a cyclic structure', () => {
            const cyclic: Record<string, unknown> = { name: 'root' };
            cyclic.self = cyclic;

            expect(() => scrubEvent(buildEvent({ extra: cyclic }))).not.toThrow();
        });

        it('scrubs breadcrumb data, which the HTTP integration fills with request detail', () => {
            const scrubbed = scrubEvent(
                buildEvent({ breadcrumbs: [{ category: 'http', data: { url: 'https://x', apiKey: 'k' } }] }),
            );

            expect(scrubbed.breadcrumbs?.[0].data).toEqual({ url: 'https://x', apiKey: REDACTED_PLACEHOLDER });
        });
    });

    describe('the user', () => {
        it('keeps the id and drops everything describing a person', () => {
            const scrubbed = scrubEvent(
                buildEvent({
                    user: {
                        id: 'user-1',
                        email: 'roma@example.com',
                        username: 'roma',
                        [SENTRY_FIELD.ipAddress]: '203.0.113.7',
                    },
                }),
            );

            expect(scrubbed.user).toEqual({ id: 'user-1' });
        });
    });

    it('preserves the parts of the event that carry the diagnosis', () => {
        const scrubbed = scrubEvent(
            buildEvent({
                [SENTRY_FIELD.eventId]: 'evt-1',
                exception: { values: [{ type: 'TypeError', value: 'x is not a function' }] },
                tags: { service: 'conduit-api' },
            }),
        );

        expect(scrubbed.event_id).toBe('evt-1');
        expect(scrubbed.exception?.values?.[0].type).toBe('TypeError');
        expect(scrubbed.tags).toEqual({ service: 'conduit-api' });
    });
});
