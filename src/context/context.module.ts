import { Global, Module } from '@nestjs/common';

import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { CorrelationIdService } from './correlation-id.service';

/**
 * Provides the correlation plumbing.
 *
 * `@Global()` because the correlation id is genuinely ambient: a repository, a processor and
 * an exception filter all need it, and threading an import of this module through every
 * feature module would be noise with no benefit.
 *
 * Importing the module registers the providers; the middleware still has to be applied in
 * `AppModule` — see {@link CorrelationIdMiddleware}.
 */
@Global()
@Module({
    providers: [CorrelationIdService, CorrelationIdMiddleware],
    exports: [CorrelationIdService, CorrelationIdMiddleware],
})
export class ContextModule {}
