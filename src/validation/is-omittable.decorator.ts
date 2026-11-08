import { ValidateIf } from 'class-validator';

/**
 * Lets a field be left out, and nothing else.
 *
 * `@IsOptional()` also passes `null`, which on a column that cannot hold one reaches the database
 * and comes back as a 500. It stays right for a nullable field, where `null` means "clear this".
 */
export function IsOmittable(): PropertyDecorator {
    return ValidateIf((_object: object, value: unknown) => value !== undefined);
}
