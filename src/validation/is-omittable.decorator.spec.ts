import { IsString, validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { IsOmittable } from './is-omittable.decorator.js';

class Body {
    @IsOmittable()
    @IsString()
    name?: string;
}

const errorsFor = (value: unknown): number => {
    const body = new Body();

    if (value !== undefined) {
        Object.assign(body, { name: value });
    }

    return validateSync(body).length;
};

describe('IsOmittable', () => {
    it('skips the other validators when the field is left out', () => {
        expect(errorsFor(undefined)).toBe(0);
    });

    it('refuses null, which is the whole difference from IsOptional', () => {
        expect(errorsFor(null)).toBe(1);
    });

    it('still applies the other validators to a value', () => {
        expect(errorsFor('Vake')).toBe(0);
        expect(errorsFor(42)).toBe(1);
    });
});
