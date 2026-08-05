import { type DynamicModule, Module, type ModuleMetadata, type Provider, type Type } from '@nestjs/common';

import { READINESS_CHECKS, STARTUP_CHECKS, type HealthCheck } from './health-check.interface';
import { HealthController } from './health.controller';

export interface HealthModuleOptions {
    /**
     * Providers to resolve as **readiness** checks — the traffic gate. Order is preserved in
     * the response.
     *
     * A check belongs here when losing the dependency should stop this instance receiving
     * requests and let it back in when the dependency returns.
     */
    checks?: Type<HealthCheck>[];

    /**
     * Providers to resolve as **startup** checks — boot validation. Defaults to {@link checks},
     * because in most services "what must exist before serving" and "what must exist before
     * booting" are the same list.
     *
     * Pass this explicitly when they differ. The usual reason is a dependency a service cannot
     * be configured without but can survive losing later: it belongs in startup so a
     * misconfigured container fails loudly at boot, and out of readiness so a mid-life outage
     * degrades one feature instead of draining the whole fleet.
     *
     * `startupChecks: []` opts out of startup checking entirely — the probe then reports
     * started as soon as the process serves HTTP.
     */
    startupChecks?: Type<HealthCheck>[];

    /** Modules exporting anything the checks inject. */
    imports?: ModuleMetadata['imports'];
}

/**
 * Registers `GET /health/live`, `GET /health/ready` and `GET /health/startup`.
 *
 * `forRoot()` with no options gives all three, with readiness and startup reporting no checks
 * — the right shape for a service with no dependency it cannot serve without.
 *
 * ```ts
 * HealthModule.forRoot({
 *     checks: [DatabaseReadinessCheck],
 *     startupChecks: [DatabaseReadinessCheck, MigrationsAppliedCheck],
 * });
 * ```
 */
@Module({})
export class HealthModule {
    static forRoot(options: HealthModuleOptions = {}): DynamicModule {
        const readinessChecks = options.checks ?? [];
        const startupChecks = options.startupChecks ?? readinessChecks;

        return {
            module: HealthModule,
            imports: options.imports ?? [],
            controllers: [HealthController],
            providers: [
                // Deduplicated because a class registered in both lists is one provider and one
                // instance; providing it twice would resolve two, and a stateful check would
                // then answer the two probes from different state.
                ...new Set([...readinessChecks, ...startupChecks]),
                HealthModule.collect(READINESS_CHECKS, readinessChecks),
                HealthModule.collect(STARTUP_CHECKS, startupChecks),
            ],
        };
    }

    /**
     * Collects resolved check instances into the array the controller injects.
     *
     * Nest has no native multi-provider, so the checks are injected positionally and gathered
     * by a factory.
     */
    private static collect(token: symbol, checks: Type<HealthCheck>[]): Provider {
        return {
            provide: token,
            useFactory: (...resolved: HealthCheck[]): HealthCheck[] => resolved,
            inject: checks,
        };
    }
}
