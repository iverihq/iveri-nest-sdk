/**
 * AES-256-GCM everywhere: authenticated encryption, so a tampered ciphertext fails to decrypt
 * rather than yielding plausible garbage. A signing secret that silently decrypted to the wrong
 * bytes would present as "the provider changed their signature format" — a failure that sends
 * somebody to debug a third party over a corrupted row of ours.
 */
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/** AES-256 key length. Applies to both the master key and every per-row data key. */
export const ENCRYPTION_KEY_BYTES = 32;

/**
 * GCM nonce length.
 *
 * 12 bytes is the only size NIST SP 800-38D recommends: it is used directly as the counter
 * block, while any other length is hashed first — slower, and outside the analysed parameter
 * set.
 */
export const ENCRYPTION_IV_BYTES = 12;

/** GCM authentication tag length. 16 bytes is the maximum and the only one worth using. */
export const ENCRYPTION_AUTH_TAG_BYTES = 16;

/**
 * Format marker on every stored ciphertext.
 *
 * Present so the wrapping scheme can change without a data migration: a future `v2` wrapped by
 * KMS is recognised by its prefix, and `v1` rows keep decrypting through the old path until
 * they are rewritten. Without a version marker, swapping the wrapper means rewriting every row
 * in one transaction and hoping nothing was written meanwhile.
 */
export const ENVELOPE_VERSION = 'v1';

/** Field separator inside the serialized envelope. Base64 never emits it, so parsing is total. */
export const ENVELOPE_SEPARATOR = '.';
