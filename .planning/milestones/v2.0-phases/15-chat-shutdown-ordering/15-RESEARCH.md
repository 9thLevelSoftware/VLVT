# Phase 15: Chat-Service Shutdown Ordering - Research

**Researched:** 2026-02-27
**Domain:** Socket.IO graceful shutdown ordering in Node.js
**Confidence:** HIGH

## Summary

Phase 15 fixes the same fire-and-forget shutdown bug in chat-service that Phase 12 fixed in auth-service and profile-service: `io.close()` at line 1672 is called with a callback but not awaited, so `pool.end()` executes immediately while Socket.IO connections and the underlying HTTP server are still closing. In-flight REST or WebSocket requests may attempt database queries against a closed pool, causing 500 errors during Railway redeploys.

The chat-service has a twist compared to auth/profile: it uses Socket.IO's `io.close()` instead of raw `http.Server.close()`. The installed Socket.IO 4.8.1's `close()` method is `async` and returns `Promise<void>`, but the Promise resolves BEFORE the underlying HTTP server finishes draining -- it only waits for Socket.IO socket disconnections and adapter close. The `fn` callback is passed through to `httpServer.close(fn)` and fires when the HTTP server fully closes. Since chat-service has ~22 REST endpoints that query the database (matches, messages, blocks, reports, dates, FCM), in-flight HTTP requests are the primary risk, not just WebSocket connections.

The fix wraps `io.close(callback)` in a `new Promise` and awaits it, using the same pattern Phase 12 established for `server.close()`. This ensures both Socket.IO disconnections AND the HTTP server drain complete before `pool.end()` runs.

**Primary recommendation:** Wrap `io.close(callback)` in a `new Promise` and `await` it. This is the same Phase 12 pattern applied to Socket.IO's callback. Do NOT just `await io.close()` without a callback wrapper -- the returned Promise resolves before the HTTP server finishes draining.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RESIL-06 | Chat-service shutdown handler includes pool.end() | Consistency improvement: pool.end() already exists but runs before io.close() completes. Fix ordering so io.close() **completes** before pool.end() runs, using the same Promise wrapper pattern from Phase 12. |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. This phase modifies existing code using only Node.js built-in APIs and the existing Socket.IO dependency.

| API | Version | Purpose | Why Standard |
|-----|---------|---------|--------------|
| Socket.IO `io.close(fn)` | 4.8.1 (installed) | Disconnects all Socket.IO clients, closes adapters, closes underlying HTTP server | Already used in chat-service; callback `fn` fires when HTTP server fully closes |
| `Promise` | ES6 (built-in) | Wrap callback-based `io.close()` for async/await | Standard JavaScript; same pattern as Phase 12 |

### Supporting

None needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual Promise wrapper around `io.close(fn)` | `await io.close()` (no callback) | WRONG: The `async close()` resolves after socket disconnections but BEFORE httpServer.close finishes. In-flight REST requests would still race with pool.end(). |
| Manual Promise wrapper | `util.promisify(io.close.bind(io))` | Unclear behavior since `io.close()` is already async; mixing promisify with async methods is error-prone. Manual wrapper is safer. |

**Installation:** None required.

## Architecture Patterns

### Current Structure (Buggy)

```
chat-service gracefulShutdown():
  1. Set isShuttingDown guard
  2. Start 10s force-exit timer
  3. await closeMessageCleanupJob()   -- correct, awaited
  4. await closeAfterHoursRedisSubscriber()  -- correct, awaited
  5. io.close(callback)                -- BUG: fire-and-forget, returns immediately
  6. await pool.end()                  -- races with in-flight HTTP/WebSocket requests
  7. process.exit(0)                   -- exits before io.close callback fires
```

### Fixed Structure

```
chat-service gracefulShutdown():
  1. Set isShuttingDown guard
  2. Start 10s force-exit timer
  3. await closeMessageCleanupJob()   -- unchanged
  4. await closeAfterHoursRedisSubscriber()  -- unchanged
  5. await new Promise(io.close)      -- blocks until HTTP server fully drained
  6. await pool.end()                 -- pool closed AFTER all requests finish
  7. process.exit(0)                  -- clean exit
```

### Pattern: Promise-Wrapped io.close()

**What:** Convert callback-based `io.close(fn)` to a Promise for use with async/await, capturing the moment the HTTP server fully closes
**When to use:** Chat-service shutdown, where io.close() must complete before downstream resources (database pool) are torn down

```typescript
// Source: Phase 12 pattern adapted for Socket.IO

// BEFORE (buggy - fire and forget):
io.close(() => {
  logger.info('Socket.IO server closed');
});
await pool.end(); // Races! Pool closes while HTTP requests still in-flight

// AFTER (correct - awaited):
try {
  await new Promise<void>((resolve, reject) => {
    io.close((err) => {
      if (err) {
        logger.error('Error closing Socket.IO server', { error: (err as Error).message });
        reject(err);
      } else {
        logger.info('Socket.IO server closed');
        resolve();
      }
    });
  });
} catch {
  // io.close error logged above; continue with pool cleanup
}
await pool.end(); // Safe - all in-flight requests completed
```

### Socket.IO close() Internals (IMPORTANT)

The `io.close(fn)` implementation in Socket.IO 4.8.1 does the following (verified from `node_modules/socket.io/dist/index.js` line 483):

```javascript
async close(fn) {
    // 1. Disconnect all Socket.IO sockets and close adapters (AWAITED)
    await Promise.allSettled([...this._nsps.values()].map(async (nsp) => {
        nsp.sockets.forEach((socket) => {
            socket._onclose("server shutting down");
        });
        await nsp.adapter.close();
    }));
    // 2. Close the engine (sync)
    this.engine.close();
    // 3. Close the HTTP server (NOT AWAITED - callback-based)
    if (this.httpServer) {
        this.httpServer.close(fn);  // <-- fn fires when HTTP server fully closes
    } else {
        fn && fn();
    }
}
```

**Key insight:** The `fn` callback is forwarded to `httpServer.close(fn)`. The error parameter from `httpServer.close` is passed to `fn` exactly like `server.close(callback)` in Phase 12. This means the Promise wrapper pattern is identical.

**Why `await io.close()` alone is insufficient:** The returned Promise resolves after step 2, but step 3 (`httpServer.close(fn)`) only starts -- it doesn't block the async function. In-flight HTTP requests to the chat-service REST endpoints (matches, messages, blocks, reports, dates, FCM) could still be querying the database when `pool.end()` runs.

### Shutdown Order After Fix

```
1. Guard flag (isShuttingDown)           -- prevent double shutdown
2. Force-exit timer (10s, .unref())      -- safety net
3. closeMessageCleanupJob()              -- stop background job (may need DB)
4. closeAfterHoursRedisSubscriber()      -- stop Redis subscriber
5. io.close() via Promise wrapper        -- disconnect sockets + drain HTTP
6. pool.end()                            -- close DB pool (safe now)
7. process.exit(0)                       -- clean exit
```

Steps 3-4 run BEFORE io.close() because they may use the database and we want them to finish cleanly while the pool is still open. Step 5 (io.close) stops new connections. Step 6 (pool.end) tears down the pool after all requests are done.

### Anti-Patterns to Avoid

- **Using `await io.close()` without a callback wrapper:** The returned Promise resolves before the HTTP server finishes draining. This would NOT fix the race condition with in-flight REST requests.
- **Moving pool.end() into the io.close callback:** This would work but loses the try/catch error handling around pool.end() and makes the flow harder to reason about. Also inconsistent with the Phase 12 pattern.
- **Removing the force-exit timer:** The timer is a safety net; even with proper await, we keep it to handle truly hung connections.
- **Changing the order of cleanup/Redis steps:** Steps 3-4 must stay BEFORE io.close because they may need database access.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Promise wrapper for io.close | Custom utility module | Inline `new Promise` wrapper | Only 1 call site; shared utility adds indirection for no reuse benefit |
| Graceful shutdown orchestration | Abstract shutdown manager class | Keep inline shutdown function | Scope is 1 service; abstraction premature |

**Key insight:** This is a 5-8 line fix in a single file. The existing shutdown structure is correct except for not awaiting io.close(). Keep changes minimal and surgical.

## Common Pitfalls

### Pitfall 1: Using `await io.close()` without callback wrapper

**What goes wrong:** The Promise returned by `io.close()` resolves after socket disconnections but BEFORE the HTTP server finishes draining. `pool.end()` then runs while REST requests are still in-flight.
**Why it happens:** Socket.IO's `close()` is `async` but calls `httpServer.close(fn)` without awaiting it. The returned Promise is misleading.
**How to avoid:** Always wrap `io.close(callback)` in a `new Promise` that resolves in the callback. Do NOT rely on the returned Promise alone.
**Warning signs:** 500 errors on REST endpoints during Railway redeploys, even after adding `await`.

### Pitfall 2: Forgetting to handle the error parameter in io.close callback

**What goes wrong:** The callback receives an error if the HTTP server is not running. Ignoring this causes unhandled rejections.
**Why it happens:** Developers wrap in Promise but only call `resolve()`, ignoring the error argument.
**How to avoid:** Always check the error parameter: `io.close((err) => { if (err) reject(err); else resolve(); })`. The error comes from `httpServer.close()`.
**Warning signs:** Unhandled promise rejection logs during shutdown.

### Pitfall 3: Keep-alive connections preventing io.close from completing

**What goes wrong:** `httpServer.close()` (called internally by io.close) waits for ALL connections to close, including keep-alive connections.
**Why it happens:** HTTP/1.1 keep-alive is on by default.
**How to avoid:** The existing 10-second force-exit timer handles this. Railway sends SIGTERM with a drain period, then force-kills.
**Warning signs:** "Graceful shutdown timed out after 10s" in logs -- this is the safety net working, not a bug.

### Pitfall 4: Reordering cleanup steps

**What goes wrong:** If io.close() runs before closeMessageCleanupJob() or closeAfterHoursRedisSubscriber(), those cleanup functions lose database access (because io.close blocks until HTTP drains, and after that pool.end runs).
**Why it happens:** Temptation to "close connections first".
**How to avoid:** Keep the current order: cleanup jobs -> Redis subscriber -> io.close -> pool.end. Jobs and Redis may need DB access during cleanup.
**Warning signs:** Errors in cleanup job or Redis subscriber during shutdown.

## Code Examples

### Chat-Service Fix (Complete)

```typescript
// Source: backend/chat-service/src/index.ts lines 1671-1674

// CURRENT (buggy):
// Close Socket.IO (disconnects all clients AND closes underlying HTTP server)
io.close(() => {
  logger.info('Socket.IO server closed');
});

// Close database pool (drains active clients)
try {
  await pool.end();
  logger.info('Database pool closed');
} catch (err) {
  logger.error('Error closing database pool', { error: (err as Error).message });
}

process.exit(0);

// FIXED:
// Close Socket.IO (disconnects all clients AND closes underlying HTTP server)
try {
  await new Promise<void>((resolve, reject) => {
    io.close((err) => {
      if (err) {
        logger.error('Error closing Socket.IO server', { error: (err as Error).message });
        reject(err);
      } else {
        logger.info('Socket.IO server closed');
        resolve();
      }
    });
  });
} catch {
  // io.close error logged above; continue with pool cleanup
}

// Close database pool (drains active clients)
try {
  await pool.end();
  logger.info('Database pool closed');
} catch (err) {
  logger.error('Error closing database pool', { error: (err as Error).message });
}

process.exit(0);
```

### Auth-Service Reference (Phase 12 Applied Pattern)

```typescript
// Source: backend/auth-service/src/index.ts lines 3671-3686 (already fixed)

// Stop accepting new HTTP requests, wait for in-flight to complete
try {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server', { error: (err as Error).message });
        reject(err);
      } else {
        logger.info('HTTP server closed');
        resolve();
      }
    });
  });
} catch {
  // server.close error logged above; continue with pool cleanup
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `io.close(callback)` fire-and-forget | `await new Promise(resolve => io.close(resolve))` | Always been the correct pattern; Socket.IO callback follows Node.js convention | In-flight requests complete before downstream resources close |
| `await io.close()` (no callback) | `await new Promise(resolve => io.close(resolve))` (with callback) | Socket.IO 4.x made close() async, but the returned Promise doesn't wait for HTTP drain | Must use callback wrapper, not the returned Promise |

**Deprecated/outdated:**
- Nothing deprecated. Socket.IO 4.x `io.close(fn)` callback API is stable.

## Open Questions

None. This is a well-understood pattern directly adapted from Phase 12, with one important nuance (io.close async return vs callback) that is fully documented above.

## Sources

### Primary (HIGH confidence)

- **Socket.IO `io.close()` type definition** - `node_modules/socket.io/dist/index.d.ts` line 343: `close(fn?: (err?: Error) => void): Promise<void>` -- confirms callback signature with optional error parameter
- **Socket.IO `close()` implementation** - `node_modules/socket.io/dist/index.js` lines 483-499: async method that disconnects sockets, closes adapters, then calls `this.httpServer.close(fn)` without awaiting it -- confirms the callback is forwarded to httpServer.close
- **Existing codebase** - Direct inspection of `backend/chat-service/src/index.ts` lines 1643-1689 (gracefulShutdown function with fire-and-forget io.close at line 1672)
- **Phase 12 research and implementation** - `.planning/phases/12-shutdown-ordering-fix/12-RESEARCH.md` and `12-01-SUMMARY.md`: established the Promise wrapper pattern for server.close(), identified chat-service as follow-up
- **Phase 9 implementation** - `.planning/phases/09-backend-service-integration/09-02-SUMMARY.md`: created the chat-service gracefulShutdown handler
- **v2.0 Milestone Audit** - `.planning/v2.0-MILESTONE-AUDIT.md`: documents `chat-io-close-not-awaited` gap (severity: medium) and partial flow status

### Secondary (MEDIUM confidence)

- [Socket.IO Server API docs](https://socket.io/docs/v4/server-api/) - Confirms io.close() callback behavior
- [Socket.IO GitHub issue #1602](https://github.com/socketio/socket.io/issues/1602) - Confirms io.close() follows same callback pattern as http.Server.close()

### Tertiary (LOW confidence)

- None needed. The combination of source code inspection and Phase 12 precedent provides full coverage.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; same Promise wrapper pattern from Phase 12 applied to io.close()
- Architecture: HIGH - Direct inspection of chat-service shutdown code and Socket.IO close() implementation; fix is 5-8 lines, single file
- Pitfalls: HIGH - The `await io.close()` vs callback nuance is the main risk, fully documented with source code evidence

**Research date:** 2026-02-27
**Valid until:** Indefinitely - Socket.IO 4.x io.close() API is stable; the Promise wrapper pattern is a fundamental Node.js idiom
