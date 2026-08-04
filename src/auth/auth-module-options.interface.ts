import type { FactoryProvider, ModuleMetadata } from '@nestjs/common';

/**
 * What a verifying service needs to check an `iveri-identity-api` token.
 *
 * All three are verification inputs and none is a minting input, which is the shape of the whole
 * module: there is no TTL here, no algorithm choice, no key id — a service that could supply
 * those could issue tokens, and then the shared secret stops being a verification key and starts
 * being a minting key in fifteen repos.
 */
export interface AuthModuleOptions {
    /**
     * The shared signing secret. Must match identity's `JWT_SECRET` **exactly**, or every login
     * looks valid there and forged here.
     */
    secret: string;

    /** Expected `iss`. Verified, so a token minted for another environment fails. */
    issuer: string;

    /** Expected `aud`. */
    audience: string;
}

/** Async registration, for reading the values out of `ConfigService`. */
export interface AuthModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    inject?: FactoryProvider['inject'];
    useFactory: (...args: never[]) => AuthModuleOptions | Promise<AuthModuleOptions>;
}
