import { SetMetadata } from '@nestjs/common';

/** Metadata key an `AuthGuard` reads to decide whether a route is exempt from authentication. */
export const IS_PUBLIC_KEY = 'iveri:isPublic';

/**
 * Exempts a route (or a whole controller) from the service's `AuthGuard`.
 *
 * The guard is registered globally in every Iveri service, so **authentication is the default
 * and exposure is the explicit act**. The inverse — opt-in guards — is how endpoints ship
 * unprotected: forgetting a decorator then fails open, silently, and only on the one route
 * nobody re-reviewed.
 *
 * The decorator lives here rather than in each service because the SDK's own
 * `HealthController` has to carry it: a load balancer has no credentials, so a health probe
 * behind a global guard takes the whole service out of rotation.
 *
 * A guard consuming this reads {@link IS_PUBLIC_KEY} with `getAllAndOverride`, widening the
 * generic with `| undefined` — the reflector is typed as returning `T` but yields `undefined`
 * for a route carrying no metadata, which is most of them.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
