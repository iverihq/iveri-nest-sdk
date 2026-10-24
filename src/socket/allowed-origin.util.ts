import type { IncomingMessage } from 'node:http';

import { Logger } from '@nestjs/common';

/**
 * Whether a socket handshake from `origin` may proceed.
 *
 * **A websocket upgrade is not subject to CORS**, so a browser enforces nothing on it and the
 * origin list a service passes to `enableCors` protects only its HTTP routes. Without a check on
 * the handshake itself, any page on the internet can open a socket to the gateway.
 *
 * That is not exploitable while a client authenticates by presenting a bearer token it had to
 * obtain itself, because a foreign page cannot read the victim's. It becomes cross-site WebSocket
 * hijacking the moment a gateway authenticates from an ambient credential such as a cookie —
 * which is a change nobody would expect to require an origin review, so the check belongs in
 * before that day rather than after it.
 *
 * **An absent origin is allowed.** A browser always sends one on a handshake, so no origin means
 * a native app, another service or a test client — none of which CORS was ever a defence for, and
 * all of which legitimately connect to these gateways. Refusing them would take a mobile app
 * offline while stopping nothing.
 *
 * **An empty list allows everything**, matching what `enableCors` does when `CORS_ORIGINS` is
 * unset. One rule for both surfaces is worth more than a stricter default that is true of only
 * one of them — and a gateway whose socket refused everything while its HTTP routes accepted
 * everything would be read as a bug in the socket.
 */
export function isAllowedSocketOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
    if (allowedOrigins.length === 0) return true;
    if (!origin) return true;

    return allowedOrigins.includes(origin);
}

/** The shape Socket.IO's `allowRequest` option takes, declared without depending on socket.io. */
export type SocketAllowRequest = (
    request: IncomingMessage,
    callback: (error: string | null | undefined, allowed: boolean) => void,
) => void;

/**
 * Builds the `allowRequest` callback that enforces `allowedOrigins` on a Socket.IO handshake.
 *
 * `allowRequest` is the enforcement point, and the `cors` option is not: that one only sets
 * response headers, and nothing reads them on an upgrade. Getting this wiring wrong is silent in
 * both directions — too loose and every origin connects, too strict and native clients vanish —
 * so it ships with the predicate rather than being rewritten per gateway.
 */
export function socketOriginAllowRequest(allowedOrigins: readonly string[], logger?: Logger): SocketAllowRequest {
    return (request, callback) => {
        const origin = request.headers.origin;
        if (isAllowedSocketOrigin(origin, allowedOrigins)) {
            callback(null, true);

            return;
        }

        logger?.warn({ message: 'Refused a socket handshake from a foreign origin', origin });
        callback('Origin not allowed', false);
    };
}
