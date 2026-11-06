import { describe, expect, it } from 'vitest';

import { DATA_COLLECTION, REPORTABLE_HEADER_NAMES } from './error-reporter.constant.js';

/** Every leaf of a nested settings object, with the path that leads to it. */
const leaves = (value: unknown, path = ''): [string, unknown][] =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key))
        : [[path, value]];

describe('DATA_COLLECTION', () => {
    it('switches every category off', () => {
        // Sentry 11 collects every category unless told not to; one `true` here is a category of
        // customer data leaving the machine with a stack trace.
        const enabled = leaves(DATA_COLLECTION).filter(([, value]) => value === true);

        expect(enabled).toEqual([]);
        expect(DATA_COLLECTION.httpBodies).toEqual([]);
    });

    it('lets through exactly the headers the scrubber keeps', () => {
        expect(DATA_COLLECTION.httpHeaders).toEqual({
            request: { allow: [...REPORTABLE_HEADER_NAMES] },
            response: false,
        });
    });
});
