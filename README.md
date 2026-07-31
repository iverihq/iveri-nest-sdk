# @iveri/nest-sdk

The NestJS plumbing every Iveri service shares: request context, typed exceptions,
tenant-scoped persistence, config validation, health endpoints.

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

> The guard that populates it ships with `iveri-identity-api` (build-order step 2). Until then
> the decorator is the seam and nothing more. `@CurrentAuth` — named in the workspace guide —
> arrives with that guard, when there is an auth principal for it to return.

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
```

`GET /health` is **liveness** and touches nothing — a database blip that fails liveness gets
the container killed, turning a recoverable outage into a crash loop. `GET /health/ready` is
**readiness**, runs the checks, and returns 503 when any is down so the load balancer takes
the instance out of rotation.

`DatabaseReadinessCheck` runs `SELECT 1` rather than reading `dataSource.isInitialized` — that
flag stays `true` after the connection drops.

Both routes are `VERSION_NEUTRAL` and `@Public()`. **A probe URL must not move when the API
contract version does** — under URI versioning an unmarked controller lands on `/v1/health`,
so shipping v2 silently breaks every probe configured against v1. And a load balancer holds no
credentials, so a global `AuthGuard` that does not honour `@Public()` 401s the probe and takes
the whole service out of rotation. Version 0.1.0 shipped without either; 0.1.1 adds them.

## `auth/`

`@Public()` and `IS_PUBLIC_KEY`, the metadata seam between a service's `AuthGuard` and the
routes that must stay open.

```ts
@Public()
@Post('login')
login(@Body() body: LoginInputDto) {}
```

The guard itself stays in the service for now — identity is its only implementation, so there
is nothing to generalise from yet (second-consumer rule). Only the decorator lives here,
because the SDK's own `HealthController` has to carry it.

Register the guard globally and treat `@Public()` as the exception. **Authentication as the
default is what makes a forgotten decorator fail closed**; opt-in guards fail open, silently,
on the one route nobody re-reviewed.

---

## What is deliberately not here yet

`outbox/`, `inbox/`, `lock/`, `http/`, `pagination/`, `swagger/` and `observability/` are in
the plan and unwritten. Per the second-consumer rule, they get written in the service that
first needs them — outbox/inbox/lock in Conduit gateway mode (build-order step 4) — and are
pushed down here once they are proven by real use. Nothing is extracted in anticipation.
