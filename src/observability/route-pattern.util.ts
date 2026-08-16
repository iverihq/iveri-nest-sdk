import type { Request } from 'express';

/**
 * `route` label and tag used when a request matched no route.
 *
 * This is the cardinality guard on 404s, and on the error-reporting side it is also a privacy
 * one: an unmatched path is chosen entirely by whoever sent the request.
 */
export const UNMATCHED_ROUTE_LABEL = 'unmatched';

/**
 * The route **pattern** Express matched — `/api/v1/captures/:captureId` — prefixed by any
 * router mount point.
 *
 * Used instead of the URL everywhere a request's location leaves the process, by both the
 * metrics middleware and the error reporter. The pattern says *where* a request was; the URL
 * says *which* request it was, and in this fleet that difference is load-bearing:
 * `conduit-api` serves `/ingress/:ingressToken/*path`, so the URL contains the credential that
 * authorises posting to that endpoint.
 *
 * Read defensively rather than through the `any`-typed `Request.route`: an unmatched request
 * has no route at all, and the fallback is what bounds the label.
 */
export const readRoutePattern = (request: Request): string => {
    const route: unknown = request.route;

    if (typeof route !== 'object' || route === null || !('path' in route)) {
        return UNMATCHED_ROUTE_LABEL;
    }

    const { path } = route;

    if (typeof path === 'string') {
        return `${request.baseUrl}${path}`;
    }

    // Express allows an array of paths on one handler. Joining them keeps the value stable for
    // that handler instead of picking whichever entry happened to match.
    if (Array.isArray(path) && path.every((entry) => typeof entry === 'string')) {
        return `${request.baseUrl}${path.join('|')}`;
    }

    // A RegExp route. There is no readable pattern to report and its source string would be a
    // poor label, so it joins the unmatched bucket rather than inventing a name.
    return UNMATCHED_ROUTE_LABEL;
};
