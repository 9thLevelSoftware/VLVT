# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 -- Beta Readiness

**Shipped:** 2026-02-28
**Phases:** 9 | **Plans:** 14

### What Was Built
- Centralized resilient DB pool factory (`createPool`) with 5s Railway cold-start timeout
- Graceful shutdown across all 3 services: server/io.close (awaited) -> pool.end -> exit with 10s safety net
- VlvtPageRoute (slide-from-right) and VlvtFadeRoute (crossfade) replacing all 33 MaterialPageRoute calls
- Screen reader tooltips on all IconButtons with no duplicate Semantics wrappers
- Pre-beta operations checklist consolidating all launch prerequisites
- Fixed 22 pre-existing test failures and cleaned tech debt (orphaned widget, informal IDs, doc alignment)

### What Worked
- **Audit-driven development**: Running `/gsd:audit-milestone` after initial phases identified 5 integration gaps that became phases 12-16. Without the audit, these would have been latent production bugs
- **Gap closure pattern**: Small focused phases (12, 13, 15, 16) with 1 plan each were fast to plan and execute -- average <5 minutes per phase
- **Backend/frontend independence**: Phases 10-11 (frontend) ran independently of phases 8-9 (backend), enabling natural parallelism
- **Consistent shutdown pattern**: Promise-wrapping server.close/io.close established in Phase 12, then applied identically in Phase 15 -- pattern reuse reduced Phase 15 to a 1-minute execution

### What Was Inefficient
- **Multiple audit rounds**: Needed 3 audit passes (initial, re-audit after phases 12-13, final after 14-16) because early phases exposed new gaps. Could frontload more thorough analysis
- **Documentation phases bloat**: Phases 14 and 16 were purely documentation fixes. The SUMMARY frontmatter backfill (14-01) touched 65 files for a metadata-only change. Could have automated this earlier
- **ROADMAP formatting drift**: Phase 16 existed solely to fix ROADMAP row alignment issues introduced by earlier phases. Stricter formatting validation during execution would prevent this

### Patterns Established
- **Promise-wrapping for callback-based close()**: `new Promise((resolve, reject) => { server.close((err) => err ? reject(err) : resolve()); })` with empty catch to ensure subsequent cleanup runs
- **Guard flag pattern**: `isShuttingDown` boolean prevents double pool.end() on repeated SIGTERM
- **Signal handlers gated behind NODE_ENV !== 'test'**: Prevents Jest interference with SIGTERM handlers
- **VlvtPageRoute/VlvtFadeRoute convention**: Slide for forward navigation, fade for modals/overlays
- **Phase numbering continues across milestones**: v2.0 started at Phase 8, continuing from v1.1's Phase 7

### Key Lessons
1. **Run audits early and often** -- the first audit found integration gaps that would have been production bugs. Don't wait until all phases are "done" to audit
2. **Small gap-closure phases are efficient** -- 1-plan phases with 1-2 tasks execute in minutes and keep scope tight
3. **Documentation-only phases are a smell** -- if you need a phase just to fix docs, the doc generation in earlier phases was insufficient
4. **Promise-wrap everything you await** -- Node.js server.close() and io.close() return ambiguous values; explicit Promise wrappers are safer than util.promisify
5. **Empty catch blocks are intentional** -- when cleanup must continue regardless of prior step failure, document the empty catch with a comment

### Cost Observations
- Model mix: ~80% sonnet (planners, executors, checkers), ~20% opus (orchestration, verification)
- v2.0 completed in 2 calendar days, ~56 commits
- Notable: Gap closure phases (12-16) were cheaper than initial phases (8-11) due to pattern reuse

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 28 | Initial GSD adoption; greenfield feature development |
| v1.1 | 7 | 50 | Hardening focus; audit-driven requirements; highest plan density |
| v2.0 | 9 | 14 | Operational resilience; audit-gap-closure workflow; smallest plans per phase |

### Cumulative Quality

| Milestone | Tests | Key Quality Win |
|-----------|-------|-----------------|
| v1.0 | ~200 | Feature coverage, happy paths |
| v1.1 | 477 | Security regression, safety flows, edge cases |
| v2.0 | 477 (all passing) | Fixed 22 pre-existing failures, DB resilience |

### Top Lessons (Verified Across Milestones)

1. **Audit before declaring done** -- v1.1 audit found security gaps; v2.0 audit found integration gaps. Both would have been production bugs without the audit step
2. **Small, focused phases execute faster** -- v2.0's 1-plan phases averaged minutes; v1.1's multi-plan phases averaged hours
3. **Pattern reuse across phases compounds** -- shutdown pattern, design system widgets, test mock patterns all accelerated later phases
