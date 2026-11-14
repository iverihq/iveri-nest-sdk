import { type CustomDecorator, SetMetadata } from '@nestjs/common';

import { SKIP_LICENCE_KEY } from './licence.constant.js';

/**
 * Exempts a signed-in route from `LicenceGuard`. Only for routes Iveri's own staff call across companies — the
 * backoffice — whose caller is Iveri's operator workspace, a workspace that holds no product licence and is not a
 * customer of the product.
 */
export const SkipLicence = (): CustomDecorator => SetMetadata(SKIP_LICENCE_KEY, true);
