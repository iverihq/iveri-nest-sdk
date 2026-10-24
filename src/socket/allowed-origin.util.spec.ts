import type { IncomingMessage } from 'node:http';

import { isAllowedSocketOrigin, socketOriginAllowRequest } from './allowed-origin.util';

const ALLOWED = ['http://localhost:5177', 'http://localhost:5179'];

const handshake = (origin?: string): IncomingMessage =>
    ({ headers: origin === undefined ? {} : { origin } }) as IncomingMessage;

describe('isAllowedSocketOrigin', () => {
    it('allows a configured origin', () => {
        expect(isAllowedSocketOrigin('http://localhost:5177', ALLOWED)).toBe(true);
    });

    it('refuses an origin that is not configured', () => {
        expect(isAllowedSocketOrigin('http://evil.example.com', ALLOWED)).toBe(false);
    });

    it('refuses a near miss rather than matching by prefix or suffix', () => {
        expect(isAllowedSocketOrigin('http://localhost:51779', ALLOWED)).toBe(false);
        expect(isAllowedSocketOrigin('http://localhost:5177.evil.example.com', ALLOWED)).toBe(false);
        expect(isAllowedSocketOrigin('https://localhost:5177', ALLOWED)).toBe(false);
    });

    it('allows a handshake that carries no origin', () => {
        // A browser always sends one, so its absence is a native app or another service.
        expect(isAllowedSocketOrigin(undefined, ALLOWED)).toBe(true);
        expect(isAllowedSocketOrigin('', ALLOWED)).toBe(true);
    });

    it('allows everything when no origin is configured', () => {
        expect(isAllowedSocketOrigin('http://evil.example.com', [])).toBe(true);
    });
});

describe('socketOriginAllowRequest', () => {
    it('passes an allowed handshake with no error', () => {
        const allowRequest = socketOriginAllowRequest(ALLOWED);
        const callback = jest.fn();

        allowRequest(handshake('http://localhost:5179'), callback);

        expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('refuses a foreign handshake with a reason', () => {
        const allowRequest = socketOriginAllowRequest(ALLOWED);
        const callback = jest.fn();

        allowRequest(handshake('http://evil.example.com'), callback);

        expect(callback).toHaveBeenCalledWith('Origin not allowed', false);
    });

    it('passes a handshake with no origin header', () => {
        const allowRequest = socketOriginAllowRequest(ALLOWED);
        const callback = jest.fn();

        allowRequest(handshake(), callback);

        expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('never throws when no logger was supplied', () => {
        // The refusal path is the one that logs, so it is the one that would throw on an
        // optional-call mistake — and it would throw inside a handshake nobody is watching.
        const allowRequest = socketOriginAllowRequest(ALLOWED);

        expect(() => allowRequest(handshake('http://evil.example.com'), jest.fn())).not.toThrow();
    });
});
