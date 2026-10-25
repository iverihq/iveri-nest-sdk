import { ServiceUnavailableException } from '@nestjs/common';

import type { ObjectStorageModuleOptions } from './object-storage-module-options.interface';
import { ObjectStorageService } from './object-storage.service';

/**
 * The two behaviours that are decisions rather than plumbing.
 *
 * The S3 call itself is not worth mocking in detail — a spec asserting that `PutObjectCommand`
 * was constructed restates the implementation. What matters is how each path answers a caller,
 * because a retention sweep and an upload want opposite things from a failure.
 */
describe('ObjectStorageService', () => {
    const options: ObjectStorageModuleOptions = { bucket: 'images', timeoutMs: 1_000 };

    const serviceWith = (send: jest.Mock): ObjectStorageService => {
        const service = new ObjectStorageService(options);

        // The client is built in the constructor from options; replacing `send` is the narrowest
        // seam that exercises the error handling without standing up a bucket.
        (service as unknown as { client: { send: jest.Mock } }).client = { send };

        return service;
    };

    it('reports a failed upload as unavailable, without the provider’s message', async () => {
        const send = jest.fn().mockRejectedValue(new Error('NoSuchBucket: images/tenant-4f2b/photo.jpg'));

        await expect(
            serviceWith(send).put({ key: 'k', bytes: Buffer.from('x'), contentType: 'image/jpeg' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);

        // The provider's message can name the bucket and the key, and a key is often a tenant's
        // id — so the caller gets the fact rather than the detail.
        await expect(
            serviceWith(send).put({ key: 'k', bytes: Buffer.from('x'), contentType: 'image/jpeg' }),
        ).rejects.toThrow('Object storage is unavailable');
    });

    it('answers false from remove rather than throwing', async () => {
        const send = jest.fn().mockRejectedValue(new Error('timeout'));

        // The caller is a retention sweep: a storage outage must leave the row untouched and be
        // retried next pass. Throwing here would abort a batch that is otherwise fine, and a row
        // marked purged while its object survives is the outcome nobody would ever notice.
        await expect(serviceWith(send).remove('k')).resolves.toBe(false);
    });

    it('answers true when the object is gone', async () => {
        // S3 treats deleting an absent key as success, which is what makes a retried sweep
        // idempotent rather than needing to check first.
        await expect(serviceWith(jest.fn().mockResolvedValue({})).remove('k')).resolves.toBe(true);
    });

    it('sends the caller’s content type and cache control', async () => {
        const send = jest.fn().mockResolvedValue({});

        await serviceWith(send).put({
            key: 'products/1.webp',
            bytes: Buffer.from('x'),
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable',
        });

        // Not hardcoded to JPEG, unlike the implementation this was extracted from: a product
        // image keeps its own format, and a storefront wants it cacheable.
        const input = (send.mock.calls[0][0] as { input: Record<string, unknown> }).input;

        expect(input.ContentType).toBe('image/webp');
        expect(input.CacheControl).toBe('public, max-age=31536000, immutable');
        expect(input.ServerSideEncryption).toBe('AES256');
    });
});
