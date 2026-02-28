# Phase 16: Tech Debt Cleanup - Research

**Researched:** 2026-02-28
**Domain:** Documentation consistency, widget lifecycle, requirement ID hygiene
**Confidence:** HIGH

## Summary

Phase 16 addresses three specific tech debt items identified in the v2.0 milestone re-audit. All three are well-scoped, low-risk tasks involving documentation edits and a single widget decision. No code logic changes, no new dependencies, no test risk.

The three items are: (1) ROADMAP.md progress table has a misaligned row for Phase 15 (missing `v2.0` milestone value, shifting all columns left) plus an unchecked plan checkbox for the completed 15-01 plan, (2) VlvtIconButton widget defined in `vlvt_button.dart` has zero callers across all screens -- screens use raw `IconButton(tooltip:)` directly, making VlvtIconButton dead code, and (3) TECHDEBT-13 is used as a requirement ID in Phase 13's plan and summary frontmatter but was never registered in REQUIREMENTS.md, creating a documentation inconsistency.

**Primary recommendation:** Handle all three items in a single plan. They are independent edits to different files with no interdependencies. Total scope is approximately 5 file edits.

## Standard Stack

No libraries, frameworks, or dependencies are involved. This phase is purely documentation and dead-code cleanup. All edits are to markdown files and one Dart widget file.

## Architecture Patterns

### Files Requiring Edits

```
.planning/
  ROADMAP.md                           # Fix Phase 15 row alignment, Phase 15 plan checkbox, Phase 16 plan count
  REQUIREMENTS.md                      # (option) Register TECHDEBT-13 formally, OR no change
  phases/
    13-pre-existing-test-fixes/
      13-01-PLAN.md                    # (option) Remove TECHDEBT-13 from requirements frontmatter
      13-01-SUMMARY.md                 # (option) Remove TECHDEBT-13 from requirements-completed
    14-documentation-cleanup/
      14-RESEARCH.md                   # Contains reference to TECHDEBT-13 convention (informational, leave as-is)
frontend/
  lib/widgets/vlvt_button.dart         # Remove VlvtIconButton class (lines 305-364)
```

### Pattern: ROADMAP Progress Table Format

The correct column format for the progress table is:

```markdown
| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 15. Chat-Service Shutdown Ordering | v2.0 | 1/1 | Complete | 2026-02-28 |
```

**Current broken row (line 172):**
```markdown
| 15. Chat-Service Shutdown Ordering | 1/1 | Complete    | 2026-02-28 | — |
```
The `v2.0` value is missing from the Milestone column, shifting `1/1` into Milestone, `Complete` into Plans Complete, etc.

### Pattern: Plan Checkbox Format

```markdown
Plans:
- [x] 15-01-PLAN.md — Wrap io.close() in Promise and await it before pool.end() (RESIL-06)
```

**Current (line 145):** Shows `[ ]` despite Phase 15 being complete per STATE.md.

### Pattern: ROADMAP Phase 14 Row

**Current (line 171):** Already shows `| 14. Documentation Cleanup | v2.0 | 2/2 | Complete | 2026-02-28 |`

This success criterion is **already satisfied**. The original audit noted Phase 14's row was misaligned at line 144, but Phase 14 execution fixed its own row. The remaining misalignment is on Phase 15's row.

## Item Analysis

### Item 1: ROADMAP.md Row Alignment and Checkboxes

**Scope:** 2 edits in ROADMAP.md

**Edit A - Phase 15 progress row (line 172):**
Replace:
```markdown
| 15. Chat-Service Shutdown Ordering | 1/1 | Complete    | 2026-02-28 | — |
```
With:
```markdown
| 15. Chat-Service Shutdown Ordering | v2.0 | 1/1 | Complete | 2026-02-28 |
```

**Edit B - Phase 15 plan checkbox (line 145):**
Replace:
```markdown
- [ ] 15-01-PLAN.md — Wrap io.close() in Promise and await it before pool.end() (RESIL-06)
```
With:
```markdown
- [x] 15-01-PLAN.md — Wrap io.close() in Promise and await it before pool.end() (RESIL-06)
```

**Confidence:** HIGH -- directly observable in current file.

### Item 2: VlvtIconButton Dead Code

**Evidence of orphan status:**

| Source | Finding |
|--------|---------|
| `grep VlvtIconButton frontend/lib/` | Only 1 file: `vlvt_button.dart` (definition) |
| `grep VlvtIconButton frontend/test/` | 0 matches -- no tests |
| `grep IconButton( frontend/lib/screens/` | 30+ raw `IconButton(` calls across 15 screen files |
| Phase 11 execution | Tooltips were added directly to raw `IconButton(tooltip:)` calls, not via VlvtIconButton |

**VlvtIconButton widget (lines 305-364 in vlvt_button.dart):**
- Defines two rendering modes: `outlined` (GestureDetector + Container) and non-outlined (delegates to raw `IconButton`)
- Has tooltip parameter added in Phase 11
- Zero callers anywhere in the codebase
- No tests

**Recommendation: Remove VlvtIconButton.** Rationale:
1. Zero callers -- it is dead code
2. The non-outlined mode simply wraps `IconButton` with no added value
3. The outlined mode (circular border) has no callers and no evidence it was ever needed
4. Keeping dead code creates maintenance burden and confusion (future developers may wonder whether to use it vs raw IconButton)
5. The A11Y-01 requirement ("VlvtIconButton widget accepts a tooltip parameter") is satisfied regardless -- the requirement documents what exists, and if the widget is removed, the requirement becomes moot

**What NOT to do:** Do not migrate all 30+ `IconButton` calls to `VlvtIconButton`. This would be a large refactor with significant regression risk and no functional benefit -- raw `IconButton` already handles tooltips, accessibility, and theming correctly. The screens already have tooltips working via direct `IconButton(tooltip:)` calls.

**Confidence:** HIGH -- grep results are definitive.

### Item 3: TECHDEBT-13 Informal Requirement ID

**Current state:**
- `13-01-PLAN.md` line 9: `requirements: ["TECHDEBT-13"]`
- `13-01-SUMMARY.md` line 30: `requirements-completed: [TECHDEBT-13]`
- `REQUIREMENTS.md`: No TECHDEBT-13 entry exists
- `ROADMAP.md` Phase 13: `Requirements: None (tech debt cleanup)`

**Two resolution options:**

| Option | Action | Files Changed | Pro | Con |
|--------|--------|---------------|-----|-----|
| A: Remove references | Delete `TECHDEBT-13` from plan/summary frontmatter | 2 files | Consistent with ROADMAP ("Requirements: None") | Loses informal traceability |
| B: Register formally | Add TECHDEBT-13 to REQUIREMENTS.md + traceability table | 1 file + update traceability | Frontmatter becomes valid | Creates a requirement retroactively for a phase that explicitly had none |

**Recommendation: Option A (remove references).** Rationale:
1. ROADMAP.md Phase 13 explicitly says `Requirements: None (tech debt cleanup)` -- this is an intentional decision
2. Creating a formal requirement retroactively contradicts the phase's own description
3. The plan and summary frontmatter were simply using an informal convention that was never registered
4. Removing the references makes the frontmatter consistent with REQUIREMENTS.md and ROADMAP.md
5. The 14-RESEARCH.md reference (line 122) is informational context, not a requirement reference -- leave it as-is since it accurately describes what was done at the time

**Replacement values:**
- `13-01-PLAN.md`: Change `requirements: ["TECHDEBT-13"]` to `requirements: []`
- `13-01-SUMMARY.md`: Change `requirements-completed: [TECHDEBT-13]` to `requirements-completed: []`

**Confidence:** HIGH -- clear documentation inconsistency with straightforward resolution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon button wrapper | VlvtIconButton adoption campaign | Raw `IconButton(tooltip:)` | Already working, already accessible, no benefit to wrapping |
| Requirement ID retroactive creation | New TECHDEBT-* IDs for tech debt phases | `requirements: []` (empty) | Tech debt phases explicitly have no formal requirements |

**Key insight:** The VlvtIconButton was a design system aspiration that never gained adoption. The correct resolution is removal, not forced adoption. Similarly, TECHDEBT-13 was an informal convention, not a real requirement -- the correct fix is removing the reference, not formalizing it.

## Common Pitfalls

### Pitfall 1: Migrating Screens to VlvtIconButton
**What goes wrong:** Attempting to replace all 30+ `IconButton` calls with `VlvtIconButton` to "fix" the orphan
**Why it happens:** Assumes the widget should be adopted rather than removed
**How to avoid:** The phase success criteria says "adopted by screens OR removed if truly orphaned" -- it is truly orphaned (zero callers, added zero value over raw IconButton)
**Warning signs:** If a plan includes modifying 15+ screen files, the approach is wrong

### Pitfall 2: Accidentally Breaking VlvtButton When Removing VlvtIconButton
**What goes wrong:** Removing too much from `vlvt_button.dart` and affecting the `VlvtButton` class
**Why it happens:** Both classes are in the same file
**How to avoid:** Remove only lines 304-364 (the blank line, doc comment, and VlvtIconButton class). Leave VlvtButton completely untouched.
**Warning signs:** Any change to lines 1-303

### Pitfall 3: Confusing Phase 14 Row Fix with Phase 15 Row Fix
**What goes wrong:** Editing Phase 14's progress row when it's already correct
**Why it happens:** The original success criterion says "Phase 14 progress row" but the actual remaining issue is Phase 15's row
**How to avoid:** Verify Phase 14 row is already `| 14. Documentation Cleanup | v2.0 | 2/2 | Complete | 2026-02-28 |` before making changes. The real fix is Phase 15's row.

### Pitfall 4: Forgetting to Update Phase 16's Own Row
**What goes wrong:** Fixing Phase 15 row but leaving Phase 16 row with `0/0` and `Planned`
**Why it happens:** Not thinking about self-referential updates
**How to avoid:** Update Phase 16 row to reflect actual plan count and status after plan creation

## Code Examples

### Removing VlvtIconButton from vlvt_button.dart

The file contains two classes: `VlvtButton` (lines 1-303) and `VlvtIconButton` (lines 306-364). Remove only the VlvtIconButton class and its preceding blank line + doc comment (lines 304-364). The resulting file should end at line 303 with the closing brace of `_VlvtButtonState.build()`.

```dart
// KEEP: Everything from line 1 through line 303 (VlvtButton class)
// REMOVE: Lines 304-364 (blank line + VlvtIconButton class)
```

### Fixing ROADMAP.md Phase 15 Progress Row

```markdown
// BEFORE (line 172):
| 15. Chat-Service Shutdown Ordering | 1/1 | Complete    | 2026-02-28 | — |

// AFTER:
| 15. Chat-Service Shutdown Ordering | v2.0 | 1/1 | Complete | 2026-02-28 |
```

### Cleaning TECHDEBT-13 from Frontmatter

```yaml
# 13-01-PLAN.md frontmatter - BEFORE:
requirements: ["TECHDEBT-13"]
# AFTER:
requirements: []

# 13-01-SUMMARY.md frontmatter - BEFORE:
requirements-completed: [TECHDEBT-13]
# AFTER:
requirements-completed: []
```

## Open Questions

1. **Should the 14-RESEARCH.md reference to TECHDEBT-13 be updated?**
   - What we know: Line 122 references `[TECHDEBT-13]` as a convention example
   - What's unclear: Whether updating historical research documentation is appropriate
   - Recommendation: Leave as-is. It's descriptive of what existed at research time, not prescriptive. Adding a note would be over-engineering.

2. **Should Phase 16 row in the progress table be updated in this phase?**
   - What we know: Currently shows `0/0` and `Planned`
   - What's unclear: Whether self-referential updates should happen during execution or after
   - Recommendation: Update Phase 16 row to correct plan count as part of the ROADMAP edits. Mark status as `Complete` and add completion date.

## Sources

### Primary (HIGH confidence)
- `ROADMAP.md` lines 145, 163-174 -- direct observation of misalignment and checkbox state
- `frontend/lib/widgets/vlvt_button.dart` lines 306-364 -- VlvtIconButton definition
- `grep VlvtIconButton frontend/lib/` -- zero callers outside definition file
- `grep VlvtIconButton frontend/test/` -- zero test references
- `grep IconButton( frontend/lib/screens/` -- 30+ raw IconButton calls across 15 files
- `13-01-PLAN.md` line 9, `13-01-SUMMARY.md` line 30 -- TECHDEBT-13 references
- `REQUIREMENTS.md` -- no TECHDEBT-13 entry
- `v2.0-MILESTONE-AUDIT.md` -- original identification of all three tech debt items

## Metadata

**Confidence breakdown:**
- ROADMAP fixes: HIGH -- directly observable, mechanical edits
- VlvtIconButton removal: HIGH -- grep proves zero callers, clear dead code
- TECHDEBT-13 cleanup: HIGH -- clear inconsistency with straightforward resolution

**Research date:** 2026-02-28
**Valid until:** N/A -- this is a one-time cleanup with no external dependencies
