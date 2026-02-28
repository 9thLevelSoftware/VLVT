# Phase 14: Documentation Cleanup - Research

**Researched:** 2026-02-27
**Domain:** Documentation consistency and frontmatter standardization
**Confidence:** HIGH

## Summary

Phase 14 is a documentation-only phase that fixes two specific gaps identified in the v2.0 milestone audit: (1) the `requirements-completed` frontmatter field is missing from 65 of 75 SUMMARY.md files, and (2) the ROADMAP.md progress table has column misalignment and unchecked plan checkboxes for completed plans.

The work is entirely mechanical -- editing YAML frontmatter in existing markdown files and fixing a markdown table. No code changes, no tests, no risk of regression. The primary challenge is accuracy: mapping the correct requirement IDs to each plan across three milestones (v1.0, v1.1, v2.0) that have different requirement ID systems.

**Primary recommendation:** Split into two plans -- one for SUMMARY.md frontmatter updates (65 files across v1.0/v1.1), one for ROADMAP.md progress table fixes. The v2.0 SUMMARY files already have `requirements-completed` populated and need no changes.

## Architecture Patterns

### Documentation Structure

The project uses a structured planning system with this hierarchy:

```
.planning/
  ROADMAP.md              # Master progress tracking
  REQUIREMENTS.md         # Formal requirement IDs (v2.0 only)
  STATE.md                # Session continuity
  PROJECT.md              # Project overview
  v1.1-MILESTONE-AUDIT.md # v1.1 audit with req IDs
  v2.0-MILESTONE-AUDIT.md # v2.0 audit with req IDs
  phases/
    {NN}-{name}/
      {NN}-{PP}-PLAN.md
      {NN}-{PP}-SUMMARY.md  # <-- Target for frontmatter fix
      {NN}-VERIFICATION.md
      {NN}-RESEARCH.md
```

### SUMMARY.md Frontmatter Format (v2.0 Standard)

The v2.0 phases established the canonical frontmatter format with `requirements-completed`:

```yaml
---
phase: 08-shared-backend-utilities
plan: 01
subsystem: database
tags: [pg, pool, postgresql, resilience, railway]

# Dependency graph
requires: []
provides:
  - "createPool factory function for resilient PostgreSQL connections"
affects: [09-service-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["factory function for pg Pool"]

key-files:
  created:
    - backend/shared/src/utils/db-pool.ts
  modified:
    - backend/shared/src/index.ts

key-decisions:
  - "5000ms connection timeout default"

patterns-established:
  - "Factory function pattern"

requirements-completed: [RESIL-01, RESIL-02, RESIL-03]   # <-- THIS FIELD

# Metrics
duration: 2min
completed: 2026-02-27
---
```

### Milestone-Phase-Requirement Mapping

Three milestones exist with different requirement systems:

**v1.0 After Hours Mode (shipped 2026-01-24) -- NO formal requirement IDs**
Phases: 02-profile-session-management, 03-matching-engine, 04-real-time-chat, 05-save-mechanism-conversion, 06-frontend-integration, 07-safety-systems-polish
Plans: 25 SUMMARY files
Requirement IDs: None existed during v1.0. These plans pre-date the formal requirements system.

**v1.1 Production Readiness (shipped 2026-02-03) -- Formal IDs in milestone audit**
Phases: 01-foundation-safety, 02-gdpr-compliance, 03-testing-infrastructure, 04-bug-fixes-ui-polish, 05-monitoring-alerting, 06-deployment-infrastructure
Plans: 40 SUMMARY files
Requirement IDs: SEC-01 through SEC-09, GDPR-01 through GDPR-07, TEST-01 through TEST-06, UI-01 through UI-06, MON-01 through MON-06, DEP-01 through DEP-06 (40 total)

**v2.0 Beta Readiness (in progress) -- Formal IDs in REQUIREMENTS.md**
Phases: 08 through 14
Plans: 10 SUMMARY files (already have `requirements-completed`)
Requirement IDs: RESIL-01 through RESIL-07, UX-01 through UX-04, A11Y-01 through A11Y-03, OPS-01 (15 total)

### ROADMAP.md Issues Identified

Three specific problems in the ROADMAP.md progress section:

1. **Column misalignment (phases 12, 13):** Missing "Milestone" column value causes all columns to shift left:
   ```
   # BROKEN:
   | 12. Shutdown Ordering Fix | 1/1 | Complete    | 2026-02-28 | - |
   # SHOULD BE:
   | 12. Shutdown Ordering Fix | v2.0 | 1/1 | Complete | 2026-02-28 |
   ```

2. **Plan checkboxes unchecked:** Phases 8-12 plan lists all show `[ ]` despite being complete. Only Phase 13 shows `[x]`. All completed plans should show `[x]`.

3. **Phase 14 not reflecting planned state:** Shows `0/?` for plans -- should be updated once plans are created.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Requirement mapping for v1.0 | Guessing based on plan titles | `requirements-completed: []` (empty array) | v1.0 pre-dates formal requirement IDs; there are no IDs to assign |
| Requirement mapping for v1.1 | Inventing new IDs | v1.1 audit requirement IDs (SEC-*, GDPR-*, TEST-*, UI-*, MON-*, DEP-*) | Audit already maps phases to requirements |
| Bulk frontmatter editing | Manual per-file edits | Scripted approach or batch processing | 65 files is too many for one-at-a-time editing |

**Key insight:** The v1.0 plans have no formal requirement IDs to populate. The correct value for v1.0 SUMMARY files is `requirements-completed: []` (empty array) to indicate "no formal requirements tracked" rather than leaving the field absent. This matches the convention of Phase 13 using `[TECHDEBT-13]` -- presence of the field matters for consistency even when empty.

## Common Pitfalls

### Pitfall 1: Inventing Requirement IDs for v1.0 Plans
**What goes wrong:** Trying to retroactively create requirement IDs for v1.0 plans that never had them
**Why it happens:** Desire for consistency across all milestones
**How to avoid:** Use empty array `[]` for v1.0 plans. The `requirements-completed` field documents what formal requirements existed at execution time, not retroactive assignments.
**Warning signs:** Creating new IDs like "AH-01", "MATCH-01" that don't appear in any audit document

### Pitfall 2: Incorrect v1.1 Phase-to-Requirement Mapping
**What goes wrong:** Assigning wrong requirement IDs to v1.1 plans
**Why it happens:** v1.1 phases have duplicate phase numbers with v1.0 (both have 01-07), and the audit maps at the phase level, not plan level
**How to avoid:** Use the v1.1 milestone audit requirement tables carefully. Map at phase level first, then distribute to plans based on plan content. Cross-reference plan titles and accomplishments with requirement descriptions.
**Warning signs:** A plan about "Jest config fixes" getting GDPR requirement IDs

### Pitfall 3: Breaking YAML Frontmatter Syntax
**What goes wrong:** Adding `requirements-completed` in the wrong location or with invalid YAML syntax
**Why it happens:** v1.0 and v1.1 SUMMARY files have slightly different frontmatter structures (some use nested YAML, some use flat keys)
**How to avoid:** Insert `requirements-completed` consistently before the `# Metrics` comment block in the frontmatter, matching the v2.0 format. Verify YAML remains valid after each edit.
**Warning signs:** Frontmatter with unclosed arrays, missing colons, or field placement inside nested objects

### Pitfall 4: Editing v2.0 SUMMARY Files Unnecessarily
**What goes wrong:** Modifying the 10 v2.0 SUMMARY files that already have `requirements-completed`
**Why it happens:** Not checking which files already have the field
**How to avoid:** The 10 SUMMARY files in phases 08-13 already have `requirements-completed` populated. Only v1.0 (25 files) and v1.1 (40 files) need the field added.

### Pitfall 5: Incomplete ROADMAP Progress Table Fix
**What goes wrong:** Fixing column alignment but missing plan checkbox updates, or vice versa
**Why it happens:** Treating the ROADMAP as having only one issue when it has three
**How to avoid:** Address all three ROADMAP issues in one pass: (1) column alignment for phases 12/13, (2) plan checkboxes for phases 8-12, (3) phase 14 plan count.

## Code Examples

### Adding requirements-completed to v1.0 SUMMARY (no IDs)

```yaml
# Before (v1.0 SUMMARY, e.g., 02-profile-session-management/02-01-SUMMARY.md):
patterns-established:
  - "Factory router pattern with pool and upload injection"

# Metrics
duration: 50min
completed: 2026-01-23
---

# After:
patterns-established:
  - "Factory router pattern with pool and upload injection"

requirements-completed: []

# Metrics
duration: 50min
completed: 2026-01-23
---
```

### Adding requirements-completed to v1.1 SUMMARY (with IDs)

```yaml
# Before (v1.1 SUMMARY, e.g., 01-foundation-safety/01-01-SUMMARY.md):
patterns-established:
  - "Pin minimum security versions in package.json"

# Metrics
duration: 9min
completed: 2026-01-24
---

# After:
patterns-established:
  - "Pin minimum security versions in package.json"

requirements-completed: [SEC-03]

# Metrics
duration: 9min
completed: 2026-01-24
---
```

### v1.1 SUMMARY with Different Frontmatter Structure

Some v1.1 files (e.g., 06-deployment-infrastructure) use a different frontmatter layout with `decisions:` blocks and `metrics:` instead of `# Metrics`. The `requirements-completed` field should be inserted before the metrics/duration section regardless of format variant:

```yaml
# Before (06-deployment-infrastructure/06-01-SUMMARY.md):
decisions:
  - id: DEP-ENV-01
    choice: "Table format for env var documentation"
    why: "Easy scanning"

metrics:
  duration: "8 min"
  commits: 2
---

# After:
decisions:
  - id: DEP-ENV-01
    choice: "Table format for env var documentation"
    why: "Easy scanning"

requirements-completed: [DEP-02, DEP-03]

metrics:
  duration: "8 min"
  commits: 2
---
```

### Fixing ROADMAP Progress Table

```markdown
# Before (broken):
| 12. Shutdown Ordering Fix | 1/1 | Complete    | 2026-02-28 | - |
| 13. Pre-Existing Test Fixes | 1/1 | Complete    | 2026-02-28 | - |

# After (fixed):
| 12. Shutdown Ordering Fix | v2.0 | 1/1 | Complete | 2026-02-28 |
| 13. Pre-Existing Test Fixes | v2.0 | 1/1 | Complete | 2026-02-28 |
```

### Fixing ROADMAP Plan Checkboxes

```markdown
# Before (unchecked despite completion):
Plans:
- [ ] 08-01-PLAN.md -- Create createPool() factory...
- [ ] 08-02-PLAN.md -- Replace inline pool config...

# After (checked):
Plans:
- [x] 08-01-PLAN.md -- Create createPool() factory...
- [x] 08-02-PLAN.md -- Replace inline pool config...
```

## v1.1 Phase-to-Requirement Mapping Reference

This mapping derives from the v1.1 Milestone Audit requirements coverage table. It maps phases to the requirement IDs they address. The planner must then distribute these to individual plans by reading each plan's accomplishments.

| Phase Directory | v1.1 Requirements | Notes |
|-----------------|-------------------|-------|
| 01-foundation-safety | SEC-01 through SEC-09 | Security hardening (01 is "security-hardening" in audit) |
| 02-gdpr-compliance | GDPR-01 through GDPR-07 | Privacy, consent, data rights |
| 03-testing-infrastructure | TEST-01 through TEST-06 | Test suites for all flows |
| 04-bug-fixes-ui-polish | UI-01 through UI-06 | UI audit and design consistency |
| 05-monitoring-alerting | MON-01 through MON-06 | Sentry, health, logging, uptime |
| 06-deployment-infrastructure | DEP-01 through DEP-06 | Backup, env docs, email, Apple flow |

**Important:** Each phase may have multiple plans, and requirements distribute across plans within a phase. The planner should read each v1.1 SUMMARY's accomplishments section to determine which specific requirement IDs each plan addresses.

## File Inventory

### Files to Modify (65 SUMMARY.md + 1 ROADMAP.md = 66 total)

**v1.0 SUMMARY files (25 -- add `requirements-completed: []`):**
- 02-profile-session-management: 02-01, 02-02, 02-03
- 03-matching-engine: 03-01, 03-02, 03-03, 03-04
- 04-real-time-chat: 04-01, 04-02, 04-03, 04-04
- 05-save-mechanism-conversion: 05-01, 05-02, 05-03
- 06-frontend-integration: 06-01, 06-02, 06-03, 06-04, 06-05, 06-06
- 07-safety-systems-polish: 07-01, 07-02, 07-03, 07-04, 07-05

**v1.1 SUMMARY files (40 -- add `requirements-completed: [IDs]`):**
- 01-foundation-safety: 01-01 through 01-07 (7 files)
- 02-gdpr-compliance: 02-01 through 02-06 (6 files)
- 03-testing-infrastructure: 03-01 through 03-12 (12 files)
- 04-bug-fixes-ui-polish: 04-01 through 04-05 (5 files)
- 05-monitoring-alerting: 05-01 through 05-05 (5 files)
- 06-deployment-infrastructure: 06-01 through 06-05 (5 files)

**v2.0 SUMMARY files (10 -- NO changes needed, already have field):**
- 08-01, 08-02, 09-01, 09-02, 10-01, 10-02, 11-01, 11-02, 12-01, 13-01

**ROADMAP.md (1 file -- fix progress table + plan checkboxes):**
- Fix column misalignment in phases 12/13
- Check plan checkboxes for phases 8-12
- Update phase 14 plan count after plans are created

### Files NOT to Modify
- v2.0 SUMMARY files (already correct)
- REQUIREMENTS.md (already accurate)
- STATE.md (will be updated separately by GSD workflow)
- VERIFICATION.md files (not in scope)

## Open Questions

1. **v1.1 plan-level requirement mapping accuracy**
   - What we know: The v1.1 audit maps requirements to phases, not to individual plans
   - What's unclear: Which specific requirements each of the 40 v1.1 plans satisfies
   - Recommendation: The planner must read each v1.1 SUMMARY's accomplishments section and map to the requirement IDs. When a plan doesn't clearly map to any specific requirement, use the phase-level mapping. When uncertain, mark the plan with the full phase requirement set rather than guessing a subset.

2. **v1.0 empty array vs. omission**
   - What we know: v1.0 had no formal requirement IDs
   - What's unclear: Whether `requirements-completed: []` is better than a descriptive value like `requirements-completed: [N/A]`
   - Recommendation: Use `requirements-completed: []` (empty array) for consistency with YAML conventions. Add a comment if needed: `requirements-completed: []  # v1.0 pre-dates formal requirements`

## Sources

### Primary (HIGH confidence)
- `.planning/v2.0-MILESTONE-AUDIT.md` -- Identifies the documentation gap explicitly ("SUMMARY.md frontmatter missing requirements_completed field")
- `.planning/v1.1-MILESTONE-AUDIT.md` -- Contains all v1.1 requirement IDs and phase mappings
- `.planning/REQUIREMENTS.md` -- Contains all v2.0 requirement IDs and traceability table
- `.planning/ROADMAP.md` -- Direct inspection of progress table and plan checkboxes
- All 75 SUMMARY.md files -- Direct inspection of frontmatter presence/absence

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` -- Milestone dates and validated requirements list

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No libraries or tools; pure markdown editing
- Architecture: HIGH -- Frontmatter format well-established by v2.0 examples
- Pitfalls: HIGH -- All issues identified via direct file inspection, no speculation
- v1.1 mapping: MEDIUM -- Phase-level mapping is clear, plan-level distribution requires reading each summary

**Research date:** 2026-02-27
**Valid until:** Indefinite (documentation format is stable)
