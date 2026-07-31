import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

/**
 * Validates the process environment against a config class, or exits.
 *
 * Wire it into `ConfigModule` so it runs during bootstrap:
 *
 * ```ts
 * ConfigModule.forRoot({
 *     isGlobal: true,
 *     validate: (raw) => validateEnv(AppEnvConfig, raw),
 * });
 * ```
 *
 * Throwing here is the point. A service that starts with a missing `DATABASE_URL` fails on
 * the first request that needs it — in production, minutes later, as a 500 with a stack trace
 * that says nothing about config. Failing at startup turns that into a container that never
 * passes its health check and a deploy that rolls back on its own.
 *
 * `enableImplicitConversion` is deliberately off: every environment variable arrives as a
 * string, and implicit conversion would coerce `PORT=abc` to `NaN` and pass it. Declare
 * `@Type(() => Number)` on the property instead, which converts *and* still validates.
 *
 * @throws when any variable is missing or invalid, with every failure listed rather than just
 * the first — one restart should tell you everything that is wrong.
 */
export const validateEnv = <TConfig extends object>(
    schema: ClassConstructor<TConfig>,
    raw: Record<string, unknown>,
): TConfig => {
    const config = plainToInstance(schema, raw, { enableImplicitConversion: false });
    const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });

    if (errors.length > 0) {
        const report = errors
            .map((error) => `  ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
            .join('\n');

        throw new Error(`Invalid environment configuration:\n${report}`);
    }

    return config;
};
