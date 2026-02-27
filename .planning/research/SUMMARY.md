# Project Research Summary

**Project:** VLVT Dating App — v2.0 Beta Readiness
**Domain:** Operational resilience, accessibility, and UX polish for existing Flutter/Node.js dating app
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

VLVT v2.0 is a hardening milestone, not a feature milestone. The app has working core functionality but five P2 gaps identified in a Board of Directors review: incomplete database resilience, missing graceful shutdown handling, inadequate accessibility tooltips on icon buttons, and inconsistent page transition animations. The defining characteristic of this work is that every required pattern is already well-documented and partially implemented — the job is completing and standardizing what exists rather than inventing new approaches. No new npm packages are needed for the backend. No new Flutter packages are needed for the frontend. All four areas use existing language and framework primitives.

The recommended approach is to treat backend and frontend work as fully independent parallel tracks. Within the backend track, the shared pool factory and graceful shutdown utility must be built first in `@vlvt/shared`, then integrated into all three services (auth, profile, chat) simultaneously. Within the frontend track, page transition utilities and tooltip additions are completely independent and can be parallelized. This structure enables 2-4 agent parallelism that completes all five P2 items without sequential blocking.

The primary risks are subtle integration pitfalls rather than unknowns: custom page routes breaking existing Hero animations if not extended from `PageRoute` properly, `pool.end()` hanging indefinitely without a force-exit timeout, duplicate screen reader announcements if tooltips are added to `IconButton` instances that already have `Semantics` wrappers, and Railway silently swallowing SIGTERM when services start via `npm start` instead of `node dist/index.js` directly. All risks have confirmed mitigations from official documentation and node-postgres issue trackers.

---

## Key Findings

### Recommended Stack

The entire v2.0 milestone uses zero new dependencies. The `pg` Pool (v8.16.3, already installed) has all resilience options needed — `min`, `maxLifetimeSeconds`, and `allowExitOnIdle` — built in since v8.12+. Node.js `http.Server.close()` and `Pool.end()` are the official Express-recommended graceful shutdown primitives. Flutter's built-in `PageRouteBuilder` and `IconButton.tooltip` property handle the frontend work without any pub.dev packages.

**Core technologies:**
- **pg Pool (^8.16.3):** Database connection pooling — already installed; add `min: 2`, `maxLifetimeSeconds: 1800`, `connectionTimeoutMillis: 5000` to existing config; no new package needed
- **Node.js http.Server:** Graceful shutdown — native, zero dependencies; Express official docs explicitly recommend this pattern over any third-party library
- **Flutter PageRouteBuilder / PageRoute:** Custom page transitions — SDK-native; two ~20-line utility classes replace all existing custom transition boilerplate across 22+ navigation calls
- **Flutter IconButton.tooltip:** Accessibility — built-in property that simultaneously provides the visual tooltip and semantic label for TalkBack/VoiceOver; no Semantics wrapper needed
- **`@vlvt/shared` (existing):** Shared backend utilities — already used by all 3 services; add `createResilientPool()` and `registerGracefulShutdown()` factory functions here to eliminate copy-pasted pool setup

**What NOT to add:** `postgres-pool`, PgBouncer, `http-terminator`, `lightship`, `stoppable`, `page_transition` pub.dev package, `Semantics` wrappers around `IconButton`. Each was evaluated and rejected as unnecessary complexity at beta scale.

### Expected Features

This milestone has unusually clear scope: five table-stakes operational items that complete partially-implemented patterns already present in the codebase. There are no ambiguous "should have" features — the codebase audit precisely identifies what is missing at the file and line level.

**Must have (table stakes — all five P2 items):**
- **Resilient DB pool error handling** — `pool.on('error')` exists but only catches idle client errors; checked-out client errors during transactions can crash the process; fix requires attaching error handlers to clients and increasing `connectionTimeoutMillis` from 2s to 5s for Railway cold starts
- **Graceful shutdown on all three services** — auth-service has zero signal handlers; profile-service has schedulers but no `server.close()` or `pool.end()`; chat-service has `server.close()` but no `pool.end()`; all three leak DB connections on every Railway deploy
- **Tooltips on 20 identified IconButtons** — ~20 buttons across 14 files are missing the `tooltip:` property; without it, screen readers announce "button" with no context, which is a WCAG 2.1 Level A failure (1.1.1 Non-text Content)
- **VlvtPageRoute and VlvtFadeRoute utilities** — 22 `MaterialPageRoute` calls and 11 existing `PageRouteBuilder` boilerplate instances consolidated into two reusable route classes matching the app's established `Curves.easeOutCubic` style
- **Railway RAILWAY_DEPLOYMENT_DRAINING_SECONDS config** — must be set to 15s minimum; currently unverified but defaults to 0s (SIGKILL immediately follows SIGTERM), which defeats all graceful shutdown work

**Should have (differentiators — defer post-beta):**
- Circuit breaker pattern for DB (backoff retry is sufficient for beta scale)
- Pool utilization metrics in Sentry (health endpoint pool stats are sufficient)
- Hero transitions for profile photos (Hero tags exist in codebase, no matching transitions yet)
- Staggered list animations for match/chat lists

**Defer (v2+):**
- Full WCAG AA audit (tooltips are the P2 item; broader accessibility audit is post-launch)
- Focus management in modals (best practice but not blocking)
- Live region announcements for new chat messages
- i18n for tooltip strings (relevant when adding multi-language support)
- PgBouncer (appropriate at 10K+ concurrent connections, not at beta scale)

### Architecture Approach

The architecture is additive, not structural. All four capabilities are surgically inserted into the existing Express microservices and Flutter widget tree. Two shared utility functions go into the already-present `@vlvt/shared` package, reducing each service's pool setup from ~30 lines to ~4 lines. Two Flutter utility classes go into a new `frontend/lib/utils/page_transitions.dart` file, replacing all custom `PageRouteBuilder` boilerplate. Tooltips are 1-line property additions to existing `IconButton` widgets — no new component abstraction required.

**Major components:**
1. **`@vlvt/shared` additions** — `createResilientPool()` factory consolidates identical pool config duplicated across 3 services; `registerGracefulShutdown()` provides ordered SIGTERM/SIGINT handling with force-exit timeout and guard against double invocation
2. **Three backend service `index.ts` files** — each replaces ~30 lines of pool boilerplate with `createResilientPool()` call; adds or replaces shutdown handlers with `registerGracefulShutdown()` plus service-specific background job cleanup
3. **`frontend/lib/utils/page_transitions.dart`** — `VlvtPageRoute<T>` (slide-from-right, `easeOutCubic`) and `VlvtFadeRoute<T>` (crossfade); must extend `PageRoute<T>` not `PageRouteBuilder` to preserve existing Hero animation compatibility
4. **14 frontend screen/widget files** — `tooltip: 'description'` property added to each of the 20 identified `IconButton` instances; existing `Semantics` wrappers audited and removed where they would create duplicate screen reader announcements

**Key data flow change:** Service shutdown now has an explicit ordered sequence — `server.close()` then background job cleanup then `pool.end()` then `process.exit(0)`, with a 10s force-kill timeout if any step stalls. The ordering is critical: reversing `server.close()` and `pool.end()` causes in-flight requests to fail with connection errors.

### Critical Pitfalls

1. **`pool.on('error')` does not catch checked-out client errors** — The handler only fires for idle client errors. Active clients during transactions emit errors independently; without a client-level handler, Node.js raises an unhandled error and crashes the process. Mitigation: prefer `pool.query()` over `pool.connect()`; when `pool.connect()` is used, attach an error handler to the returned client before use.

2. **Custom `PageRouteBuilder` silently breaks existing Hero animations** — `PageRouteBuilder` does not guarantee `opaque: true` and `maintainState: true`. Hero animations degrade to no animation with no error in the console. Three active Hero tags exist in the codebase (`discovery_profile_card.dart`, `chats_screen.dart`, `chat_screen.dart`). Mitigation: `VlvtPageRoute` must extend `PageRoute<T>` and explicitly override `opaque => true` and `maintainState => true`.

3. **Railway silently kills process before shutdown completes when started via `npm start`** — npm becomes PID 1 and exits itself on SIGTERM without waiting for the Node.js child process. All graceful shutdown logic is bypassed. Mitigation: change Railway Custom Start Command from `npm start` to `node dist/index.js` for all three services and verify during Phase 2.

4. **`pool.end()` called twice throws an unhandled error** — Both SIGTERM and SIGINT handlers call shutdown logic. If an `isShuttingDown` guard flag is missing, the second call throws "Called end on pool more than once," which crashes the process. Mitigation: single boolean guard at top of shutdown handler with early return if already running.

5. **Adding tooltip to `IconButton` with existing `Semantics` wrapper creates duplicate screen reader announcements** — The codebase already has `Semantics` wrappers on action buttons (`discovery_action_buttons.dart`, `vlvt_button.dart`, `main_screen.dart`, `matches_screen.dart`). Adding `tooltip:` to these buttons creates double-reads in TalkBack. Mitigation: audit each of the 20 identified `IconButton` instances for existing `Semantics` ancestors before adding the tooltip property; remove the `Semantics` wrapper where the tooltip is sufficient.

---

## Implications for Roadmap

The dependency graph is clear and supports significant parallelism. The entire backend track is independent from the entire frontend track. Within the backend, shared utilities must precede service integration. Within the frontend, the two tasks have zero file overlap and can run in parallel.

### Phase 1: Shared Backend Utilities

**Rationale:** `@vlvt/shared` additions (`createResilientPool()` and `registerGracefulShutdown()`) are compile-time prerequisites for all three backend service updates. The shared package must be built before any service can import from it. This phase can begin immediately with no other dependencies.
**Delivers:** Two utility functions in `backend/shared/src/utils/`, exported from `backend/shared/src/index.ts`, with the shared package compiled and ready for service integration
**Addresses:** Eliminates copy-paste pool config across 3 services; provides consistent shutdown ordering with force-exit timeout and double-invocation guard
**Avoids:** Pitfall 4 (double `pool.end()`) by centralizing the `isShuttingDown` guard; Pitfall 11 (shared module scope creep) by keeping factory logic in shared and service-specific policy in each service

### Phase 2: Backend Service Integration

**Rationale:** Depends on Phase 1 (shared package must be built first). Once shared utilities are ready, all three services can be updated simultaneously — they share no source code, so the parallelism is clean. Each service update is a ~4-line pool replacement and a ~10-line shutdown handler addition or replacement.
**Delivers:** All three services with resilient pool config, proper SIGTERM/SIGINT handling, `pool.end()` on shutdown, force-exit timeout, and verified Railway start commands
**Uses:** `createResilientPool()` and `registerGracefulShutdown()` from Phase 1; Railway Custom Start Command changed to `node dist/index.js`
**Implements:** Per-service shutdown sequences — auth-service: add from scratch; profile-service: add `server.close()` and `pool.end()` to existing scheduler cleanup; chat-service: add `pool.end()` and explicit `io.close()`
**Avoids:** Pitfall 3 (Railway npm start); Pitfall 17 (auth-service has zero handlers); Pitfall 18 (profile-service drops requests on shutdown)

### Phase 3: Flutter Page Transitions

**Rationale:** Fully independent of backend work. Can run in parallel with Phases 1 and 2. The utility file must be created before any screen file migrations — create `page_transitions.dart` first, then replace navigation calls in a single pass across all affected screens to avoid the inconsistency pitfall.
**Delivers:** `frontend/lib/utils/page_transitions.dart` with `VlvtPageRoute<T>` and `VlvtFadeRoute<T>`; all 22+ `MaterialPageRoute` calls and existing `PageRouteBuilder` boilerplate consolidated; Hero animations verified still working
**Avoids:** Pitfall 5 (Hero animation breakage) — extend `PageRoute<T>` not `PageRouteBuilder`; Pitfall 10 (pop return values lost) — preserve generic `<T>` type parameter; Pitfall 9 (inconsistent mix) — migrate all routes in single pass

### Phase 4: Flutter Tooltip Accessibility

**Rationale:** Fully independent of all other phases. Can run in parallel with Phases 1, 2, and 3. Low risk and mechanical — add `tooltip: 'description'` to each of the 20 identified `IconButton` instances. The FEATURES.md inventory provides the exact file path and line number for each.
**Delivers:** WCAG 2.1 Level A compliance for non-text content (criterion 1.1.1); all identified IconButtons readable by TalkBack and VoiceOver with descriptive labels
**Addresses:** The 20-button inventory in FEATURES.md (`after_hours_chat_screen.dart`, `chat_screen.dart`, `discovery_screen.dart`, `paywall_screen.dart`, `profile_screen.dart`, etc.)
**Avoids:** Pitfall 6 (duplicate announcements from Semantics + tooltip) — check ancestors before adding each tooltip; Pitfall 8 (TalkBack not reading) — remove conflicting `Icon.semanticLabel` where tooltip supersedes it; Pitfall 7 (semantics traversal order) — use `find.byTooltip()` in tests, not `find.bySemanticsLabel()`

### Phase Ordering Rationale

- Phase 1 before Phase 2: compile dependency — `@vlvt/shared` must build before services import from it
- Phases 3 and 4 are independent of Phases 1-2 (frontend vs backend) and independent of each other (no shared files)
- All four phases can be assigned to 2 agents (backend agent: Phases 1 and 2 sequentially; frontend agent: Phases 3 and 4 in parallel) or 4 agents (one per phase, with Phase 2 agent waiting on Phase 1)
- No phase requires UX discovery or novel research — all patterns are verified and the specific files and lines are identified in the research documents

### Research Flags

All phases have standard, well-documented patterns. No additional `/gsd:research-phase` is needed during planning.

- **Phase 1 (Shared Utilities):** pg Pool API and Express shutdown are officially documented with full code examples; patterns are explicit in STACK.md and ARCHITECTURE.md
- **Phase 2 (Service Integration):** Railway SIGTERM behavior is confirmed via Railway docs; the three service `index.ts` files are fully mapped in ARCHITECTURE.md
- **Phase 3 (Page Transitions):** Flutter `PageRoute` API is documented; Hero compatibility requirement is confirmed in PITFALLS.md with issue references
- **Phase 4 (Tooltips):** Flutter `IconButton.tooltip` is documented; the 20 target buttons are listed with file path and line number in FEATURES.md

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are existing stack components with no new dependencies; official docs confirm all required configuration options exist in currently installed versions; alternatives evaluated and rejected with documented rationale |
| Features | HIGH | Codebase audit identified exact files and line numbers for all gaps; feature scope is bounded by the 5 P2 items from the Board review; no ambiguity about what is in vs out of scope |
| Architecture | HIGH | Patterns are additive to the existing architecture with no structural changes; shared module already exists and is used by all services; component boundaries and integration points are explicit |
| Pitfalls | HIGH | 15 of 18 pitfalls rated HIGH confidence based on official docs, node-postgres GitHub issues, and direct codebase analysis; 3 rated MEDIUM (circuit breaker timer interaction, health check hysteresis thresholds, specific UptimeRobot configuration) |

**Overall confidence:** HIGH

### Gaps to Address

- **Railway RAILWAY_DEPLOYMENT_DRAINING_SECONDS:** Noted as "UNKNOWN" in FEATURES.md — not verified whether this variable is set in any of the three Railway service configurations. Must be verified and set to 15s minimum at the start of Phase 2. If missing, all graceful shutdown work is moot.
- **Railway Custom Start Commands:** The PITFALLS research confirms services likely use `npm start`; the exact current Railway configuration is unverified. Must-verify at the start of Phase 2 — incorrect start commands silently defeat all shutdown logic.
- **`pool.connect()` usage in service code:** STACK research recommends preferring `pool.query()` over `pool.connect()` to avoid uncaught checked-out client errors (Pitfall 1). The full codebase audit of which routes use `pool.connect()` directly is not in the research files. Phase 2 should include a grep for `pool.connect()` usage and attach client-level error handlers where found.
- **TalkBack tooltip behavior on target beta devices:** Flutter issue #167174 (P2, open) indicates some Android TalkBack versions do not read `IconButton` tooltips correctly. The tooltip approach is still correct, but testing on a real Android device with TalkBack is required during Phase 4 validation. If affected, fallback is `Semantics(label: '...', child: IconButton(...))` — but add only after device testing confirms the issue.

---

## Sources

### Primary (HIGH confidence)

- [node-postgres Pool API](https://node-postgres.com/apis/pool) — Pool configuration options (`maxLifetimeSeconds`, `min`, `allowExitOnIdle`), event semantics, `pool.end()` behavior
- [node-postgres Issues #1324, #1858, #1635, #2641, #3202, #3287](https://github.com/brianc/node-postgres/issues) — Idle client error handling, double `pool.end()`, checked-out client errors, self-healing behavior confirmed by maintainers
- [Express Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) — Official Express recommendation for native `server.close()` pattern without third-party libraries
- [Railway SIGTERM documentation](https://docs.railway.com/deployments/troubleshooting/nodejs-sigterm) — npm/PID 1 SIGTERM forwarding issue; `node dist/index.js` fix
- [Flutter PageRouteBuilder API](https://api.flutter.dev/flutter/widgets/PageRouteBuilder-class.html) — Route builder pattern; opaque and maintainState properties
- [Flutter Tooltip API](https://api.flutter.dev/flutter/material/Tooltip-class.html) — `tooltip` property as semantic label; screen reader behavior
- [Flutter Accessibility Docs](https://docs.flutter.dev/ui/accessibility/assistive-technologies) — TalkBack/VoiceOver integration
- [Flutter Tooltip Semantics Order Breaking Change](https://docs.flutter.dev/release/breaking-changes/tooltip-semantics-order) — Semantics tree structure change in Flutter 3.19+
- [Flutter Cookbook: Page Route Animation](https://docs.flutter.dev/cookbook/animation/page-route-animation) — PageRouteBuilder with SlideTransition example
- [Flutter issue #25261](https://github.com/flutter/flutter/issues/25261) — Hero animation compatibility with custom routes
- VLVT codebase direct analysis — `backend/*/src/index.ts` (pool config, signal handlers), `frontend/lib/screens/*.dart` (navigation patterns, IconButton inventory)

### Secondary (MEDIUM confidence)

- [DCM: Practical Accessibility in Flutter (2025)](https://dcm.dev/blog/2025/06/30/accessibility-flutter-practical-tips-tools-code-youll-actually-use) — `tooltip:` as primary IconButton accessibility approach
- [Flutter issue #167174: TalkBack tooltip reading](https://github.com/flutter/flutter/issues/167174) — Open P2; some Android TalkBack versions do not read tooltips; behavior varies by Android version
- [Flutter issue #148167: IconButton Semantics + tooltip](https://github.com/flutter/flutter/issues/148167) — Duplicate announcement behavior when Semantics wrapper and tooltip coexist
- [Railway Database Connection Pooling Guide](https://blog.railway.com/p/database-connection-pooling) — Railway-specific pool recommendations
- [Node.js Connection Pooling Best Practices 2026](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view) — Production pool config patterns
- [O'Reilly: Microservices Antipatterns](https://www.oreilly.com/content/microservices-antipatterns-and-pitfalls/) — Shared library coupling blast radius

---

*Research completed: 2026-02-27*
*Ready for roadmap: yes*
