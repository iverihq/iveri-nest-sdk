import { RequestMethod } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';

/** Base path the probes are mounted on. */
export const HEALTH_ROUTE_PATH = 'health';

/** Liveness probe path — process only, never a dependency. */
export const HEALTH_LIVENESS_ROUTE = `${HEALTH_ROUTE_PATH}/live`;

/** Readiness probe path — the traffic gate. */
export const HEALTH_READINESS_ROUTE = `${HEALTH_ROUTE_PATH}/ready`;

/** Startup probe path — boot validation. */
export const HEALTH_STARTUP_ROUTE = `${HEALTH_ROUTE_PATH}/startup`;

/**
 * Every probe route, for `setGlobalPrefix`'s `exclude`.
 *
 * Services spread this rather than listing paths themselves. Listing them by hand is how a
 * probe added to the SDK ends up served from `/api/health/...` in one service and `/health/...`
 * in the next — and the failure is silent, because a 404 from a probe URL nobody has configured
 * yet looks exactly like a probe URL that does not exist.
 *
 * ```ts
 * app.setGlobalPrefix('api', { exclude: [...HEALTH_ROUTE_EXCLUSIONS] });
 * ```
 */
export const HEALTH_ROUTE_EXCLUSIONS: readonly RouteInfo[] = [
    { path: HEALTH_LIVENESS_ROUTE, method: RequestMethod.GET },
    { path: HEALTH_READINESS_ROUTE, method: RequestMethod.GET },
    { path: HEALTH_STARTUP_ROUTE, method: RequestMethod.GET },
];
