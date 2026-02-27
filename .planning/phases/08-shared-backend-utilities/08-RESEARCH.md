# Phase 8: Shared Backend Utilities - Research

**Researched:** 2026-02-27
**Domain:** Node.js PostgreSQL connection pooling, shared backend utilities
**Confidence:** HIGH

## Summary

Phase 8 requires centralizing the duplicated PostgreSQL pool configuration from three identical `new Pool({...})` blocks (in `auth-service/src/index.ts`, `profile-service/src/index.ts`, `chat-service/src/index.ts`) into a single factory function in the existing `@vlvt/shared` package. The scope is narrow and well-defined: one new file in `backend/shared/src/utils/`, one new export from `backend/shared/src/index.ts`, and three service files updated to use it.

The current pool configuration across all three services is byte-for-byte identical: same `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, SSL config, and event handlers. The only meaningful code change beyond centralization is: (a) changing the `connectionTimeoutMillis` default from `2000` to `5000` for Railway cold starts, and (b) ensuring the `pool.on('error')` handler logs-and-continues instead of crashing the process.

**Primary recommendation:** Create a `createPool()` factory function in `@vlvt/shared` that returns a configured `Pool` instance with error event handlers attached, then replace all three inline pool configurations with a single import call.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RESIL-01 | All services use a shared resilient DB pool with error handling that prevents process crashes on idle client errors | pg-pool source confirms idle client errors auto-remove the client and emit 'error' on pool. If `pool.on('error')` is attached (logging without `process.exit`), the pool self-heals. See Architecture Pattern 1 and Code Examples. |
| RESIL-02 | DB connection timeout increased from 2s to 5s for Railway cold starts | Change `connectionTimeoutMillis` default from `'2000'` to `'5000'` in the factory. Railway's own blog example uses 5000ms. All three services currently default to 2000ms. |
| RESIL-03 | Pool configuration centralized in one shared utility | The `@vlvt/shared` package already exists at `backend/shared/` with `pg` as a dependency. A new `src/utils/db-pool.ts` file exports `createPool()`, and `src/index.ts` re-exports it. Services replace their inline Pool creation with `import { createPool } from '@vlvt/shared'`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg (node-postgres) | 8.16.3 | PostgreSQL client and connection pool | Already installed across all services and `@vlvt/shared`; no version change needed |
| @vlvt/shared | 1.0.0 (local) | Shared utilities package | Already exists at `backend/shared/`, linked via `file:../shared` in each service's package.json |
| winston | 3.18.3 | Structured logging | Already used via `@vlvt/shared`'s `createLogger()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/pg | 8.15.6 | TypeScript types for pg | Already in devDependencies; needed for Pool type annotations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg Pool | pgBouncer (external) | PgBouncer is better at scale (thousands of connections) but adds infrastructure complexity; pg Pool is sufficient for VLVT's load at beta |
| Factory function | Singleton module | Singleton would prevent testing with different configs; factory is more flexible and testable |

**Installation:**
No new dependencies required. `pg` is already a dependency of `@vlvt/shared` (^8.0.0) and all three services (^8.16.3).

## Architecture Patterns

### Recommended Project Structure
```
backend/shared/src/
├── utils/
│   ├── db-pool.ts        # NEW: createPool() factory + types
│   ├── logger.ts          # Existing: createLogger()
│   ├── audit-logger.ts    # Existing
│   ├── env-validator.ts   # Existing
│   └── response.ts        # Existing
├── index.ts               # Add db-pool exports
└── ...existing files...
```

### Pattern 1: Pool Factory with Attached Error Handling
**What:** A `createPool()` function that accepts optional overrides, constructs a `Pool` with resilient defaults, attaches `pool.on('error')` that logs-and-continues, and returns the pool.
**When to use:** Every service's startup code, replacing the inline `new Pool({...})` block.
**Why log-and-continue instead of process.exit:** The pg-pool source code (lines 51-63 of `pg-pool/index.js`) shows that when an idle client errors, the pool:
1. Removes the client's error listener
2. Adds a no-op error listener to prevent further uncaught errors
3. Calls `pool._remove(client)` which removes it from `_idle` and `_clients` arrays and calls `client.end()`
4. Only then emits `'error'` on the pool

The pool automatically replaces removed clients on the next `connect()` call via `_pulseQueue()`. Crashing on idle client errors (as the old pg docs suggested) is unnecessarily destructive for a pool that self-heals.

**Example:**
```typescript
// backend/shared/src/utils/db-pool.ts
import { Pool, PoolConfig } from 'pg';
import winston from 'winston';

export interface CreatePoolOptions {
  /** Override DATABASE_URL from env */
  connectionString?: string;
  /** Winston logger instance for pool events */
  logger?: winston.Logger;
  /** Override default pool config */
  poolConfig?: Partial<PoolConfig>;
}

export function createPool(options: CreatePoolOptions = {}): Pool {
  const {
    connectionString = process.env.DATABASE_URL,
    logger,
    poolConfig = {},
  } = options;

  const pool = new Pool({
    connectionString,
    max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '5000', 10),
    ssl: connectionString?.includes('railway')
      ? { rejectUnauthorized: false }
      : false,
    ...poolConfig,
  });

  const log = logger || console;

  pool.on('connect', () => {
    log.info('New database connection established');
  });

  pool.on('acquire', () => {
    log.debug?.('Database client acquired from pool') ?? undefined;
  });

  pool.on('remove', () => {
    log.debug?.('Database client removed from pool') ?? undefined;
  });

  // RESIL-01: Log and continue instead of crashing
  // pg-pool auto-removes the errored idle client and replaces it on next checkout
  pool.on('error', (err: Error) => {
    log.error('Unexpected error on idle database client', {
      error: err.message,
      stack: err.stack,
    });
  });

  return pool;
}
```

### Pattern 2: Service Integration (Drop-in Replacement)
**What:** Each service replaces ~30 lines of inline pool config + event handlers with a 1-line import call.
**When to use:** In each service's `src/index.ts`.

**Before (current, in each service):**
```typescript
import { Pool } from 'pg';
// ...30 lines of identical pool config + event handlers...
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ... });
pool.on('connect', ...);
pool.on('acquire', ...);
pool.on('remove', ...);
pool.on('error', ...);
```

**After:**
```typescript
import { createPool } from '@vlvt/shared';
const pool = createPool({ logger });
```

The rest of each service's code is unchanged -- `pool` is still a `Pool` instance passed as a parameter to sub-modules.

### Anti-Patterns to Avoid
- **Singleton pool module:** Don't create a module that exports a pre-created pool instance. This prevents testing with different configurations and makes the module-load-order dependent on environment variables being set.
- **Pool wrapper class:** Don't wrap `Pool` in a custom class that proxies `.query()`, `.connect()`, etc. This adds a layer that breaks TypeScript types, complicates mocking, and gains nothing since the factory returns a real `Pool`.
- **Centralized query function:** Don't create a `db.query()` helper that hides the pool. Services need direct pool access for transactions (`pool.connect()` for client checkout) and passing pool to sub-modules.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection retry after error | Custom retry loop wrapping pool.query() | pg Pool's built-in client replacement | pg-pool already removes dead clients and creates new ones on demand; custom retry adds complexity and can cause duplicate operations |
| SSL certificate validation | Custom TLS setup | `ssl: { rejectUnauthorized: false }` for Railway | Railway uses self-signed certs on internal network; this is documented in SEC-01-DOCUMENTED |
| Connection string parsing | Manual URL parsing | pg Pool's `connectionString` option | pg internally uses `pg-connection-string` to parse DATABASE_URL |
| Idle connection cleanup | Custom timer to close idle connections | `idleTimeoutMillis` Pool option | Built into pg-pool, handles all edge cases |

**Key insight:** The pg Pool already handles every resilience concern internally (dead client removal, lazy client creation, idle timeout, connection limits). The factory function's job is configuration and error handler attachment, not behavior replacement.

## Common Pitfalls

### Pitfall 1: Not Attaching pool.on('error') Before First Query
**What goes wrong:** If an idle client errors before `pool.on('error')` is attached, Node emits an uncaught error and crashes the process.
**Why it happens:** The pool is created but the error handler is attached later in the code, creating a window where errors are unhandled.
**How to avoid:** The factory function attaches the error handler inside `createPool()` before returning the pool, eliminating this race condition.
**Warning signs:** Crash logs showing "Unhandled 'error' event" from pg-pool.

### Pitfall 2: Calling process.exit() in pool.on('error')
**What goes wrong:** The process dies on a transient idle client error that the pool would have recovered from automatically.
**Why it happens:** Older pg documentation recommended `process.exit(-1)` in the error handler. This was challenged in [issue #2843](https://github.com/brianc/node-postgres/issues/2843).
**How to avoid:** Log the error and let the pool self-heal. The errored client is already removed before the 'error' event fires.
**Warning signs:** Service restarts in Railway logs correlating with PostgreSQL maintenance windows or brief network blips.

### Pitfall 3: Connection Timeout Too Low for Cold Starts
**What goes wrong:** First connections fail with "Connection terminated due to connection timeout" when Railway cold-starts the PostgreSQL service.
**Why it happens:** Default `connectionTimeoutMillis` of 2000ms is insufficient when PostgreSQL needs to start from a cold state on Railway.
**How to avoid:** Set `connectionTimeoutMillis` to 5000ms (RESIL-02 requirement). Railway's own blog example uses 5000ms.
**Warning signs:** Timeout errors in logs that only occur after periods of inactivity, not under sustained load.

### Pitfall 4: Environment Variable Override Ignored
**What goes wrong:** Service starts with hardcoded values instead of environment-specific overrides.
**Why it happens:** Factory uses default values instead of reading env vars, or env var names don't match what's deployed.
**How to avoid:** Keep the same `DATABASE_POOL_MAX`, `DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_CONNECTION_TIMEOUT_MS` env var names already in use. Only change the default for connection timeout.
**Warning signs:** Pool config in logs doesn't match Railway environment variables.

### Pitfall 5: Breaking Existing Test Mocks
**What goes wrong:** Tests that mock `jest.mock('pg', ...)` stop working because the pool is now created inside `@vlvt/shared`.
**Why it happens:** Jest module mocking is path-sensitive. If tests mock `pg` at the service level but `createPool` imports `pg` from the shared package's perspective, the mock may not apply.
**How to avoid:** Tests can either (a) mock `@vlvt/shared`'s `createPool` directly to return a mock pool, or (b) continue mocking `pg` with `jest.mock('pg')` which works globally across all imports in the test process. Option (b) works because Jest's module mock system replaces the module globally, regardless of which package imports it.
**Warning signs:** Tests that pass individually but fail when run together, or vice versa.

## Code Examples

### Creating the Pool in a Service (After Phase 8)
```typescript
// backend/auth-service/src/index.ts
import { createPool } from '@vlvt/shared';
import logger from './utils/logger';

const pool = createPool({ logger });

// Everything else stays the same -- pool is still a Pool instance
// passed as parameter to routes, middleware, etc.
```

### Factory Function with Full Type Safety
```typescript
// backend/shared/src/utils/db-pool.ts
import { Pool, PoolConfig } from 'pg';
import winston from 'winston';

export interface CreatePoolOptions {
  connectionString?: string;
  logger?: winston.Logger;
  poolConfig?: Partial<PoolConfig>;
}

export function createPool(options: CreatePoolOptions = {}): Pool {
  const {
    connectionString = process.env.DATABASE_URL,
    logger,
    poolConfig = {},
  } = options;

  const pool = new Pool({
    connectionString,
    max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '5000', 10),
    // SEC-01-DOCUMENTED: rejectUnauthorized: false is acceptable for Railway's
    // internal private network with self-signed certs.
    ssl: connectionString?.includes('railway')
      ? { rejectUnauthorized: false }
      : false,
    ...poolConfig,
  });

  const log = logger ?? {
    info: console.log,
    debug: console.debug,
    error: console.error,
  };

  pool.on('connect', () => {
    log.info('New database connection established');
  });

  pool.on('acquire', () => {
    if (typeof log.debug === 'function') log.debug('Database client acquired from pool');
  });

  pool.on('remove', () => {
    if (typeof log.debug === 'function') log.debug('Database client removed from pool');
  });

  // RESIL-01: Log error and continue. pg-pool already removes the dead client
  // and will create a new one on the next connect()/query() call.
  pool.on('error', (err: Error) => {
    log.error('Unexpected error on idle database client', {
      error: err.message,
      stack: err.stack,
    });
  });

  return pool;
}
```

### Updating the Shared Package Exports
```typescript
// backend/shared/src/index.ts (additions only)
export {
  createPool,
  type CreatePoolOptions,
} from './utils/db-pool';
```

### Test Mock Pattern (Unchanged)
```typescript
// Tests continue to work with existing mock pattern
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `process.exit(-1)` on pool error | Log and continue; pool self-heals | Debated since 2022 ([issue #2843](https://github.com/brianc/node-postgres/issues/2843)) | No unnecessary restarts on transient errors |
| `connectionTimeoutMillis: 0` (no timeout) | Explicit timeout (5000ms recommended for PaaS) | pg-pool default is 0; Railway blog suggests 5000ms | Prevents hung connections during cold starts |
| Inline pool config per service | Shared factory function | Common pattern in Node.js monorepos | Single source of truth for all pool settings |

**Deprecated/outdated:**
- The `process.exit(-1)` recommendation in pool error handlers was challenged in the pg community. The pg-pool source shows the pool auto-removes errored clients before emitting the error event, making exit unnecessary.

## Open Questions

1. **Logger compatibility with createPool**
   - What we know: Each service has its own `logger` import (e.g., `import logger from './utils/logger'`). The shared package has `createLogger()`.
   - What's unclear: Whether services use their local logger or the shared one (they appear to use local loggers that may have identical implementation).
   - Recommendation: Accept a `winston.Logger` parameter in `createPool()`. Each service passes its existing logger. No logger migration needed in this phase.

2. **Rebuild after shared package changes**
   - What we know: `@vlvt/shared` uses `tsc` to build to `dist/`. Services reference `file:../shared` which points to `dist/`.
   - What's unclear: Whether CI/CD rebuilds shared before services, or if services need `npm run build` in shared first.
   - Recommendation: After adding `db-pool.ts`, run `cd backend/shared && npm run build` before testing services. This is an existing workflow concern, not new to this phase.

## Sources

### Primary (HIGH confidence)
- [node-postgres Pool API docs](https://node-postgres.com/apis/pool) - Pool constructor options, error event behavior, defaults
- [node-postgres Pooling guide](https://node-postgres.com/features/pooling) - Idle client error behavior, pool.end() semantics
- [pg-pool source code](https://github.com/brianc/node-postgres/tree/master/packages/pg-pool) - `makeIdleListener()` at lines 51-63 confirms auto-removal of errored idle clients before emitting 'error'
- Local codebase inspection - All three service `index.ts` files, `@vlvt/shared` package structure, test mock patterns

### Secondary (MEDIUM confidence)
- [Issue #2843: Don't recommend process exit on idle client errors](https://github.com/brianc/node-postgres/issues/2843) - Community consensus shifting toward log-and-continue
- [Issue #2641: pg.pool on error](https://github.com/brianc/node-postgres/issues/2641) - Maintainer's original view (process.exit) and counterarguments
- [Railway database connection pooling blog](https://blog.railway.com/p/database-connection-pooling) - Example using connectionTimeoutMillis: 5000

### Tertiary (LOW confidence)
- None. All findings verified against source code or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all libraries already installed and verified in `package.json`
- Architecture: HIGH - factory pattern is straightforward; pg-pool source code verified to confirm self-healing behavior
- Pitfalls: HIGH - error handling behavior verified by reading pg-pool source code, not just documentation

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable; pg 8.x is mature, no breaking changes expected)
