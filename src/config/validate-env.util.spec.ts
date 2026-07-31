import { IsNotEmpty, IsString } from 'class-validator';

import { BaseEnvConfig } from './base-env.config';
import { Environment } from './environment.enum';
import { LogLevel } from './log-level.enum';
import { validateEnv } from './validate-env.util';

class AppEnvConfig extends BaseEnvConfig {
    @IsString()
    @IsNotEmpty()
    DATABASE_URL: string;
}

const VALID_ENV = {
    NODE_ENV: Environment.LOCAL,
    PORT: '3000',
    DATABASE_URL: 'postgres://localhost:5432/iveri_identity',
};

describe('validateEnv', () => {
    it('returns a typed config for a valid environment', () => {
        const config = validateEnv(AppEnvConfig, VALID_ENV);

        expect(config.NODE_ENV).toBe(Environment.LOCAL);
        expect(config.DATABASE_URL).toBe('postgres://localhost:5432/iveri_identity');
    });

    it('converts a numeric variable from its string form', () => {
        // Every environment variable arrives as a string; PORT has to come back a number.
        const config = validateEnv(AppEnvConfig, VALID_ENV);

        expect(config.PORT).toBe(3000);
        expect(typeof config.PORT).toBe('number');
    });

    it('applies the declared default for an optional variable', () => {
        expect(validateEnv(AppEnvConfig, VALID_ENV).LOG_LEVEL).toBe(LogLevel.INFO);
    });

    it('throws when a required variable is missing', () => {
        const { DATABASE_URL: _omitted, ...withoutDatabase } = VALID_ENV;

        expect(() => validateEnv(AppEnvConfig, withoutDatabase)).toThrow(/DATABASE_URL/);
    });

    it('throws rather than coercing a non-numeric port to NaN', () => {
        expect(() => validateEnv(AppEnvConfig, { ...VALID_ENV, PORT: 'not-a-port' })).toThrow(/PORT/);
    });

    it('rejects a port outside the valid range', () => {
        expect(() => validateEnv(AppEnvConfig, { ...VALID_ENV, PORT: '70000' })).toThrow(/PORT/);
    });

    it('rejects an unknown NODE_ENV', () => {
        expect(() => validateEnv(AppEnvConfig, { ...VALID_ENV, NODE_ENV: 'preprod' })).toThrow(/NODE_ENV/);
    });

    it('reports every failure at once, not just the first', () => {
        // One restart should tell you everything that is wrong with the environment.
        expect(() => validateEnv(AppEnvConfig, { PORT: 'nope' })).toThrow(
            expect.objectContaining({
                message: expect.stringMatching(/NODE_ENV[\s\S]*DATABASE_URL|DATABASE_URL[\s\S]*NODE_ENV/) as string,
            }),
        );
    });
});
