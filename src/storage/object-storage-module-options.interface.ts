/**
 * How one service reaches its own object bucket.
 *
 * **A bucket per service, not a shared one**, which is why these are options rather than fixed
 * environment names: `delivery-api` keeps private proof photos and a catalogue keeps public
 * product images, and the two want different access policies on the bucket itself. The wiring is
 * what repeats; the bucket is not.
 */
export interface ObjectStorageModuleOptions {
    /** The bucket objects are written to. A service's own, never shared. */
    bucket: string;

    /**
     * An S3-compatible endpoint, or absent for AWS itself.
     *
     * Setting it also turns on path-style addressing, because every S3-compatible server reached
     * this way expects it and virtual-host style needs DNS nobody runs locally.
     */
    endpoint?: string;

    region?: string;

    /** Absent in AWS, where the task role supplies credentials. Both or neither. */
    accessKeyId?: string;
    secretAccessKey?: string;

    /**
     * How long one request may take.
     *
     * Short on purpose: a caller is usually holding an HTTP request open, and a bucket that has
     * stopped answering should fail a single upload rather than consume the caller's whole budget.
     */
    timeoutMs: number;
}
