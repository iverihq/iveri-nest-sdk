import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { READINESS_CHECKS, STARTUP_CHECKS, type HealthCheck } from './health-check.interface';
import { HealthController } from './health.controller';
import { HealthModule } from './health.module';

@Injectable()
class DatabaseCheck implements HealthCheck {
    readonly name = 'database';

    calls = 0;

    check(): Promise<void> {
        this.calls += 1;

        return Promise.resolve();
    }
}

@Injectable()
class MigrationsCheck implements HealthCheck {
    readonly name = 'migrations';

    check(): Promise<void> {
        return Promise.resolve();
    }
}

interface Broker {
    ping: () => string;
}

const BROKER = Symbol('BROKER');

@Module({
    providers: [{ provide: BROKER, useValue: { ping: (): string => 'PONG' } satisfies Broker }],
    exports: [BROKER],
})
class BrokerModule {}

@Injectable()
class BrokerCheck implements HealthCheck {
    readonly name = 'broker';

    constructor(@Inject(BROKER) private readonly broker: Broker) {}

    check(): Promise<void> {
        return this.broker.ping() === 'PONG' ? Promise.resolve() : Promise.reject(new Error('broker unreachable'));
    }
}

const build = async (module: ReturnType<typeof HealthModule.forRoot>) => {
    const testingModule = await Test.createTestingModule({ imports: [module] }).compile();

    return {
        readiness: testingModule.get<HealthCheck[]>(READINESS_CHECKS),
        startup: testingModule.get<HealthCheck[]>(STARTUP_CHECKS),
        controller: testingModule.get(HealthController),
        module: testingModule,
    };
};

describe('HealthModule', () => {
    it('registers the controller with both lists empty by default', async () => {
        const { readiness, startup, controller } = await build(HealthModule.forRoot());

        expect(readiness).toEqual([]);
        expect(startup).toEqual([]);
        await expect(controller.ready()).resolves.toEqual({ status: 'ready', checks: [] });
        await expect(controller.startup()).resolves.toEqual({ status: 'started', checks: [] });
    });

    it('resolves checks through DI and preserves their order', async () => {
        const { readiness } = await build(HealthModule.forRoot({ checks: [DatabaseCheck, MigrationsCheck] }));

        expect(readiness.map((check) => check.name)).toEqual(['database', 'migrations']);
    });

    it('defaults startup checks to the readiness list', async () => {
        const { readiness, startup } = await build(HealthModule.forRoot({ checks: [DatabaseCheck] }));

        expect(startup).toEqual(readiness);
    });

    it('takes a startup list that differs from readiness', async () => {
        const { readiness, startup } = await build(
            HealthModule.forRoot({ checks: [DatabaseCheck], startupChecks: [DatabaseCheck, MigrationsCheck] }),
        );

        expect(readiness.map((check) => check.name)).toEqual(['database']);
        expect(startup.map((check) => check.name)).toEqual(['database', 'migrations']);
    });

    it('opts out of startup checking with an explicit empty list', async () => {
        const { startup } = await build(HealthModule.forRoot({ checks: [DatabaseCheck], startupChecks: [] }));

        expect(startup).toEqual([]);
    });

    it('resolves a check listed in both lists to one instance', async () => {
        // Two instances would answer the two probes from different state, and a check that
        // caches or counts is exactly the kind someone writes next.
        const { readiness, startup } = await build(
            HealthModule.forRoot({ checks: [DatabaseCheck], startupChecks: [DatabaseCheck] }),
        );

        expect(readiness[0]).toBe(startup[0]);
    });

    it('imports modules the checks depend on', async () => {
        const { readiness } = await build(HealthModule.forRoot({ checks: [BrokerCheck], imports: [BrokerModule] }));

        expect(readiness.map((check) => check.name)).toEqual(['broker']);
        await expect(readiness[0].check()).resolves.toBeUndefined();
    });
});
