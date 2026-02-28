---
phase: 12-shutdown-ordering-fix
verified: 2026-02-28T03:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 12: Shutdown Ordering Fix — Verification Report

**Phase Goal:** server.close() completes before pool.end() runs in auth-service and profile-service, preventing 500 errors on in-flight requests during Railway redeploys
**Verified:** 2026-02-28
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Auth-service awaits server.close() completion before calling pool.end() | VERIFIED | `await new Promise<void>` wraps `server.close` at line 3673; `pool.end()` follows sequentially at line 3690 |
| 2 | Profile-service awaits server.close() completion before calling pool.end() | VERIFIED | `await new Promise<void>` wraps `server.close` at line 1840; `pool.end()` follows at line 1868 after scheduler cleanup |
| 3 | In-flight HTTP requests complete before the database pool is torn down during shutdown | VERIFIED | Promise wrapper blocks until `server.close` callback fires; `pool.end()` is unreachable until Promise resolves or is caught |
| 4 | server.close() errors are caught and logged without preventing pool.end() cleanup | VERIFIED | Both files: `reject(err)` in callback + `} catch {` after Promise block; pool.end() proceeds regardless |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/auth-service/src/index.ts` | Promise-wrapped server.close() in gracefulShutdown | VERIFIED | Contains `await new Promise<void>((resolve, reject) => { server.close((err) =>` at lines 3673-3682; substantive, not a stub |
| `backend/profile-service/src/index.ts` | Promise-wrapped server.close() in gracefulShutdown | VERIFIED | Contains identical pattern at lines 1840-1850; scheduler cleanup preserved between server.close and pool.end |

Both artifacts: exist, are substantive (full implementation matching plan spec), and are wired (referenced by process.on SIGTERM/SIGINT handlers at lines 3699-3700 and 1877-1878 respectively).

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `gracefulShutdown()` | `server.close()` | `await new Promise` wrapper | WIRED | Auth-service line 3673: `await new Promise<void>((resolve, reject) => { server.close((err) =>` |
| `gracefulShutdown()` | `server.close()` | `await new Promise` wrapper | WIRED | Profile-service line 1840: identical pattern |
| `server.close()` completion | `pool.end()` | sequential await (server closes before pool) | WIRED | Auth-service: server.close block ends line 3686, pool.end() at line 3690 — sequential, not concurrent |
| `server.close()` completion | `pool.end()` | sequential await (server closes before pool) | WIRED | Profile-service: server.close block ends line 1853, schedulers 1856-1864, pool.end() at line 1868 |
| `gracefulShutdown()` | `process.on('SIGTERM'/'SIGINT')` | event handler registration | WIRED | Both files register signal handlers after function definition |

**Anti-pattern absent:** `grep -n "server.close(() =>"` returns zero matches in both files. Fire-and-forget pattern eliminated.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RESIL-04 | 12-01-PLAN.md | Auth-service handles SIGTERM/SIGINT with graceful shutdown (server.close + pool.end) | SATISFIED | auth-service gracefulShutdown awaits server.close() via Promise before pool.end(); SIGTERM/SIGINT registered at lines 3699-3700 |
| RESIL-05 | 12-01-PLAN.md | Profile-service shutdown handler includes pool.end() and server.close() | SATISFIED | profile-service gracefulShutdown awaits server.close() before schedulers and pool.end(); SIGTERM/SIGINT registered at lines 1877-1878 |

**Traceability cross-check:** REQUIREMENTS.md maps both RESIL-04 and RESIL-05 to "Phase 9, Phase 12 (gap closure)" with status "Complete". Phase 12 closes the specific gap (server-close-not-awaited) identified in the v2.0 milestone audit. Both requirements are marked `[x]` in REQUIREMENTS.md.

**Orphaned requirements:** None. REQUIREMENTS.md assigns no additional requirement IDs to Phase 12 beyond RESIL-04 and RESIL-05.

---

### Ordering Verification (Profile-Service)

Line number sequence confirms correct ordering:

| Step | Line | Code |
|------|------|------|
| 1. server.close (awaited) | 1840 | `await new Promise<void>(... server.close(err) ...)` |
| 2. closeMatchingScheduler | 1856 | `await closeMatchingScheduler().catch(...)` |
| 3. closeSessionScheduler | 1859 | `await closeSessionScheduler().catch(...)` |
| 4. closeSessionCleanupJob | 1862 | `await closeSessionCleanupJob().catch(...)` |
| 5. pool.end() | 1868 | `await pool.end()` |
| 6. process.exit(0) | 1874 | `process.exit(0)` |

Line 1840 < 1856 < 1859 < 1862 < 1868 < 1874. Ordering preserved exactly as specified in plan.

---

### TypeScript Compilation

| Service | Result |
|---------|--------|
| auth-service (`npx tsc --noEmit`) | No errors |
| profile-service (`npx tsc --noEmit`) | No errors |

No new TypeScript errors introduced.

---

### Commit Verification

Both commits documented in SUMMARY.md are confirmed present in git history:

| Commit | Message |
|--------|---------|
| `b6d2ca0` | fix(auth-service): await server.close() before pool.end() in graceful shutdown |
| `4d68b4f` | fix(profile-service): await server.close() before schedulers and pool.end() in graceful shutdown |

---

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, empty implementations, or stubs detected near shutdown code in either file. Empty `catch` block after the Promise wrapper is intentional (documented in plan comments: "server.close error logged above; continue with pool cleanup").

---

### Human Verification Required

None. The fix is a deterministic sequential ordering of async operations — verifiable statically by inspection of the shutdown code. No visual, real-time, or external service behavior to validate.

The only runtime concern (keep-alive connections causing server.close to hang) is already mitigated by the pre-existing 10-second force-exit timer, which is confirmed present in both files (auth-service line 3665, profile-service line 1832).

---

## Summary

Phase 12 achieved its goal completely. Both auth-service and profile-service graceful shutdown handlers now await `server.close()` via a Promise wrapper before proceeding to `pool.end()`. The fix is:

- Surgical: 7 lines changed per service, no structural changes
- Correct: Error path handled (reject + catch ensures pool.end() always runs)
- Ordered: Profile-service scheduler cleanup remains between server.close and pool.end
- Clean: Zero TypeScript errors, no anti-patterns, both commits verified

Requirements RESIL-04 and RESIL-05 are fully satisfied. The `server-close-not-awaited` gap from the v2.0 milestone audit is closed.

---

_Verified: 2026-02-28_
_Verifier: Claude (gsd-verifier)_
