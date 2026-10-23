import { Controller, Get, Post } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';

import { Public } from '../auth/public.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';

import { permissionMatrix, registeredRoutes, undeclaredRoutes } from './registered-route';

@Controller('things')
class ThingController {
    @RequirePermission('thing:read' as never)
    @Get()
    list(): string {
        return 'listed';
    }

    @RequirePermission('thing:write' as never, 'thing:read' as never)
    @Post(':thingId/archive')
    archive(): string {
        return 'archived';
    }

    @Public()
    @Get('health')
    health(): string {
        return 'ok';
    }

    /** Deliberately unguarded, which is the thing the matrix exists to find. */
    @Get('forgotten')
    forgotten(): string {
        return 'open';
    }
}

describe('registeredRoutes', () => {
    let app: TestingModule;

    beforeAll(async () => {
        // No HTTP adapter: the container holds the metadata, so enumerating routes never needed
        // a listening application — which is also what keeps this usable from a unit spec.
        app = await Test.createTestingModule({ controllers: [ThingController] }).compile();
    });

    afterAll(async () => {
        await app.close();
    });

    it('reads every route from the module container', () => {
        expect(
            registeredRoutes(app)
                .map((route) => route.signature)
                .sort(),
        ).toEqual(['GET /things', 'GET /things/forgotten', 'GET /things/health', 'POST /things/:thingId/archive']);
    });

    it('needs no DiscoveryModule in the application under test', () => {
        // Production wiring changed to satisfy a test is wiring the test no longer checks.
        expect(() => app.get(ModulesContainer)).not.toThrow();
    });

    it('finds the route that declares no authorization at all', () => {
        expect(undeclaredRoutes(registeredRoutes(app))).toEqual(['GET /things/forgotten']);
    });

    it('does not count a public route as undeclared', () => {
        expect(undeclaredRoutes(registeredRoutes(app))).not.toContain('GET /things/health');
    });

    it('pins permissions per route, sorted so the map is stable, and omits public routes', () => {
        expect(permissionMatrix(registeredRoutes(app))).toEqual({
            'GET /things': 'thing:read',
            'GET /things/forgotten': '',
            'POST /things/:thingId/archive': 'thing:read+thing:write',
        });
    });
});
