# Requirements: VLVT

**Defined:** 2026-02-27
**Core Value:** When beta users sign up, their data must be secure, their privacy protected, and the app must not fail in ways that expose them to harm or embarrassment.

## v2.0 Requirements

Requirements for Beta Readiness milestone. Each maps to roadmap phases.

### Backend Resilience

- [x] **RESIL-01**: All services use a shared resilient DB pool with error handling that prevents process crashes on idle client errors
- [x] **RESIL-02**: DB connection timeout is increased from 2s to 5s to handle Railway cold starts
- [x] **RESIL-03**: Pool configuration (max connections, idle timeout, SSL) is centralized in one shared utility
- [x] **RESIL-04**: Auth-service handles SIGTERM/SIGINT with graceful shutdown (server.close + pool.end)
- [x] **RESIL-05**: Profile-service shutdown handler includes pool.end() and server.close()
- [x] **RESIL-06**: Chat-service shutdown handler includes pool.end()
- [x] **RESIL-07**: All services have a 10-second force-exit timeout to prevent hung shutdowns

### Accessibility

- [ ] **A11Y-01**: VlvtIconButton widget accepts and renders a tooltip parameter
- [ ] **A11Y-02**: All 20 identified IconButtons have descriptive action tooltips (e.g., "Send message", "Go back", "Close")
- [ ] **A11Y-03**: Tooltips do not create duplicate screen reader announcements where Semantics wrappers already exist

### UX Polish

- [x] **UX-01**: Shared VlvtPageRoute provides slide-from-right transition for forward navigation
- [x] **UX-02**: Shared VlvtFadeRoute provides crossfade transition for modal/overlay screens
- [x] **UX-03**: All ~22 plain MaterialPageRoute calls are replaced with VlvtPageRoute or VlvtFadeRoute
- [x] **UX-04**: Existing Hero animations continue to work with custom page routes

### Operations

- [ ] **OPS-01**: Pre-beta operations checklist documents all operational prerequisites (backup validation, monitoring, security, external services)

## Future Requirements

Deferred to post-beta. Tracked but not in current roadmap.

### Performance

- **PERF-01**: Pool stats exposed in /health endpoint (totalCount, idleCount, waitingCount)
- **PERF-02**: Query retry logic for transient SELECT failures with exponential backoff

### Accessibility

- **A11Y-04**: TalkBack testing on real Android devices (Flutter issue #167174 caveat)
- **A11Y-05**: Full accessibility audit beyond tooltips (contrast, focus order, screen reader flow)

## Out of Scope

| Feature | Reason |
|---------|--------|
| pg package upgrade (8.16.3 -> 8.19.0) | Current version has all needed features; upgrade adds risk without benefit |
| Custom retry wrappers for DB queries | pg Pool handles reconnection internally; custom retry adds complexity |
| New npm/Flutter dependencies | All features achievable with existing libraries |
| Railway start command changes | Operational verification, not code change; document in ops checklist |
| SOC 2 certification | Not required for beta |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RESIL-01 | Phase 8 | Complete |
| RESIL-02 | Phase 8 | Complete |
| RESIL-03 | Phase 8 | Complete |
| RESIL-04 | Phase 9 | Complete |
| RESIL-05 | Phase 9 | Complete |
| RESIL-06 | Phase 9 | Complete |
| RESIL-07 | Phase 9 | Complete |
| A11Y-01 | Phase 11 | Pending |
| A11Y-02 | Phase 11 | Pending |
| A11Y-03 | Phase 11 | Pending |
| UX-01 | Phase 10 | Complete |
| UX-02 | Phase 10 | Complete |
| UX-03 | Phase 10 | Complete |
| UX-04 | Phase 10 | Complete |
| OPS-01 | Phase 11 | Pending |

**Coverage:**
- v2.0 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation*
