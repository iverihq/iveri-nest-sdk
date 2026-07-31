import { type DynamicModule, Module, type ModuleMetadata, type Type } from '@nestjs/common';

import { HealthController } from './health.controller';
import { READINESS_CHECKS, type ReadinessCheck } from './readiness-check.interface';

export interface HealthModuleOptions {
    /**
     * Providers to resolve as readiness checks. Order is preserved in the response.
     *
     * ```ts
     * HealthModule.forRoot({ checks: [DatabaseReadinessCheck] });
     * ```
     */
    checks?: Type<ReadinessCheck>[];

    /** Modules exporting anything the checks inject. */
    imports?: ModuleMetadata['imports'];
}

/**
 * Registers `GET /health` and `GET /health/ready`.
 *
 * `forRoot` with no options gives a liveness endpoint and an always-ready readiness endpoint,
 * which is the right shape for a stateless service like `unibox-realtime`.
 */
@Module({})
export class HealthModule {
    static forRoot(options: HealthModuleOptions = {}): DynamicModule {
        const checks = options.checks ?? [];

        return {
            module: HealthModule,
            imports: options.imports ?? [],
            controllers: [HealthController],
            providers: [
                ...checks,
                {
                    provide: READINESS_CHECKS,
                    // Nest has no native multi-provider, so the checks are injected
                    // positionally and collected into the array the controller expects.
                    useFactory: (...resolved: ReadinessCheck[]): ReadinessCheck[] => resolved,
                    inject: checks,
                },
            ],
        };
    }
}
