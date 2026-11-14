import type { UUID } from '@iveri/contracts';
import {
    LICENCE_INACTIVE_REASON,
    type LicenceInactiveDetails,
    type ProductLicenceCheck,
} from '@iveri/contracts/platform';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ForbiddenActionException } from '../exception/index.js';

import { BillingLicenceClient } from './billing-licence.client.js';
import type { LicenceModuleOptions } from './licence-module-options.interface.js';
import { LICENCE_MODULE_OPTIONS } from './licence.constant.js';

/** How long an answer billing could not give is remembered, so an outage is not asked about on every request. */
const UNKNOWN_SECONDS = 10;

interface Remembered {
    check: ProductLicenceCheck | null;
    until: number;
}

/**
 * Whether a company may use the configured product, as `iveri-billing-api` says.
 *
 * **It fails open.** When billing cannot be asked, the company keeps working and a warning is logged: locking out a
 * company that has paid because billing blinked is worse than a few minutes of use past a licence's end. The answer
 * is remembered per replica for `cacheSeconds`, so a renewal or a suspension in the backoffice takes up to that long
 * to reach every request.
 *
 * Options are read on every call rather than copied at construction, so a test can switch the check on or change the
 * cache window between two requests.
 */
@Injectable()
export class LicenceService {
    private readonly logger = new Logger(LicenceService.name);
    private readonly remembered = new Map<UUID, Remembered>();

    constructor(
        @Inject(LICENCE_MODULE_OPTIONS) private readonly options: LicenceModuleOptions,
        private readonly client: BillingLicenceClient,
    ) {}

    isEnabled(): boolean {
        return this.options.isEnabled;
    }

    /** False only when billing said the licence is not live. Unknown, or the check switched off, is true. */
    async isActive(tenantId: UUID): Promise<boolean> {
        const check = await this.check(tenantId);

        return check?.isActive !== false;
    }

    /** Refuses the whole product for a company whose licence billing says is not live. */
    async assertActive(tenantId: UUID): Promise<void> {
        if (!(await this.isActive(tenantId))) {
            throw new ForbiddenActionException(`Your company’s ${this.options.product} licence is not active`, {
                reason: LICENCE_INACTIVE_REASON,
                product: this.options.product,
            } satisfies LicenceInactiveDetails);
        }
    }

    /**
     * The remembered answer about a company, for a product that counts its own seats against `seats`. `null` means
     * unknown or the check switched off, and a product treats that as no limit, the same way it fails open on
     * `isActive`.
     */
    async check(tenantId: UUID): Promise<ProductLicenceCheck | null> {
        if (!this.isEnabled()) return null;

        const now = Date.now();
        const known = this.remembered.get(tenantId);

        if (known !== undefined && known.until > now) return known.check;

        const check = await this.client.check(tenantId);
        const { cacheSeconds } = this.options;
        // An unknown is never remembered longer than a known answer would be.
        const seconds = check === null ? Math.min(UNKNOWN_SECONDS, cacheSeconds) : cacheSeconds;

        if (check === null) {
            this.logger.warn(
                `Could not learn company ${tenantId}'s ${this.options.product} licence; letting it through`,
            );
        }

        this.remembered.set(tenantId, { check, until: now + seconds * 1_000 });

        return check;
    }
}
