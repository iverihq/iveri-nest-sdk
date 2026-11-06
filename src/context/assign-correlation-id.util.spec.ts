import type { IncomingMessage } from 'node:http';

import { describe, expect, it } from 'vitest';

import { HeaderKey } from '../constant/header-key.constant.js';

import { assignCorrelationId } from './assign-correlation-id.util.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const requestWith = (value?: string | string[]): IncomingMessage =>
    ({ headers: value === undefined ? {} : { [HeaderKey.CORRELATION_ID]: value } }) as unknown as IncomingMessage;

describe('assignCorrelationId', () => {
    it("keeps a caller's id, so a request from another service keeps the id it started with", () => {
        const request = requestWith('checkout-7f3a');

        expect(assignCorrelationId(request)).toBe('checkout-7f3a');
        expect(request.headers[HeaderKey.CORRELATION_ID]).toBe('checkout-7f3a');
    });

    it('mints one at a true entry point and writes it back for whatever runs next', () => {
        const request = requestWith();
        const correlationId = assignCorrelationId(request);

        expect(correlationId).toMatch(UUID);
        expect(request.headers[HeaderKey.CORRELATION_ID]).toBe(correlationId);
    });

    it('answers the same id when called again, which is how the logger, middleware and filter agree', () => {
        const request = requestWith();

        expect(assignCorrelationId(request)).toBe(assignCorrelationId(request));
    });

    it('takes the first of a repeated header, trimmed', () => {
        expect(assignCorrelationId(requestWith(['  first  ', 'second']))).toBe('first');
    });

    it.each([
        ['empty', ''],
        ['whitespace', '   '],
        ['oversized', 'x'.repeat(129)],
    ])('replaces an %s id rather than logging it', (_, value) => {
        expect(assignCorrelationId(requestWith(value))).toMatch(UUID);
    });
});
