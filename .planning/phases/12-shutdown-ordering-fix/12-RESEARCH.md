# Phase 12: Shutdown Ordering Fix - Research

**Researched:** 2026-02-27
**Domain:** Node.js HTTP server graceful shutdown ordering
**Confidence:** HIGH

## Summary

Phase 12 fixes a specific, well-documented bug in auth-service and profile-service: `server.close()` is called fire-and-forget (callback-style, not awaited) before `pool.end()`. Because `server.close(callback)` is non-blocking, `pool.end()` executes immediately while in-flight HTTP requests are still being processed. Those requests may attempt database queries against a closed pool, resulting in 500 errors during Railway redeploys.

The fix is straightforward: wrap `server.close()` in a `new Promise()` and `await` it before calling `pool.end()`. This ensures the HTTP server finishes draining all in-flight requests before the database pool is torn down. No new dependencies are needed. The identical pattern applies to both affected services.

**Primary recommendation:** Wrap `server.close(callback)` in a Promise and `await` it. Move `pool.end()` and `process.exit(0)` into the resolution path so they only run after all in-flight requests complete.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RESIL-04 | Auth-service handles SIGTERM/SIGINT with graceful shutdown (server.close + pool.end) | Fix ordering so server.close **completes** before pool.end runs; Promise wrapper pattern documented in Code Examples |
| RESIL-05 | Profile-service shutdown handler includes pool.end() and server.close() | Same Promise wrapper fix; profile-service also has scheduler cleanup between server.close and pool.end which is already correct |
</phase_requirements>

## Standard Stack

### Core

No new libraries needed. This phase modifies existing code using only Node.js built-in APIs.

| API | Version | Purpose | Why Standard |
|-----|---------|---------|--------------|
| `http.Server.close(callback)` | Node.js 18+ (Dockerfile: `node:18-alpine`) | Stops accepting new connections, waits for in-flight to finish | Built-in Node.js; callback fires when all connections have closed |
| `Promise` | ES6 (built-in) | Wrap callback-based `server.close()` for async/await | Standard JavaScript; no library needed |

### Supporting

| API | Version | Purpose | When to Use |
|-----|---------|---------|-------------|
| `http.Server.closeAllConnections()` | Node.js 18.2+ | Force-close all connections including keep-alive | Only if needed for edge cases; the 10s force-exit timer already covers this |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual Promise wrapper | `util.promisify(server.close.bind(server))` | `util.promisify` works but requires `.bind(server)` to preserve `this` context; manual wrapper is clearer and more explicit about error handling |
| Manual Promise wrapper | `http-graceful-shutdown` npm package | Adds external dependency; overkill for a 5-line fix on two files |
| Manual Promise wrapper | `node-graceful-shutdown` npm package | Same concern; project has a "no new npm dependencies" constraint in REQUIREMENTS.md Out of Scope |

**Installation:** None required.

## Architecture Patterns

### Current Structure (Buggy)

```
gracefulShutdown():
  1. Set isShuttingDown guard
  2. Start 10s force-exit timer
  3. server.close(callback)  ← fire-and-forget, returns immediately
  4. await pool.end()         ← races with in-flight requests
  5. process.exit(0)          ← exits before server.close callback fires
```

### Fixed Structure

```
gracefulShutdown():
  1. Set isShuttingDown guard
  2. Start 10s force-exit timer
  3. await new Promise(server.close)  ← blocks until in-flight requests complete
  4. [await scheduler cleanup]         ← profile-service only (already correct)
  5. await pool.end()                  ← pool closed AFTER all requests finish
  6. process.exit(0)                   ← clean exit
```

### Pattern 1: Promise-Wrapped server.close()

**What:** Convert callback-based `server.close()` to a Promise for use with async/await
**When to use:** Any async shutdown sequence that must wait for HTTP drain before closing downstream resources

```typescript
// Source: https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view
// + Node.js http.Server.close() documentation

// BEFORE (buggy - fire and forget):
server.close(() => {
  logger.info('HTTP server closed');
});
await pool.end(); // Races! Pool closes while requests still in-flight

// AFTER (correct - awaited):
await new Promise<void>((resolve, reject) => {
  server.close((err) => {
    if (err) {
      logger.error('Error closing HTTP server', { error: err.message });
      reject(err);
    } else {
      logger.info('HTTP server closed');
      resolve();
    }
  });
});
await pool.end(); // Safe - all in-flight requests completed
```

### Profile-Service Scheduler Ordering

The profile-service has an additional concern: background schedulers (`closeMatchingScheduler`, `closeSessionScheduler`, `closeSessionCleanupJob`) run between server.close and pool.end. The current ordering is:

```
server.close → schedulers → pool.end
```

This is correct because schedulers may need DB access. The fix only changes step 1 (server.close) from fire-and-forget to awaited. Steps 2-4 remain unchanged.

### Anti-Patterns to Avoid

- **Moving pool.end() into server.close callback without await:** This would work but loses the try/catch error handling around pool.end() and makes the flow harder to reason about
- **Using server.closeAllConnections() as the primary shutdown:** This force-kills connections without draining; the 10s force-exit timer already handles the timeout case
- **Removing the force-exit timer:** The timer is a safety net; even with proper await, we keep it to handle truly hung connections

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Promise wrapper for server.close | Custom utility module | Inline `new Promise` in each service | Only 2 call sites; a shared utility adds indirection for no reuse benefit |
| Graceful shutdown orchestration | Abstract shutdown manager class | Keep inline shutdown function | Scope is 2 services with slightly different shutdown steps; abstraction premature |

**Key insight:** This is a 5-line fix per service. The existing shutdown structure is correct except for not awaiting server.close(). Keep changes minimal and surgical.

## Common Pitfalls

### Pitfall 1: Forgetting to handle the error parameter in server.close callback

**What goes wrong:** `server.close(callback)` passes an error to the callback if the server is not running. Ignoring this causes unhandled rejections.
**Why it happens:** Developers wrap in Promise but only call `resolve()`, ignoring the error argument.
**How to avoid:** Always check the error parameter: `server.close((err) => { if (err) reject(err); else resolve(); })`
**Warning signs:** Unhandled promise rejection logs during shutdown.

### Pitfall 2: Keep-alive connections preventing server.close from completing

**What goes wrong:** `server.close()` waits for ALL connections to close, including keep-alive connections that may idle for 5-120 seconds.
**Why it happens:** HTTP/1.1 keep-alive is on by default. Clients (or load balancers) may hold connections open.
**How to avoid:** The existing 10-second force-exit timer (`setTimeout(() => process.exit(1), 10000).unref()`) already handles this. Railway sends SIGTERM with a drain period, then force-kills. The timer ensures we don't hang indefinitely.
**Warning signs:** Shutdown logs show "Graceful shutdown timed out after 10s" -- this is the safety net working, not a bug.

### Pitfall 3: server.close() called on a server that hasn't started listening

**What goes wrong:** If `app.listen()` hasn't completed before SIGTERM arrives, `server.close()` may error.
**Why it happens:** SIGTERM can arrive during startup on very fast Railway deployments.
**How to avoid:** Both services gate signal handlers inside the listen callback or after `app.listen()`, so the server reference is always valid.
**Warning signs:** Error in server.close callback during startup.

### Pitfall 4: Double pool.end() from rejected server.close

**What goes wrong:** If server.close rejects, the error propagates and pool.end() might still be called (or skipped, breaking cleanup).
**Why it happens:** Unhandled rejection in the Promise wrapper skips subsequent cleanup.
**How to avoid:** Catch the server.close rejection, log it, but continue with pool.end() cleanup. The guard flag prevents re-entry.
**Warning signs:** "Pool has already been released" errors in logs.

## Code Examples

### Auth-Service Fix (Complete)

```typescript
// Source: auth-service/src/index.ts lines 3671-3684

// CURRENT (buggy):
// Stop accepting new HTTP requests, drain in-flight
server.close(() => {
  logger.info('HTTP server closed');
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
  // server.close error logged above; continue with cleanup
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

### Profile-Service Fix (Complete)

```typescript
// Source: profile-service/src/index.ts lines 1838-1862

// CURRENT (buggy):
// Stop accepting new HTTP requests
server.close(() => {
  logger.info('HTTP server closed');
});

// Close background schedulers
await closeMatchingScheduler().catch(...)
await closeSessionScheduler().catch(...)
await closeSessionCleanupJob().catch(...)

// Close database pool
try {
  await pool.end();
  ...

// FIXED:
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
  // server.close error logged above; continue with cleanup
}

// Close background schedulers (may need DB access, so before pool.end)
await closeMatchingScheduler().catch(...)
await closeSessionScheduler().catch(...)
await closeSessionCleanupJob().catch(...)

// Close database pool
try {
  await pool.end();
  ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `server.close(callback)` fire-and-forget | `await new Promise(resolve => server.close(resolve))` | Always been the correct pattern; Node.js docs never changed | In-flight requests complete before downstream resources close |
| Manual connection tracking | `server.closeAllConnections()` (Node 18.2+) | Node 18.2 (April 2022) | Can force-close keep-alive connections; not needed here due to force-exit timer |

**Deprecated/outdated:**
- Nothing deprecated. `server.close(callback)` is stable and unchanged since Node.js inception.

## Open Questions

1. **Chat-service has the same bug with `io.close()`**
   - What we know: `io.close(callback)` at line 1672 in chat-service is also fire-and-forget, same pattern as the auth/profile bug
   - What's unclear: Whether Phase 12 scope should include chat-service
   - Recommendation: Phase 12 success criteria explicitly names only auth-service and profile-service. The chat-service fix is the same pattern but should be called out as a follow-up or scope expansion decision for the planner. Socket.IO's `io.close()` internally calls `httpServer.close()`, so wrapping it in a Promise works identically.

2. **Railway RAILWAY_DEPLOYMENT_DRAINING_SECONDS setting**
   - What we know: STATE.md notes this must be verified/set to 15s minimum (Phase 9 prerequisite). The 10s force-exit timer depends on this being >= 10s.
   - What's unclear: Whether this has been verified
   - Recommendation: Out of scope for this phase (operational concern documented in PRE-BETA-CHECKLIST.md)

## Sources

### Primary (HIGH confidence)

- **Node.js http.Server.close() docs** - `server.close(callback)` stops accepting new connections; callback fires after all existing connections are closed. Error passed to callback if server was not open. Stable API, no changes across Node 18-24.
- **Existing codebase** - Direct inspection of `backend/auth-service/src/index.ts` (lines 3648-3689), `backend/profile-service/src/index.ts` (lines 1815-1867), `backend/chat-service/src/index.ts` (lines 1643-1689)
- **v2.0 Milestone Audit** (`.planning/v2.0-MILESTONE-AUDIT.md`) - Documents `server-close-not-awaited` gap with severity "low", identifies affected requirements RESIL-04 and RESIL-05
- **Phase 9 Verification** (`.planning/phases/09-backend-service-integration/09-VERIFICATION.md`) - Confirms current shutdown code structure, line numbers, and verification status

### Secondary (MEDIUM confidence)

- [How to Build a Graceful Shutdown Handler in Node.js (2026)](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view) - Confirms Promise wrapper pattern for server.close()
- [Node.js Graceful Shutdown patterns (DEV Community)](https://dev.to/yusadolat/nodejs-graceful-shutdown-a-beginners-guide-40b6) - Confirms `new Promise((resolve, reject) => server.close(...))` as standard pattern
- [Socket.IO server.close() issue #1602](https://github.com/socketio/socket.io/issues/1602) - Confirms io.close() follows same callback pattern as http.Server.close()

### Tertiary (LOW confidence)

- None needed. This is a well-understood Node.js pattern with no ambiguity.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; plain Node.js Promise wrapper on built-in API
- Architecture: HIGH - Direct inspection of both affected files; fix is 5-8 lines per service, surgical change
- Pitfalls: HIGH - Keep-alive hang is the only real concern, already mitigated by existing force-exit timer

**Research date:** 2026-02-27
**Valid until:** Indefinitely - Node.js http.Server.close() API is stable and unchanged
