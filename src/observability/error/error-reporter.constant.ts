import { HeaderKey } from '../../constant/header-key.constant';

/** Injection token for the resolved {@link ErrorReporterModuleOptions}. */
export const ERROR_REPORTER_MODULE_OPTIONS = Symbol('ERROR_REPORTER_MODULE_OPTIONS');

/** Value substituted for anything scrubbed, chosen to be obvious in a stack trace. */
export const REDACTED_PLACEHOLDER = '[redacted]';

/**
 * The only request headers forwarded to the error tracker.
 *
 * **An allowlist, not a deny-list**, and the direction is the whole point. A deny-list fails
 * open on the header nobody thought of, and the set of headers carrying secrets is not fixed:
 * every provider Conduit integrates invents its own signature header, and the next one is by
 * definition not on a list written today. These five are diagnostic and carry nothing a
 * customer would mind us storing.
 */
export const REPORTABLE_HEADER_NAMES: readonly string[] = [
    'accept',
    'content-length',
    'content-type',
    HeaderKey.CORRELATION_ID,
    HeaderKey.USER_AGENT,
];

/**
 * Property names whose **values** are replaced wherever they appear in structured context.
 *
 * Matched case-insensitively against the key, as a substring, so `refreshToken`,
 * `X-Hub-Signature-256` and `encryptionKeyWrapped` are all caught without being enumerated.
 * Deliberately broad: a false positive costs one redacted field in a stack trace, and a false
 * negative puts a customer's Meta token in a third party's database.
 */
export const SENSITIVE_KEY_PATTERN =
    /pass|secret|token|credential|authorization|api[-_]?key|signature|cookie|session|private|encrypt|salt|hash|dsn/iu;

/**
 * How deep the scrubber walks a structure.
 *
 * Bounded because the input is arbitrary: a deeply nested or cyclic object attached as context
 * would otherwise stall the process inside a handler that is already dealing with an error.
 * Anything past this depth is dropped rather than passed through — the alternative is emitting
 * a subtree nothing has inspected.
 */
export const MAX_SCRUB_DEPTH = 6;

/**
 * Milliseconds allowed for in-flight events to reach the tracker during shutdown.
 *
 * Short on purpose. A container that has been told to stop is already draining, and holding it
 * open to deliver a crash report risks the orchestrator escalating to SIGKILL — which loses the
 * events anyway, and the graceful database shutdown along with them.
 */
export const ERROR_REPORTER_FLUSH_TIMEOUT_MS = 2000;
