/** Injection token for {@link LicenceModuleOptions}. */
export const LICENCE_MODULE_OPTIONS = Symbol('LICENCE_MODULE_OPTIONS');

/** Injection token for the operator workspace's own `ServiceTokenService`, private to the licence module. */
export const LICENCE_SERVICE_TOKEN = Symbol('LICENCE_SERVICE_TOKEN');

/** Metadata key set by `@SkipLicence()`. */
export const SKIP_LICENCE_KEY = 'iveri:skip-licence';
