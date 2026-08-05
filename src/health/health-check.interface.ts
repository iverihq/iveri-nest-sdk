/**
 * One dependency a service needs before it can do its job.
 *
 * `check()` resolves when healthy and **throws** when not — the thrown message reaches the
 * probe response, so make it say which dependency and why.
 *
 * The same check can be registered as a readiness check, a startup check, or both. Which list
 * it belongs in is a statement about what should happen when it fails, not about the check:
 * a failed readiness check takes the instance out of rotation, a failed startup check keeps
 * the container from ever entering it.
 */
export interface HealthCheck {
    /** Short identifier reported in the probe body, e.g. `database`. */
    readonly name: string;

    check(): Promise<void>;
}

/** Injection token for the resolved list of readiness {@link HealthCheck}s. */
export const READINESS_CHECKS = Symbol('IVERI_READINESS_CHECKS');

/** Injection token for the resolved list of startup {@link HealthCheck}s. */
export const STARTUP_CHECKS = Symbol('IVERI_STARTUP_CHECKS');
