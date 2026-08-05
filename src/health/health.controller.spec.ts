import { RequestMethod, VERSION_NEUTRAL } from '@nestjs/common';
import { CONTROLLER_WATERMARK, HOST_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';

import { IS_PUBLIC_KEY } from '../auth/public.decorator';

import type { HealthCheck } from './health-check.interface';
import { HEALTH_ROUTE_EXCLUSIONS } from './health.constant';
import { HealthController } from './health.controller';

const buildController = (checks: HealthCheck[], startupChecks: HealthCheck[] = checks): HealthController =>
    new HealthController(checks, startupChecks);

const passingCheck = (name: string): HealthCheck => ({
    name,
    check: (): Promise<void> => Promise.resolve(),
});

const failingCheck = (name: string, message: string): HealthCheck => ({
    name,
    check: (): Promise<void> => Promise.reject(new Error(message)),
});

describe('HealthController', () => {
    describe('routing metadata', () => {
        // These assertions guard operational contracts, not code paths — each one broke in a
        // real service before it was pinned here.
        it('is registered under /health', () => {
            expect(Reflect.getMetadata(CONTROLLER_WATERMARK, HealthController)).toBe(true);
            expect(Reflect.getMetadata(PATH_METADATA, HealthController)).toBe('health');
            expect(Reflect.getMetadata(HOST_METADATA, HealthController)).toBeUndefined();
        });

        it('exposes the three probes and no bare /health', () => {
            const prototype = HealthController.prototype as unknown as Record<string, object>;
            const paths = Object.getOwnPropertyNames(prototype)
                .filter((name) => name !== 'constructor')
                .map((name): unknown => Reflect.getMetadata(PATH_METADATA, prototype[name]))
                .filter((path): path is string => typeof path === 'string');

            // Nest gives an undecorated `@Get()` the path '/', which is exactly the legacy route
            // that must not come back: it never said which of the three questions it answered.
            expect(paths.sort()).toEqual(['live', 'ready', 'startup']);
        });

        it('is version-neutral, so URI versioning never moves the probes to /v1/health', () => {
            expect(Reflect.getMetadata(VERSION_METADATA, HealthController)).toBe(VERSION_NEUTRAL);
        });

        it('is public, so a global AuthGuard cannot 401 a load balancer that has no credentials', () => {
            expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
        });

        it('is tagged Health for OpenAPI, so services with only probes still have usable docs', () => {
            expect(Reflect.getMetadata('swagger/apiUseTags', HealthController)).toEqual(['Health']);
        });

        it('excludes every probe route from the global prefix', () => {
            // A route added to the controller and not to the exclusions is served from
            // `/api/health/...` in every service at once.
            expect(HEALTH_ROUTE_EXCLUSIONS).toEqual([
                { path: 'health/live', method: RequestMethod.GET },
                { path: 'health/ready', method: RequestMethod.GET },
                { path: 'health/startup', method: RequestMethod.GET },
            ]);
        });
    });

    describe('live', () => {
        it('reports ok without consulting any dependency', () => {
            const check = failingCheck('database', 'connection refused');
            const spy = jest.spyOn(check, 'check');

            expect(buildController([check]).live()).toEqual({ status: 'ok' });
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('ready', () => {
        it('reports ready with every check up', async () => {
            const controller = buildController([passingCheck('database'), passingCheck('redis')]);

            await expect(controller.ready()).resolves.toEqual({
                status: 'ready',
                checks: [
                    { name: 'database', status: 'up' },
                    { name: 'redis', status: 'up' },
                ],
            });
        });

        it('reports ready with no checks registered', async () => {
            await expect(buildController([]).ready()).resolves.toEqual({ status: 'ready', checks: [] });
        });

        it('throws 503 naming the failed check, so the instance leaves rotation', async () => {
            const controller = buildController([passingCheck('redis'), failingCheck('database', 'connection refused')]);

            await expect(controller.ready()).rejects.toMatchObject({
                status: 503,
                response: {
                    status: 'not_ready',
                    checks: [
                        { name: 'redis', status: 'up' },
                        { name: 'database', status: 'down', error: 'connection refused' },
                    ],
                },
            });
        });

        it('describes a non-Error rejection rather than leaking undefined', async () => {
            const controller = buildController([
                { name: 'database', check: (): Promise<void> => Promise.reject('nope') },
            ]);

            await expect(controller.ready()).rejects.toMatchObject({
                response: { checks: [{ name: 'database', status: 'down', error: 'unknown failure' }] },
            });
        });

        it('runs its own list, not the startup one', async () => {
            const startupOnly = failingCheck('migrations', 'not applied');
            const spy = jest.spyOn(startupOnly, 'check');

            await expect(buildController([passingCheck('database')], [startupOnly]).ready()).resolves.toMatchObject({
                status: 'ready',
            });
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('startup', () => {
        it('reports started once every startup check passes', async () => {
            const controller = buildController([], [passingCheck('database')]);

            await expect(controller.startup()).resolves.toEqual({
                status: 'started',
                checks: [{ name: 'database', status: 'up' }],
            });
        });

        it('reports started immediately when nothing is registered', async () => {
            await expect(buildController([], []).startup()).resolves.toEqual({ status: 'started', checks: [] });
        });

        it('throws 503 while a startup check is still down', async () => {
            const controller = buildController([], [failingCheck('database', 'connection refused')]);

            await expect(controller.startup()).rejects.toMatchObject({
                status: 503,
                response: {
                    status: 'starting',
                    checks: [{ name: 'database', status: 'down', error: 'connection refused' }],
                },
            });
        });

        it('recovers when a slow dependency comes up, which is the boot window it exists to guard', async () => {
            let up = false;
            const controller = buildController(
                [],
                [
                    {
                        name: 'database',
                        check: (): Promise<void> => (up ? Promise.resolve() : Promise.reject(new Error('starting'))),
                    },
                ],
            );

            await expect(controller.startup()).rejects.toMatchObject({ status: 503 });
            up = true;
            await expect(controller.startup()).resolves.toMatchObject({ status: 'started' });
        });

        it('latches, so a dependency lost after boot drains traffic instead of restarting the container', async () => {
            let up = true;
            const check: HealthCheck = {
                name: 'database',
                check: (): Promise<void> => (up ? Promise.resolve() : Promise.reject(new Error('connection refused'))),
            };
            const controller = buildController([check], [check]);

            await expect(controller.startup()).resolves.toMatchObject({ status: 'started' });
            up = false;

            // Readiness reacts — that is the recoverable remedy. Startup does not, because its
            // remedy is a kill, and killing a process over a dependency blip is a crash loop.
            await expect(controller.ready()).rejects.toMatchObject({ status: 503 });
            await expect(controller.startup()).resolves.toMatchObject({ status: 'started' });
        });

        it('stops calling the checks once latched', async () => {
            const check = passingCheck('database');
            const spy = jest.spyOn(check, 'check');
            const controller = buildController([], [check]);

            await controller.startup();
            await controller.startup();

            expect(spy).toHaveBeenCalledTimes(1);
        });
    });
});
