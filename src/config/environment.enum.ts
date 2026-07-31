/**
 * Deployment environments.
 *
 * Config differs between them **only** by environment variable (§17). If you find yourself
 * branching on this enum inside business logic, the thing you are branching on wants to be a
 * config value instead.
 */
export enum Environment {
    LOCAL = 'local',
    TEST = 'test',
    STAGING = 'staging',
    PRODUCTION = 'production',
}
