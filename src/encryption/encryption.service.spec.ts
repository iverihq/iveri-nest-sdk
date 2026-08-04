import { randomBytes } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import { InternalException } from '../exception/internal.exception';

import { ENVELOPE_SEPARATOR, ENVELOPE_VERSION } from './encryption.constant';
import { EncryptionService, secretsMatch } from './encryption.service';

const buildService = (key: string = randomBytes(32).toString('base64')): EncryptionService =>
    new EncryptionService({ getOrThrow: () => key } as unknown as ConfigService);

describe('EncryptionService', () => {
    it('round-trips a secret', () => {
        const service = buildService();

        expect(service.decrypt(service.encrypt('whsec_abc123'))).toBe('whsec_abc123');
    });

    it('round-trips a value that is not ASCII', () => {
        // Secrets are usually base64, but a channel name or an OAuth token need not be — and a
        // byte-length assumption that only breaks on non-Latin input is the kind that ships.
        const service = buildService();

        expect(service.decrypt(service.encrypt('გამარჯობა 🎉'))).toBe('გამარჯობა 🎉');
    });

    it('produces a different envelope every time', () => {
        // Per-value data keys and a random IV. Identical ciphertext for identical plaintext
        // would leak which two channels share a secret straight out of the table.
        const service = buildService();

        expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
    });

    it('marks the envelope with its format version', () => {
        // The marker is what lets a KMS-wrapped `v2` arrive without a data migration.
        expect(buildService().encrypt('x').split(ENVELOPE_SEPARATOR)[0]).toBe(ENVELOPE_VERSION);
    });

    it('refuses an envelope encrypted under a different master key', () => {
        const envelope = buildService().encrypt('secret');

        expect(() => buildService().decrypt(envelope)).toThrow(InternalException);
    });

    it.each([
        ['not an envelope at all', 'plain-text'],
        ['a wrong version marker', `v9${ENVELOPE_SEPARATOR}a${ENVELOPE_SEPARATOR}b`],
        ['too few fields', `${ENVELOPE_VERSION}${ENVELOPE_SEPARATOR}a${ENVELOPE_SEPARATOR}b`],
    ])('refuses %s', (_name, envelope) => {
        expect(() => buildService().decrypt(envelope)).toThrow(InternalException);
    });

    it('refuses a tampered ciphertext rather than returning garbage', () => {
        // The whole reason for GCM over CBC. A silently-wrong plaintext is worse than a failure:
        // it looks like the provider changed their format.
        const service = buildService();
        const parts = service.encrypt('secret').split(ENVELOPE_SEPARATOR);
        const payload = Buffer.from(parts[5], 'base64');

        payload[0] ^= 0xff;
        parts[5] = payload.toString('base64');

        expect(() => service.decrypt(parts.join(ENVELOPE_SEPARATOR))).toThrow(InternalException);
    });

    it.each([
        ['hex where base64 was expected', randomBytes(32).toString('hex')],
        ['a key of the wrong length', randomBytes(16).toString('base64')],
        ['an empty key', ''],
    ])('refuses to construct with %s', (_name, key) => {
        // At construction, so a bad key fails the boot rather than the first request that
        // happens to touch a secret — by which time it is a 500 on an unrelated route.
        expect(() => buildService(key)).toThrow(/ENCRYPTION_KEY/);
    });
});

describe('secretsMatch', () => {
    it('matches identical secrets', () => {
        expect(secretsMatch('sha256=abc', 'sha256=abc')).toBe(true);
    });

    it.each([
        ['different secrets of equal length', 'aaaa', 'bbbb'],
        ['secrets of different lengths', 'aaaa', 'aaaaa'],
        ['a secret against an empty string', 'aaaa', ''],
    ])('refuses %s', (_name, left, right) => {
        // The length branch matters: `timingSafeEqual` throws on a mismatch rather than
        // returning false, so a missing guard is a 500 on an attacker-controlled input.
        expect(secretsMatch(left, right)).toBe(false);
    });
});
