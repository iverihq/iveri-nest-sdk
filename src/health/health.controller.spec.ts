import { VERSION_NEUTRAL } from '@nestjs/common';
import { CONTROLLER_WATERMARK, HOST_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';

import { IS_PUBLIC_KEY } from '../auth/public.decorator';

import { HealthController } from './health.controller';
import type { ReadinessCheck } from './readiness-check.interface';

const buildController = (checks: ReadinessCheck[]): HealthController => new HealthController(checks);

const passingCheck = (name: string): ReadinessCheck => ({
    name,
    check: (): Promise<void> => Promise.resolve(),
});

const failingCheck = (name: string, message: string): ReadinessCheck => ({
    name,
    check: (): Promise<void> => Promise.reject(new Error(message)),
});

describe('HealthController', () => {
    describe('routing metadata', () => {
        // These three assertions guard operational contracts, not code paths — each one broke
        // in a real service before it was pinned here.
        it('is registered under /health', () => {
            expect(Reflect.getMetadata(CONTROLLER_WATERMARK, HealthController)).toBe(true);
            expect(Reflect.getMetadata(PATH_METADATA, HealthController)).toBe('health');
            expect(Reflect.getMetadata(HOST_METADATA, HealthController)).toBeUndefined();
        });

        it('is version-neutral, so URI versioning never moves the probe URL to /v1/health', () => {
            expect(Reflect.getMetadata(VERSION_METADATA, HealthController)).toBe(VERSION_NEUTRAL);
        });

        it('is public, so a global AuthGuard cannot 401 a load balancer that has no credentials', () => {
            expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
        });

        it('is tagged Health for OpenAPI, so services with only probes still have usable docs', () => {
            expect(Reflect.getMetadata('swagger/apiUseTags', HealthController)).toEqual(['Health']);
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
    });
});
