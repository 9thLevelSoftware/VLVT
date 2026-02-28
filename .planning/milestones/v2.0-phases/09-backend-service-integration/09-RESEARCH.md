# Phase 9: Backend Service Integration - Research

**Researched:** 2026-02-27
**Domain:** Node.js graceful shutdown, SIGTERM/SIGINT handling, pg pool teardown, Socket.IO close
**Confidence:** HIGH

## Summary

Phase 9 adds graceful shutdown handlers to all three backend services (auth, profile, chat) so they cleanly stop on SIGTERM/SIGINT -- the signal Railway sends when deploying a new version. Two of the three services (profile-service, chat-service) already have partial shutdown handlers, but none of them close the database pool (`pool.end()`), and auth-service has **no shutdown handler at all** (and does not even capture the `http.Server` reference from `app.listen()`).

The work is straightforward: each service needs a `gracefulShutdown(signal)` function that (1) sets a guard flag to prevent double invocation, (2) stops accepting new requests via `server.close()`, (3) closes service-specific resources (schedulers, Socket.IO, Redis subscribers), (4) calls `pool.end()`, and (5) exits. A 10-second `setTimeout` force-exit ensures stuck operations cannot hang Railway deployments. The double-invocation guard is critical because pg-pool's `end()` method **throws an error** when called twice (`'Called end on pool more than once'`), confirmed by reading the pg-pool source code at line 450-454.

**Primary recommendation:** Implement a consistent `gracefulShutdown()` pattern across all three services using a shared structure: guard flag, server.close, service-specific cleanup, pool.end, and a 10-second force-exit timeout with `setTimeout.unref()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RESIL-04 | Auth-service handles SIGTERM/SIGINT with graceful shutdown (server.close + pool.end) | Auth-service currently has NO shutdown handler and does NOT capture the `http.Server` from `app.listen()`. Must: (1) capture server reference, (2) add SIGTERM/SIGINT handlers, (3) call server.close() + pool.end(). See Architecture Pattern 1 and Code Example 1. |
| RESIL-05 | Profile-service shutdown handler includes pool.end() and server.close() | Profile-service has existing handlers (lines 1785-1799) that close schedulers but do NOT call pool.end() or server.close(). The `app.listen()` return value is also not captured. Must add both, plus guard flag and force-exit timeout. See Architecture Pattern 2. |
| RESIL-06 | Chat-service shutdown handler includes pool.end() | Chat-service has existing handlers (lines 1642-1665) with httpServer.close() and force-exit timeout, but does NOT call pool.end() or io.close(). Must add both, plus guard flag. Also missing: closeAfterHoursRedisSubscriber() is not called during shutdown. See Architecture Pattern 3. |
| RESIL-07 | All services have a 10-second force-exit timeout to prevent hung shutdowns | Chat-service already has this (lines 1657-1661). Auth-service and profile-service do not. All three must use `setTimeout(() => process.exit(1), 10000)` with `.unref()` to prevent the timer from keeping the process alive. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg (node-postgres) | 8.16.3 | PostgreSQL pool with `pool.end()` for shutdown | Already installed; `pool.end()` drains all active clients and closes connections |
| socket.io | 4.x | `io.close()` closes WebSocket server and disconnects all clients | Already installed in chat-service; `io.close()` also closes underlying HTTP server |
| Node.js http | built-in | `server.close()` stops accepting new connections, drains in-flight requests | Built into Node.js; since v18.19.0 also closes idle keep-alive connections |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| winston | 3.18.3 | Log shutdown events | Already used in all services for structured logging |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual shutdown handlers | http-graceful-shutdown npm package | Adds a dependency for ~20 lines of straightforward code; not worth it for 3 services with different resource cleanup needs |
| `setTimeout` force-exit | `AbortController` with timeout | AbortController is more modern but adds complexity; setTimeout is simpler and universally understood |

**Installation:**
No new dependencies required. All functionality uses existing packages and Node.js built-ins.

## Architecture Patterns

### Pattern 1: Graceful Shutdown with Guard Flag (Auth-Service)
**What:** Auth-service needs the most work -- capture server reference, add shutdown handlers, guard against double invocation.
**When to use:** Service with no existing shutdown handling.
**Key change:** `app.listen()` returns an `http.Server` instance that MUST be captured to call `server.close()` later.

```typescript
// Auth-service pattern: capture server ref + add shutdown
let isShuttingDown = false;

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    logger.info('Auth service started', { port: PORT });
  });

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Duplicate ${signal} received, shutdown already in progress`);
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Force exit after 10 seconds
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref(); // Don't keep process alive just for this timer

    // Stop accepting new requests, drain in-flight
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database pool
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error('Error closing database pool', { error: (err as Error).message });
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
```

### Pattern 2: Profile-Service Enhancement
**What:** Profile-service already closes schedulers but is missing server.close(), pool.end(), guard flag, and force-exit timeout.
**When to use:** Service with partial shutdown handling that needs completion.
**Key changes:** (1) Capture `app.listen()` return value, (2) consolidate duplicate SIGTERM/SIGINT into one function, (3) add pool.end() and server.close(), (4) add guard and timeout.

Current state (profile-service lines 1784-1799):
```typescript
// CURRENT: duplicate handlers, no server.close, no pool.end, no guard, no timeout
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closeMatchingScheduler();
  await closeSessionScheduler();
  await closeSessionCleanupJob();
  process.exit(0);
});
process.on('SIGINT', async () => {
  // ... identical code ...
});
```

Target state: single `gracefulShutdown()` function with guard, server.close, scheduler cleanup, pool.end, and 10s timeout.

### Pattern 3: Chat-Service Enhancement
**What:** Chat-service already has `httpServer.close()` and 10s timeout, but is missing pool.end(), io.close(), Redis subscriber cleanup, and double-invocation guard.
**When to use:** Service with most of the shutdown infrastructure but missing critical resource cleanup.
**Key changes:** (1) Add guard flag, (2) use `io.close()` instead of `httpServer.close()` (io.close closes the underlying HTTP server too), (3) add pool.end(), (4) add closeAfterHoursRedisSubscriber().

Current state (chat-service lines 1642-1665):
```typescript
// CURRENT: no guard, no pool.end, no io.close, missing Redis subscriber cleanup
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  await closeMessageCleanupJob().catch(...);
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Forcefully shutting down after timeout');
    process.exit(1);
  }, 10000);
};
```

### Recommended Shutdown Order (All Services)

1. **Set guard flag** (prevent re-entry)
2. **Start force-exit timer** (10s, `.unref()`)
3. **Stop accepting new HTTP requests** (`server.close()` / `io.close()`)
4. **Close background jobs/schedulers** (service-specific)
5. **Close database pool** (`pool.end()`)
6. **Exit** (`process.exit(0)`)

The order matters: stop incoming work first, then clean up resources. pool.end() goes near last because in-flight request handlers may still need DB access during draining.

### Anti-Patterns to Avoid
- **Calling pool.end() without guard:** pg-pool throws `'Called end on pool more than once'` when end() is called twice (confirmed in source at line 452). A boolean guard flag prevents this.
- **Closing pool before server:** If `pool.end()` runs before `server.close()` finishes draining, in-flight requests will get "Cannot use a pool after calling end on the pool" errors.
- **Using io.close() and httpServer.close() together in chat-service:** `io.close()` already closes the underlying HTTP server. Calling both can cause "Server is not running" errors.
- **setTimeout without .unref():** Without `.unref()`, the force-exit timer itself keeps the event loop alive, preventing natural process termination even after all resources are closed.
- **Async signal handlers without try-catch:** If an `await` inside the shutdown handler throws, the process might stay alive with `isShuttingDown = true`, preventing retries. The force-exit timer mitigates this, but wrapping in try-catch makes logs more useful.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP drain | Custom request tracking + connection counting | `server.close()` | Node.js >=18.19 closes idle keep-alive connections automatically; server.close() waits for in-flight requests |
| Socket.IO disconnect | Iterating sockets and calling disconnect() | `io.close()` | io.close() disconnects all clients, closes WebSocket server, AND closes underlying HTTP server in one call |
| Pool drain | Manually tracking query counts | `pool.end()` | Pool drains all active clients, disconnects them, shuts down internal timers |
| Force-exit timeout | Custom interval checking shutdown state | `setTimeout(() => process.exit(1), 10000)` with `.unref()` | Standard pattern, no complexity needed |

**Key insight:** Node.js, pg-pool, and Socket.IO each provide built-in cleanup methods. The shutdown handler's job is orchestration (correct order + guard), not reimplementation.

## Common Pitfalls

### Pitfall 1: pool.end() Called Twice Throws Error
**What goes wrong:** `Error: Called end on pool more than once` crashes the shutdown handler on the second invocation.
**Why it happens:** SIGTERM sent twice during Railway deployment, or SIGTERM then SIGINT from Docker/systemd.
**How to avoid:** Use `let isShuttingDown = false` guard flag. Check and set to `true` at the top of the shutdown function. Return early if already shutting down.
**Warning signs:** Unhandled promise rejection in logs during deployments mentioning "Called end on pool more than once".

### Pitfall 2: server.close() Hangs with Keep-Alive Connections
**What goes wrong:** `server.close()` callback never fires because HTTP keep-alive connections remain idle but open.
**Why it happens:** In Node.js <18.19.0, `server.close()` did not close idle keep-alive connections. Since Node.js 18.19.0+, `server.close()` now calls `closeIdleConnections()` automatically.
**How to avoid:** The project uses Node.js v24.5.0, so this is handled automatically. The 10-second force-exit timer provides a safety net regardless.
**Warning signs:** Shutdown logs show "starting graceful shutdown" but never "HTTP server closed" -- only the force-exit timeout fires.

### Pitfall 3: Profile-Service Shutdown Handlers Outside Server Block
**What goes wrong:** Signal handlers registered at module scope (outside `if (NODE_ENV !== 'test')`) fire during tests, causing unexpected process.exit() in test runners.
**Why it happens:** Profile-service currently registers SIGTERM/SIGINT at module scope (line 1785), not inside the server startup block.
**How to avoid:** Move signal handlers inside the `if (process.env.NODE_ENV !== 'test')` block, like chat-service does. This ensures they only run in production.
**Warning signs:** Jest tests hanging or exiting unexpectedly when a test triggers SIGTERM.

### Pitfall 4: Missing closeAfterHoursRedisSubscriber in Chat-Service Shutdown
**What goes wrong:** Redis subscriber connection is orphaned on shutdown, potentially blocking process exit.
**Why it happens:** The `closeAfterHoursRedisSubscriber()` function exists (after-hours-handler.ts:702) but is not called in the chat-service shutdown handler.
**How to avoid:** Add it to the shutdown sequence after closeMessageCleanupJob().
**Warning signs:** Redis connection warnings in logs during shutdown, or process not exiting until force-exit timer fires.

### Pitfall 5: Profile-Service app.listen() Not Captured
**What goes wrong:** Cannot call `server.close()` because the `http.Server` returned by `app.listen()` is not stored in a variable.
**Why it happens:** Profile-service calls `app.listen(PORT, ...)` inline without capturing the return value (line 1834).
**How to avoid:** Assign the result: `const server = app.listen(PORT, ...)`.
**Warning signs:** TypeScript error if trying to call `.close()` on undefined; or no "HTTP server closed" log during shutdown.

## Code Examples

### Example 1: Auth-Service Complete Shutdown (New)
```typescript
// Inside initializeApp(), replace the app.listen block:
if (process.env.NODE_ENV !== 'test') {
  let isShuttingDown = false;

  const server = app.listen(PORT, () => {
    logger.info('Auth service started', { port: PORT, environment: process.env.NODE_ENV || 'development' });
  });

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Duplicate ${signal} received, shutdown already in progress`);
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s, forcing exit');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    server.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error('Error closing database pool', { error: (err as Error).message });
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
```

### Example 2: Profile-Service Enhanced Shutdown
```typescript
// Move shutdown handlers INSIDE the server startup block, add server.close + pool.end:
if (process.env.NODE_ENV !== 'test') {
  let isShuttingDown = false;

  initializeUploadDirectory()
    .then(async () => {
      // ... existing scheduler initialization ...

      const server = app.listen(PORT, () => {
        logger.info('Profile service started', { port: PORT, environment: process.env.NODE_ENV || 'development' });
      });

      const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) {
          logger.warn(`Duplicate ${signal} received, shutdown already in progress`);
          return;
        }
        isShuttingDown = true;
        logger.info(`Received ${signal}, starting graceful shutdown...`);

        const forceExitTimer = setTimeout(() => {
          logger.error('Graceful shutdown timed out after 10s, forcing exit');
          process.exit(1);
        }, 10000);
        forceExitTimer.unref();

        server.close(() => {
          logger.info('HTTP server closed');
        });

        // Close background schedulers
        await closeMatchingScheduler().catch((err) => {
          logger.error('Error closing matching scheduler', { error: err.message });
        });
        await closeSessionScheduler().catch((err) => {
          logger.error('Error closing session scheduler', { error: err.message });
        });
        await closeSessionCleanupJob().catch((err) => {
          logger.error('Error closing session cleanup job', { error: err.message });
        });

        // Close database pool
        try {
          await pool.end();
          logger.info('Database pool closed');
        } catch (err) {
          logger.error('Error closing database pool', { error: (err as Error).message });
        }

        process.exit(0);
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    })
    .catch((error) => {
      logger.error('Failed to initialize upload directory', { error });
      process.exit(1);
    });
}
```

### Example 3: Chat-Service Enhanced Shutdown
```typescript
// Enhanced: add guard flag, io.close() instead of httpServer.close(), pool.end(), Redis cleanup
if (process.env.NODE_ENV !== 'test') {
  let isShuttingDown = false;

  httpServer.listen(PORT, () => {
    logger.info('Chat service started with Socket.IO', { port: PORT, environment: process.env.NODE_ENV || 'development' });
  });

  initializeMessageCleanupJob(pool).catch((err) => {
    logger.error('Failed to initialize message cleanup job', { error: err.message });
  });

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`Duplicate ${signal} received, shutdown already in progress`);
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s, forcing exit');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    // Close message cleanup job
    await closeMessageCleanupJob().catch((err) => {
      logger.error('Error closing message cleanup job', { error: err.message });
    });

    // Close Redis subscriber for After Hours events
    await closeAfterHoursRedisSubscriber().catch((err) => {
      logger.error('Error closing After Hours Redis subscriber', { error: err.message });
    });

    // Close Socket.IO (disconnects all clients AND closes underlying HTTP server)
    io.close(() => {
      logger.info('Socket.IO server closed');
    });

    // Close database pool
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error('Error closing database pool', { error: (err as Error).message });
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No shutdown handling (crash on SIGTERM) | Graceful shutdown with signal handlers | Standard since Node.js containerization | Zero-downtime deployments on Railway |
| `server.close()` leaves keep-alive hanging | `server.close()` now calls `closeIdleConnections()` | Node.js 18.19.0 (2023-11) | Eliminates keep-alive hang on shutdown in modern Node |
| `httpServer.close()` for Socket.IO apps | `io.close()` which also closes HTTP server | Socket.IO v4+ | Single call handles both WebSocket and HTTP cleanup |
| Call pool.end() and hope it's called once | Guard flag pattern | Always been necessary; pg-pool throws on double end() | Prevents crash during Railway's rapid SIGTERM sequence |

**Deprecated/outdated:**
- Using `httpServer.close()` alone in Socket.IO apps is insufficient -- WebSocket connections survive it. Always use `io.close()`.
- Older Node.js guides recommend `server.closeAllConnections()` for keep-alive issues; this is not needed on Node.js 18.19+ where `server.close()` handles it automatically.

## Open Questions

1. **Profile-service scheduler close error handling**
   - What we know: The existing shutdown handlers for profile-service `await closeMatchingScheduler()` etc. without try-catch. If Redis is down, these might throw and prevent pool.end() from being called.
   - What's unclear: Whether the scheduler close functions throw or fail silently when Redis is already disconnected.
   - Recommendation: Wrap each scheduler close in `.catch()` (like chat-service does for closeMessageCleanupJob), ensuring pool.end() always runs.

2. **Railway RAILWAY_DEPLOYMENT_DRAINING_SECONDS value**
   - What we know: STATE.md notes "Railway RAILWAY_DEPLOYMENT_DRAINING_SECONDS must be verified/set to 15s minimum" as a Phase 9 prerequisite. Railway sends SIGTERM then SIGKILL after the configured drain time.
   - What's unclear: What the current setting is (if any) in Railway dashboard.
   - Recommendation: This is operational verification, not code. Document in OPS-01 checklist (Phase 11). The 10-second code timeout is well under any reasonable Railway drain setting (default appears to be 30s based on community posts).

3. **Auth-service cacheManager (Redis) has no close/destroy method**
   - What we know: `CacheManager` class in auth-service has `initialize()` but no `close()`, `disconnect()`, or `destroy()` method.
   - What's unclear: Whether the Redis client keeps the process alive after shutdown.
   - Recommendation: Not in scope for Phase 9 requirements (RESIL-04 specifies server.close + pool.end). The force-exit timer handles any lingering Redis connections. A future enhancement could add a `close()` method to CacheManager.

## Sources

### Primary (HIGH confidence)
- [pg-pool source code](https://github.com/brianc/node-postgres/tree/master/packages/pg-pool) - `end()` method (line 450-461) confirms throwing on double invocation; `_pulseQueue` drains idle clients when `ending=true`
- [node-postgres Pool API docs](https://node-postgres.com/apis/pool) - pool.end() behavior: "drain the pool of all active clients, disconnect them, and shut down any internal timers"
- [Socket.IO Server API docs](https://socket.io/docs/v4/server-api/) - io.close() behavior: "closes the Socket.IO server AND the underlying HTTP server"
- [Express.js Graceful Shutdown guide](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) - server.close() pattern for Express apps
- Local codebase inspection - all three service index.ts files, socket/index.ts, scheduler close functions, cache-manager.ts
- [Node.js server.close() idle connections](https://github.com/nodejs/node/issues/51677) - Since Node.js 18.19.0, server.close() calls closeIdleConnections()

### Secondary (MEDIUM confidence)
- [Railway Deployment Teardown docs](https://docs.railway.com/guides/deployment-teardown) - SIGTERM -> drain -> SIGKILL lifecycle
- [Railway NodeJS SIGTERM Handling docs](https://docs.railway.com/deployments/troubleshooting/nodejs-sigterm) - Railway-specific signal handling
- [RisingStack Graceful Shutdown guide](https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/) - Guard flag pattern, force-exit timeout best practices
- [Socket.IO graceful shutdown discussion #5030](https://github.com/socketio/socket.io/discussions/5030) - io.close() vs httpServer.close() for Socket.IO apps

### Tertiary (LOW confidence)
- None. All findings verified against source code or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; all methods (server.close, pool.end, io.close) verified in source code and official docs
- Architecture: HIGH - shutdown patterns are well-established; pg-pool double-end behavior confirmed by reading source code; io.close closing HTTP server confirmed by Socket.IO docs
- Pitfalls: HIGH - all pitfalls verified against actual codebase state and library source code; profile-service module-scope handler issue visible in current code

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable; no API changes expected in pg-pool, Socket.IO, or Node.js http)
