import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InternalException } from '../exception/internal.exception';

import {
    ENCRYPTION_ALGORITHM,
    ENCRYPTION_AUTH_TAG_BYTES,
    ENCRYPTION_IV_BYTES,
    ENCRYPTION_KEY_BYTES,
    ENVELOPE_SEPARATOR,
    ENVELOPE_VERSION,
} from './encryption.constant';

/** Number of base64 fields in a serialized envelope, after the version marker. */
const ENVELOPE_FIELD_COUNT = 5;

/**
 * Envelope encryption for secrets a service holds on its customers' behalf.
 *
 * §11 forbids a plaintext column for anything a customer would call a credential, and across the
 * fleet that is: Conduit's provider signing secrets and its customers' third-party OAuth
 * credentials, and Unibox's channel ingest secrets. One leak ends the company.
 *
 * Reads `ENCRYPTION_KEY` from `ConfigService` — 32 base64-encoded bytes, no default, validated at
 * construction so a bad key fails the boot rather than the first request that touches a secret.
 * The consuming service declares it on its own env config, where the `@IsNotEmpty()` and the
 * documentation belong.
 *
 * **Envelope, not direct encryption.** Every value gets its own random data key; the data key
 * is what the master key wraps. Encrypting values directly with the master key would be
 * simpler and is the thing to avoid: rotating the master would then mean decrypting and
 * re-encrypting every row, and a single key would encrypt unbounded data under one nonce
 * space. With an envelope, rotation rewrites only the wrapped keys, and replacing
 * {@link wrapDataKey}/{@link unwrapDataKey} with a KMS call is a one-class change — which is
 * the reason to structure it this way now rather than when we deploy.
 *
 * The serialized form is:
 *
 * ```
 * v1.<wrapIv>.<wrappedKey>.<wrapTag>.<iv>.<ciphertext+tag>
 * ```
 *
 * all base64, which never emits `.` — so parsing is a total function on a string split.
 */
@Injectable()
export class EncryptionService {
    private readonly masterKey: Buffer;

    constructor(configService: ConfigService) {
        this.masterKey = EncryptionService.readMasterKey(configService);
    }

    /**
     * Encrypts a secret for storage.
     *
     * @returns the serialized envelope. Safe to log only in the sense that it is unreadable
     * without the master key — it is still a secret and belongs in no log line.
     */
    encrypt(plaintext: string): string {
        const dataKey = randomBytes(ENCRYPTION_KEY_BYTES);
        const iv = randomBytes(ENCRYPTION_IV_BYTES);

        const cipher = createCipheriv(ENCRYPTION_ALGORITHM, dataKey, iv, {
            authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
        });
        const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);

        const wrapped = this.wrapDataKey(dataKey);

        // The data key exists in this process for the length of one call and is zeroed rather
        // than left for the garbage collector. Not a strong guarantee — V8 may have copied the
        // buffer already — but it shortens the window in which a core dump contains it.
        dataKey.fill(0);

        return [
            ENVELOPE_VERSION,
            wrapped.iv.toString('base64'),
            wrapped.key.toString('base64'),
            wrapped.authTag.toString('base64'),
            iv.toString('base64'),
            ciphertext.toString('base64'),
        ].join(ENVELOPE_SEPARATOR);
    }

    /**
     * Decrypts a stored envelope.
     *
     * @throws {@link InternalException} when the envelope is malformed or fails
     * authentication. Both mean the same operationally — the value is unrecoverable — and
     * neither is the caller's fault, so they are not distinguished on the wire. A wrong master
     * key surfaces here, which is why the message says so.
     */
    decrypt(envelope: string): string {
        const parts = envelope.split(ENVELOPE_SEPARATOR);

        if (parts[0] !== ENVELOPE_VERSION || parts.length !== ENVELOPE_FIELD_COUNT + 1) {
            throw new InternalException('Stored secret is not a recognised encryption envelope');
        }

        const [, wrapIv, wrappedKey, wrapTag, iv, payload] = parts;

        const dataKey = this.unwrapDataKey({
            iv: Buffer.from(wrapIv, 'base64'),
            key: Buffer.from(wrappedKey, 'base64'),
            authTag: Buffer.from(wrapTag, 'base64'),
        });

        try {
            const ciphertextWithTag = Buffer.from(payload, 'base64');
            const boundary = ciphertextWithTag.length - ENCRYPTION_AUTH_TAG_BYTES;

            if (boundary < 0) {
                throw new InternalException('Stored secret is truncated');
            }

            const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, dataKey, Buffer.from(iv, 'base64'), {
                authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
            });

            decipher.setAuthTag(ciphertextWithTag.subarray(boundary));

            return Buffer.concat([decipher.update(ciphertextWithTag.subarray(0, boundary)), decipher.final()]).toString(
                'utf8',
            );
        } catch (error: unknown) {
            if (error instanceof InternalException) {
                throw error;
            }

            throw new InternalException('Stored secret could not be decrypted — ENCRYPTION_KEY may have changed');
        } finally {
            dataKey.fill(0);
        }
    }

    /**
     * Wraps a data key with the master key.
     *
     * **This is the KMS seam.** Replacing the body with `kms.encrypt({ KeyId, Plaintext })`,
     * and {@link unwrapDataKey} with the matching decrypt, moves the whole service onto managed
     * keys without touching a stored row or any caller.
     */
    private wrapDataKey(dataKey: Buffer): { iv: Buffer; key: Buffer; authTag: Buffer } {
        const iv = randomBytes(ENCRYPTION_IV_BYTES);
        const cipher = createCipheriv(ENCRYPTION_ALGORITHM, this.masterKey, iv, {
            authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
        });

        const key = Buffer.concat([cipher.update(dataKey), cipher.final()]);

        return { iv, key, authTag: cipher.getAuthTag() };
    }

    private unwrapDataKey(wrapped: { iv: Buffer; key: Buffer; authTag: Buffer }): Buffer {
        try {
            const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, this.masterKey, wrapped.iv, {
                authTagLength: ENCRYPTION_AUTH_TAG_BYTES,
            });

            decipher.setAuthTag(wrapped.authTag);

            return Buffer.concat([decipher.update(wrapped.key), decipher.final()]);
        } catch {
            throw new InternalException('Stored secret could not be decrypted — ENCRYPTION_KEY may have changed');
        }
    }

    /**
     * Decodes and length-checks `ENCRYPTION_KEY` at construction, so a bad key fails the boot
     * rather than the first request that happens to touch a secret.
     *
     * Base64 is validated by round-tripping rather than by a regexp: Node's decoder silently
     * skips characters outside the alphabet, so `openssl rand -hex 32` pasted by mistake
     * decodes to *something* of the wrong length, and only re-encoding catches input that
     * decoded to the right length from the wrong bytes.
     */
    private static readMasterKey(configService: ConfigService): Buffer {
        const encoded = configService.getOrThrow<string>('ENCRYPTION_KEY');
        const key = Buffer.from(encoded, 'base64');

        if (key.length !== ENCRYPTION_KEY_BYTES || key.toString('base64') !== encoded) {
            throw new Error(
                `ENCRYPTION_KEY must be exactly ${ENCRYPTION_KEY_BYTES} base64-encoded bytes. Generate one with: openssl rand -base64 ${ENCRYPTION_KEY_BYTES}`,
            );
        }

        return key;
    }
}

/**
 * Constant-time comparison of two secrets.
 *
 * Lives beside the encryption service because it guards the same class of value. `===` on a
 * signature or a verify token leaks its prefix through timing: the comparison stops at the
 * first differing byte, so an attacker can recover the expected value one byte at a time.
 *
 * Lengths are compared first and non-secretly — `timingSafeEqual` throws on a length mismatch,
 * and a signature's length is public anyway (it is a hash of known width).
 */
export const secretsMatch = (left: string, right: string): boolean => {
    const leftBytes = Buffer.from(left, 'utf8');
    const rightBytes = Buffer.from(right, 'utf8');

    if (leftBytes.length !== rightBytes.length) {
        return false;
    }

    return timingSafeEqual(leftBytes, rightBytes);
};
