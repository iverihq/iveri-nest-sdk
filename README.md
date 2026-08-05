# @iveri/nest-sdk

The NestJS plumbing every Iveri service shares: request context, authentication and
authorization, typed exceptions, tenant-scoped persistence, config validation, health endpoints,
Redis and rate limiting.

Release `0.13.0` splits the health endpoint into the three orchestrator probes — `/health/live`,
`/health/ready` and `/health/startup` — and **removes the bare `GET /health`**. Consumers exclude
the probes from their global prefix with `HEALTH_ROUTE_EXCLUSIONS`, and the `ReadinessCheck`
interface is now `HealthCheck`, since the same check can gate readiness, startup or both.

Release `0.10.0` aligns the SDK with `@iveri/contracts` `0.14.x`, including the messaging permission
catalogue. Release `0.9.0` aligned the SDK with `@iveri/contracts` `0.13.x`, including the billing invoice permission
catalogue alongside the tenant-scoped MCP
registry permission contract used by `unibox-ai`.

```bash
pnpm add @iveri/nest-sdk @iveri/contracts
```

Import from the root barrel only — never `@iveri/nest-sdk/dist/...`.

```ts
import { BaseEntity, BaseRepository, GlobalExceptionFilter, RequestContext, validateEnv } from '@iveri/nest-sdk';
```

Backend only. Anything a browser needs lives in `@iveri/contracts`.

---

## `repository/` — tenant scoping is the default

The most important thing in this package. `BaseRepository` takes a **required** `tenantId` on
every method and applies it to the criteria itself. There is no unscoped overload, so a
cross-tenant read is not something to remember to prevent — it is not reachable.

```ts
@Injectable()
export class ConversationRepository extends BaseRepository<ConversationEntity> {
    constructor(dataSource: DataSource) {
        super(dataSource, ConversationEntity);
    }
}
```

Two details that matter:

- A caller-supplied `tenantId` in a `where` clause is **overridden**, not honoured. Scoping a
  caller can override is not scoping.
- An array `where` is TypeORM's OR, and every branch gets its own tenant predicate. Scoping
  only the first branch is the exact bug this exists to prevent.

`updateOneById` strips `id`, `tenantId` and the timestamps from the values, so an update can
never hand a row to another tenant.

For a query the typed methods cannot express, use the protected `scopedQueryBuilder`, which
returns a builder with the tenant predicate already applied. `andWhere` narrows within the
tenant; **`orWhere` widens past it** — bracket your alternatives instead.

Every method takes an optional `manager?: EntityManager`, so any operation can be pulled into
a caller's transaction.

## `entity/` — `BaseEntity`

`id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`, with column names spelled out
explicitly per `.claude/rules/sql.md`. Soft delete via `@DeleteDateColumn`.

`tenantId` is unconditional. Identity's `tenant` table sets `tenant_id = id`; that redundancy
is deliberate, and it is what lets `BaseRepository` protect every table without exceptions.

## `exception/` — typed failures, one renderer

Business code throws a `DomainException` subclass and never touches a status code.
`GlobalExceptionFilter` is the only thing that turns one into an HTTP response.

```ts
throw new ResourceNotFoundException('Tenant not found', { id });
```

Register the filter so it participates in DI:

```ts
providers: [
    {
        provide: APP_FILTER,
        useFactory: (config: ConfigService) =>
            new GlobalExceptionFilter({ exposeInternalErrors: config.get('NODE_ENV') === Environment.LOCAL }),
        inject: [ConfigService],
    },
];
```

It also handles what business code did not throw:

- **`ValidationPipe` failures** — per-field constraint messages lifted into
  `details.violations` rather than flattened into one string.
- **Postgres `23505` / `23503` / `23514`** — a unique-violation race surfaces as a clean 409
  instead of a 500. Duck-typed, so the SDK takes no type-level dependency on the driver.
- **Everything else** — 500 with a generic message. The real message and stack are logged and
  never returned unless `exposeInternalErrors` is on, which is for local development only.

5xx logs with a stack; 4xx logs at warn without one. Both carry the correlation id.

Add a service-specific failure by extending `DomainException`:

```ts
export class ConversationClosedException extends DomainException {
    readonly code = ErrorCode.UNPROCESSABLE_ENTITY;
    readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
}
```

## `context/` — correlation id and `RequestContext`

Two different things, deliberately.

**`CorrelationIdService`** is ambient, via `AsyncLocalStorage`. It has to reach code that
never sees a request — a repository logging a slow query, a processor publishing for a request
that ended minutes ago. Apply `CorrelationIdMiddleware` in `AppModule`:

```ts
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    }
}
```

It echoes an incoming `x-correlation-id` and mints one otherwise, and writes it onto the
response.

**`RequestContext`** is explicit. It carries `tenantId`, `userId`, `permissions`, `locale` and
`correlationId`, is built once at the edge from the authenticated principal, and is threaded
through the service DTO layer. It is never reconstructed from headers deeper in the stack, and
`tenantId` never comes from a request body — that is the multi-tenancy guarantee in one
sentence.

`@CurrentRequestContext()` hands it to a controller and **throws** when nothing populated it.
An endpoint reaching a handler with no context is misconfigured, and failing loudly there is
the difference between a 401 and a query that silently runs untenanted.

> The guard that populates it is `AuthGuard`, below — it moved here in 0.3.0. A service
> narrowing the context to `AuthenticatedRequestContext` gets `apiKeyId` alongside `userId`.
> `@CurrentAuth` — named in the workspace guide — was never built; `@CurrentRequestContext()`
> with a narrowed parameter type does the same job with one decorator instead of two.

## `config/` — validate at startup, or do not start

```ts
export class AppEnvConfig extends BaseEnvConfig {
    @IsString()
    @IsNotEmpty()
    DATABASE_URL: string;
}

ConfigModule.forRoot({ isGlobal: true, validate: (raw) => validateEnv(AppEnvConfig, raw) });
```

Throwing here is the point. A service that starts with a missing `DATABASE_URL` fails on the
first request that needs it — in production, as a 500 whose stack says nothing about config.
Failing at startup makes it a container that never passes its health check and a deploy that
rolls itself back.

Every failure is reported at once, not just the first. `enableImplicitConversion` is off on
purpose: every environment variable arrives as a string, and implicit conversion would coerce
`PORT=abc` to `NaN` and pass it. Declare `@Type(() => Number)` instead.

## `health/`

```ts
HealthModule.forRoot({ checks: [DatabaseReadinessCheck] });

// Readiness and startup differ when a dependency is required to boot but survivable to lose.
HealthModule.forRoot({ checks: [], startupChecks: [RedisStartupCheck] });
```

Three probes, because an orchestrator has three questions and three different remedies:

| Route             | Question                 | Failure remedy                      |
| ----------------- | ------------------------ | ----------------------------------- |
| `/health/live`    | Is the process running?  | Kill and restart the container      |
| `/health/ready`   | Can it serve now?        | Take the instance out of rotation   |
| `/health/startup` | Has it finished booting? | Kill a container that never came up |

**Liveness touches nothing.** A database blip that fails liveness gets the container killed,
turning a recoverable outage into a crash loop. **Readiness runs `checks`** and returns 503
when any is down. **Startup runs `startupChecks`** — defaulting to `checks` — and **latches**:
once they have all passed once it keeps answering 200, because after boot a dependency failure
should drain traffic rather than restart the process, and that is readiness's job.

**There is no bare `GET /health`.** It was ambiguous about which of the three it answered, and
the two plausible readings have opposite remedies. It was removed in 0.13.0.

`DatabaseReadinessCheck` runs `SELECT 1` rather than reading `dataSource.isInitialized` — that
flag stays `true` after the connection drops.

Every route is `VERSION_NEUTRAL` and `@Public()`. **A probe URL must not move when the API
contract version does** — under URI versioning an unmarked controller lands on `/v1/health`,
so shipping v2 silently breaks every probe configured against v1. And a load balancer holds no
credentials, so a global `AuthGuard` that does not honour `@Public()` 401s the probe and takes
the whole service out of rotation. Version 0.1.0 shipped without either; 0.1.1 adds them.

Exclude the probes from the global prefix with the exported list rather than by hand, so a
route added here cannot end up served from `/api/health/...` in one service and `/health/...`
in the next:

```ts
app.setGlobalPrefix('api', { exclude: [...HEALTH_ROUTE_EXCLUSIONS] });
```

## `auth/` — verifying an identity token

`AuthModule`, `AccessTokenService`, `AuthGuard`, `PermissionGuard`, `@RequirePermission()`,
`@Public()`, and `AuthenticatedRequestContext`.

```ts
// app.module.ts
AuthModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
        issuer: configService.get('JWT_ISSUER', { infer: true }),
        audience: configService.get('JWT_AUDIENCE', { infer: true }),
    }),
});

// …and register the guards yourself, in the order this service wants:
providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
];
```

```ts
@Public()
@Post('login')
login(@Body() body: LoginInputDto) {}

@RequirePermission(UserPermission.UNIBOX_MESSAGE_SEND)
@Post(':conversationId/messages')
sendMessage() {}
```

Register `AuthGuard` globally and treat `@Public()` as the exception. **Authentication as the
default is what makes a forgotten decorator fail closed**; opt-in guards fail open, silently, on
the one route nobody re-reviewed.

**This module verifies and cannot sign.** There is no `sign` method and no `signOptions`, on
purpose: the moment a consuming service can issue a token it becomes a second identity provider,
and the shared secret stops being a verification key and starts being a minting key in every repo
that holds it.

**The guards are exported as classes, not registered by the module.** Guard _order_ is a
service-level decision with real consequences — `conduit-api` puts its rate limiter between
authentication and authorization so a caller hammering a route they lack permission for is slowed
down rather than merely refused. A module that registered its own `APP_GUARD` would take that
decision away and hide it.

### Why it lives here, and what stayed behind

Extracted when `unibox-api` became the **third** consumer. `conduit-api` was the second and it was
not extracted then; on the third it stopped being a judgement call, because three copies of the
code that decides who may do what is how a security control diverges silently — the same argument
that moved the token bucket in 0.2.0.

`iveri-identity-api` keeps its own guard, and that is not a leftover. Identity's has a second,
API-key branch it can afford because the key is a row in its own database. Every other service
would have to call identity to check one, which is the exact cost the stateless-JWT design exists
to avoid — so a verifying service has one branch, and a machine gets in by trading its key for a
token at identity's `POST /auth/token`.

`AuthenticatedRequestContext` carries **both** `userId` and `apiKeyId`, exactly one of them set.
Code that attributes a change to a person must handle `null`: a service token's `sub` is an
`api_key.id`, and writing it to `userId` puts it in audit columns naming somebody who does not
exist.

## `encryption/` — envelope encryption for customers' credentials

```ts
// The service declares ENCRYPTION_KEY on its own env config; this reads it.
providers: [EncryptionService];

const stored = encryptionService.encrypt(signingSecret);
const secret = encryptionService.decrypt(stored);
```

§11 forbids a plaintext column for anything a customer would call a credential. Across the fleet
that is Conduit's provider signing secrets and its customers' OAuth credentials, and Unibox's
channel ingest secrets.

**Envelope, not direct encryption.** Every value gets its own random data key and the master key
wraps only that. Encrypting values directly with the master key is simpler and is the thing to
avoid: rotating the master would then mean decrypting and re-encrypting every row, and one key
would cover unbounded data in a single nonce space. With an envelope, rotation rewrites only the
wrapped keys — and `wrapDataKey`/`unwrapDataKey` is a one-class change away from being a KMS call,
which is the reason to structure it this way before deploying rather than after.

The stored form is `v1.<wrapIv>.<wrappedKey>.<wrapTag>.<iv>.<ciphertext+tag>`, all base64 — which
never emits `.`, so parsing is total. **The `v1` marker is load-bearing**: a KMS-wrapped `v2` is
recognised by its prefix and `v1` rows keep decrypting through the old path, so the wrapper can be
replaced without rewriting every row in one transaction and hoping nothing was written meanwhile.

AES-256-GCM, so a tampered ciphertext **fails** rather than decrypting to plausible garbage. A
secret that silently decrypted to the wrong bytes would present as "the provider changed their
signature format", sending somebody to debug a third party over a corrupted row of ours.

`secretsMatch` sits beside it: constant-time comparison for signatures and shared secrets. `===`
stops at the first differing byte and leaks the expected value one byte at a time.

Extracted from `conduit-api` in 0.4.0, when `unibox-api` became the second service holding
customer credentials — and it gained the specs it had never had on the way across.

---

## `redis/` and `rate-limit/` — a token bucket, and the connection under it

Extracted from `conduit-api` once `iveri-identity-api` became the second consumer, not designed
in advance. `ioredis` is a **peer dependency**: the root barrel loads it, and every service with
a public endpoint needs a limit on it (§17).

```ts
// app.module.ts
RedisModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (configService: ConfigService<AppEnvConfig, true>) => ({
        url: configService.get('REDIS_URL', { infer: true }),
        commandTimeoutMs: configService.get('REDIS_COMMAND_TIMEOUT_MS', { infer: true }),
    }),
}),
RateLimitModule.forRoot({ namespace: 'conduit' }),
```

```ts
const decision = await this.rateLimitService.consume({
    input: {
        scope: RateLimitScope.AUTH, // your enum — see below
        hashTag: hashRateLimitIdentifier(tenantSlug),
        policy: { perMinute: 30, burst: 10 },
        now: new Date(),
    },
});
```

Four things about it are decisions rather than details:

- **It fails open.** Unreachable Redis means the request is allowed and `isEnforced` is `false`.
  Rate limiting bounds resource exhaustion; it authorizes nothing, and the checks that decide
  whether a caller may be here at all fail closed without touching Redis. A service wanting the
  opposite reads `isEnforced` and refuses at its own call site, where the reasoning is visible —
  there is no flag for it, because taking a whole surface down should not be a boolean.
- **A bucket, not a window.** A fixed window lets a caller spend a full allowance either side of
  a boundary, and conflates the sustained rate with the burst. Real traffic arrives in spikes.
- **`scope` is a `string`, not an SDK enum.** Which surfaces exist and which deserve their own
  bucket is the genuinely service-specific part. Declare your own enum and pass a member.
- **No URL is a supported state.** `RedisService.getClient()` returns `null` and consumers
  degrade. Whether that is acceptable is a question about your service — enforce it in your own
  env validation, where the condition can be written honestly.

**The guard is not here**, on purpose. How a key is chosen — which route counts against which
identity — belongs beside the routes it protects. `conduit-api`'s `RateLimitGuard` is the
reference: ingress per endpoint token before any database read, everything authenticated per
principal with no decorator.

Keys are `<namespace>:ratelimit:<scope>:{<hashTag>}[:<suffix>]`. The braces are a cluster hash
tag — single-key operations do not need one, but adding tags later means rewriting keys a live
system is already reading. Run anything that is itself a credential through
`hashRateLimitIdentifier` first; Redis keys surface in `MONITOR`, `SLOWLOG` and `--bigkeys`.

---

## What is deliberately not here yet

`outbox/`, `inbox/`, `lock/`, `http/`, `pagination/`, `swagger/` and `observability/` are in
the plan and unwritten. Per the second-consumer rule, they get written in the service that
first needs them and are pushed down here once proven by real use. Nothing is extracted in
anticipation.

`outbox/` is the interesting one: Conduit gateway mode (build-order step 4) wrote a
**specialised** queue rather than the generic module — its rows carry a target URL, an attempt
budget and a next-attempt time, which are the columns its indexes and its DLQ view depend on.
That table is now the reference for what the generic claim/retry/dead-letter machinery should
look like here, once a service publishes a real cross-service event.
