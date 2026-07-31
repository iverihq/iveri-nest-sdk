/**
 * One dependency a service needs before it can serve traffic.
 *
 * `check()` resolves when healthy and **throws** when not — the thrown message reaches the
 * readiness response, so make it say which dependency and why.
 */
export interface ReadinessCheck {
    /** Short identifier reported in the readiness body, e.g. `database`. */
    readonly name: string;

    check(): Promise<void>;
}

/** Injection token for the resolved list of {@link ReadinessCheck}s. */
export const READINESS_CHECKS = Symbol('IVERI_READINESS_CHECKS');
