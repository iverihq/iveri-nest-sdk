import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { Environment } from './environment.enum';
import { LogLevel } from './log-level.enum';

/**
 * The environment variables every Iveri service reads.
 *
 * Extend it per service and add what that service needs; the extension is what gets passed to
 * {@link validateEnv}:
 *
 * ```ts
 * export class AppEnvConfig extends BaseEnvConfig {
 *     @IsString()
 *     @IsNotEmpty()
 *     DATABASE_URL: string;
 * }
 * ```
 *
 * Property names are the variable names, so they are `SCREAMING_SNAKE_CASE` rather than the
 * usual `camelCase` — the one place the naming rules bend, because the names are not ours.
 */
export class BaseEnvConfig {
    @IsEnum(Environment)
    NODE_ENV: Environment;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(65535)
    PORT: number;

    @IsOptional()
    @IsEnum(LogLevel)
    LOG_LEVEL?: LogLevel = LogLevel.INFO;
}
