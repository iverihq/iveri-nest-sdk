/**
 * HTTP header names used across Iveri services.
 *
 * HTTP header names are case-insensitive, and Node lowercases every inbound one — always
 * store and compare them in lowercase so behaviour is deterministic regardless of what a
 * client sent.
 */
export enum HeaderKey {
    /** Ties every log line, outbound call and delivered webhook to one originating request. */
    CORRELATION_ID = 'x-correlation-id',

    /** Caller-supplied de-duplication key. At-least-once delivery makes this the receiver's defence. */
    IDEMPOTENCY_KEY = 'x-idempotency-key',

    /** Service-to-service API key, issued by iveri-identity-api. */
    API_KEY = 'x-api-key',

    AUTHORIZATION = 'authorization',
    ACCEPT_LANGUAGE = 'accept-language',
    USER_AGENT = 'user-agent',
    X_FORWARDED_FOR = 'x-forwarded-for',
}
