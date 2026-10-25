import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import type { ObjectStorageModuleOptions } from './object-storage-module-options.interface';
import { OBJECT_STORAGE_MODULE_OPTIONS } from './object-storage.constant';

/**
 * Writes and removes objects in one service's own bucket.
 *
 * Extracted from `delivery-api`'s proof-photo storage when `commerce-api` became the second
 * consumer — the S3 wiring is identical between them, and a third copy is where this fleet has
 * historically regretted waiting.
 *
 * **What is deliberately not here: anything about the bytes.** `delivery-api` forces every proof
 * photo to JPEG because uniform evidence is the point, while a product image wants its own
 * format and transparency kept. Those are different policies over the same library, so each
 * service owns its own — extracting one of them now would mean designing against a real
 * implementation and a guess, which is the mistake the outbox extraction avoided by waiting.
 *
 * There is also no `publicUrl` helper. A public address depends on a CDN domain the bucket does
 * not know about, and only one of the two consumers needs one.
 */
@Injectable()
export class ObjectStorageService {
    private readonly client: S3Client;

    constructor(@Inject(OBJECT_STORAGE_MODULE_OPTIONS) private readonly options: ObjectStorageModuleOptions) {
        this.client = new S3Client({
            region: options.region ?? 'us-east-1',
            endpoint: options.endpoint,
            // Every S3-compatible server reached by an explicit endpoint expects path style, and
            // virtual-host style needs DNS nobody runs locally.
            forcePathStyle: Boolean(options.endpoint),
            credentials:
                options.accessKeyId && options.secretAccessKey
                    ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
                    : undefined,
        });
    }

    /**
     * Stores one object, overwriting any object already at that key.
     *
     * Encrypted at rest with SSE-S3, which is transparent to a reader and costs nothing — so it
     * applies to a public product image as readily as to a private proof photo, and nobody has to
     * decide per bucket.
     */
    async put(dto: { key: string; bytes: Buffer; contentType: string; cacheControl?: string }): Promise<void> {
        try {
            await this.client.send(
                new PutObjectCommand({
                    Bucket: this.options.bucket,
                    Key: dto.key,
                    Body: dto.bytes,
                    ContentType: dto.contentType,
                    CacheControl: dto.cacheControl,
                    ServerSideEncryption: 'AES256',
                }),
                { abortSignal: AbortSignal.timeout(this.options.timeoutMs) },
            );
        } catch {
            // The provider's message can name the bucket and the key, and a key is often a
            // tenant's id — so the caller gets the fact rather than the detail.
            throw new ServiceUnavailableException('Object storage is unavailable');
        }
    }

    /**
     * Removes one object, and **reports whether it is gone rather than throwing**.
     *
     * The caller is typically a retention sweep, where a storage outage must leave the row
     * untouched and be retried on the next pass: a row marked purged while its object survives is
     * the one outcome nobody would ever notice. S3 treats deleting an absent key as success,
     * which is what makes a retried sweep idempotent.
     */
    async remove(key: string): Promise<boolean> {
        try {
            await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }), {
                abortSignal: AbortSignal.timeout(this.options.timeoutMs),
            });

            return true;
        } catch {
            return false;
        }
    }
}
