import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/require-permission.decorator';

/**
 * Anything that can resolve Nest's module container: an `INestApplication`, or a `TestingModule`.
 *
 * Structural rather than `INestApplication` so a spec can read routes without booting an HTTP
 * adapter — the container is all this needs, and requiring a platform package to enumerate
 * metadata would make the helper harder to use than the thing it replaces.
 */
export interface ModuleContainerSource {
    get(typeOrToken: typeof ModulesContainer): ModulesContainer;
}

/** Metadata is `any` at the reflection boundary; narrowing it once keeps that out of the loop. */
const read = <T>(key: string, target: object): T | undefined => Reflect.getMetadata(key, target) as T | undefined;

/** One route a service registers, with the authorization it declares. */
export interface RegisteredRoute {
    /** `POST /jobs/:jobId/confirm` — the controller prefix and handler path, not a URL. */
    signature: string;
    isPublic: boolean;
    permissions: string[];
}

/**
 * Every route an application registers, read from Nest's own metadata.
 *
 * For the authorization-matrix spec each service is expected to carry: assert that no route is
 * reachable without either a permission or `@Public()`, pin which permission opens each one, and
 * pin the set that answers without a credential.
 *
 * **Derived rather than listed, which is the whole value.** A hand-written list of routes is a
 * list somebody must remember to extend, and the route that gets forgotten is the one added in a
 * hurry without a guard — exactly the one a matrix exists to catch.
 *
 * **Reads the `ModulesContainer`, not `DiscoveryService`.** The latter needs `DiscoveryModule`
 * imported into the application, and production wiring changed to satisfy a test is production
 * wiring the test is no longer checking.
 *
 * A spec using this should also assert the list is non-empty. A change to Nest's metadata keys
 * that silently yielded nothing would make every other assertion vacuous, and a suite that
 * polices nothing passes.
 */
export const registeredRoutes = (app: ModuleContainerSource): RegisteredRoute[] => {
    const scanner = new MetadataScanner();
    const routes: RegisteredRoute[] = [];

    for (const module of app.get(ModulesContainer).values()) {
        for (const wrapper of module.controllers.values()) {
            const controller = wrapper.metatype;
            if (!controller) continue;
            const prefix = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';

            const prototype = controller.prototype as object;

            for (const method of scanner.getAllMethodNames(prototype)) {
                // Typed as possibly absent because it is: the scanner walks names, and a getter
                // or a renamed member can leave one with nothing behind it.
                const handler = (prototype as Record<string, object | undefined>)[method];
                if (!handler) continue;
                const path = read<string>(PATH_METADATA, handler);
                if (path === undefined) continue;
                const verb = read<RequestMethod>(METHOD_METADATA, handler) ?? RequestMethod.GET;

                routes.push({
                    signature: `${RequestMethod[verb]} /${prefix}/${path}`.replace(/\/+/g, '/').replace(/\/$/, ''),
                    isPublic:
                        read<boolean>(IS_PUBLIC_KEY, handler) === true ||
                        read<boolean>(IS_PUBLIC_KEY, controller) === true,
                    permissions: [
                        ...(read<string[]>(REQUIRED_PERMISSIONS_KEY, handler) ?? []),
                        ...(read<string[]>(REQUIRED_PERMISSIONS_KEY, controller) ?? []),
                    ],
                });
            }
        }
    }

    return routes;
};

/** Routes with neither a permission nor `@Public()`, which is the list that must stay empty. */
export const undeclaredRoutes = (routes: RegisteredRoute[]): string[] =>
    routes.filter((route) => !route.isPublic && route.permissions.length === 0).map((route) => route.signature);

/** `signature → permissions`, for pinning the matrix. Public routes are excluded. */
export const permissionMatrix = (routes: RegisteredRoute[]): Record<string, string> =>
    Object.fromEntries(
        routes.filter((route) => !route.isPublic).map((route) => [route.signature, route.permissions.sort().join('+')]),
    );
