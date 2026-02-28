---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/ROADMAP.md
  - .planning/v2.0-MILESTONE-AUDIT.md
autonomous: true
requirements: [DOCDEBT-AUDIT]

must_haves:
  truths:
    - "ROADMAP.md Phase 16 row has 5 pipe-separated columns matching the format of rows 8-15"
    - "v2.0 milestone audit accurately reflects the current state of SUMMARY frontmatter"
  artifacts:
    - path: ".planning/ROADMAP.md"
      provides: "Corrected Phase 16 progress row"
      contains: "| 16. Tech Debt Cleanup | v2.0 | 1/1 | Complete | 2026-02-28 |"
    - path: ".planning/v2.0-MILESTONE-AUDIT.md"
      provides: "Corrected SUMMARY Frontmatter column and tech debt list"
  key_links: []
---

<objective>
Fix two documentation misalignments identified by the v2.0 milestone audit:
1. ROADMAP.md Phase 16 progress row has wrong column layout (missing "1/1", duplicate date)
2. v2.0 milestone audit report itself is stale -- it claims all 14 v2.0 SUMMARY files have empty `requirements-completed: []` but they are actually already populated (phases 14/16 fixed them)

Purpose: Documentation accuracy for milestone closure
Output: Corrected ROADMAP.md and updated audit report
</objective>

<execution_context>
@C:/Users/dasbl/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/dasbl/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/v2.0-MILESTONE-AUDIT.md

**Key finding from pre-planning investigation:**

The audit claims "All 14 v2.0 SUMMARY.md files have requirements-completed: []" but this is WRONG.
Actual current state (verified via grep):
- 08-01: [RESIL-01, RESIL-02, RESIL-03]
- 08-02: [RESIL-01, RESIL-02, RESIL-03]
- 09-01: [RESIL-04, RESIL-07]
- 09-02: [RESIL-05, RESIL-06, RESIL-07]
- 10-01: [UX-01, UX-02, UX-03]
- 10-02: [UX-03, UX-04]
- 11-01: [A11Y-01, A11Y-02, A11Y-03]
- 11-02: [OPS-01]
- 12-01: [RESIL-04, RESIL-05]
- 13-01: [] (correct -- no requirements, tech debt)
- 14-01: [DOCDEBT-14]
- 14-02: [DOCDEBT-14]
- 15-01: [RESIL-06]
- 16-01: [] (correct -- no requirements, tech debt)

Only 13-01 and 16-01 have [] and that is intentional (tech debt phases with no formal requirements).

So the SUMMARY files do NOT need editing. The audit report and ROADMAP are the only files to fix.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix ROADMAP Phase 16 row and update audit report</name>
  <files>.planning/ROADMAP.md, .planning/v2.0-MILESTONE-AUDIT.md</files>
  <action>
1. In `.planning/ROADMAP.md` line 176, change:
   `| 16. Tech Debt Cleanup | v2.0 | Complete    | 2026-02-28 | 2026-02-28 |`
   to:
   `| 16. Tech Debt Cleanup | v2.0 | 1/1 | Complete | 2026-02-28 |`
   This matches the 5-column format (Phase | Milestone | Plans Complete | Status | Completed) used by rows 8-15.

2. In `.planning/v2.0-MILESTONE-AUDIT.md`, update the Requirements Coverage table (lines 72-87):
   Replace each `[]` in the "SUMMARY Frontmatter" column with the actual populated values:
   - RESIL-01 row: `08-01, 08-02: [RESIL-01, RESIL-02, RESIL-03]`
   - RESIL-02 row: `08-01, 08-02: [RESIL-01, RESIL-02, RESIL-03]`
   - RESIL-03 row: `08-01, 08-02: [RESIL-01, RESIL-02, RESIL-03]`
   - RESIL-04 row: `09-01: [RESIL-04, RESIL-07], 12-01: [RESIL-04, RESIL-05]`
   - RESIL-05 row: `09-02: [RESIL-05, RESIL-06, RESIL-07], 12-01: [RESIL-04, RESIL-05]`
   - RESIL-06 row: `09-02: [RESIL-05, RESIL-06, RESIL-07], 15-01: [RESIL-06]`
   - RESIL-07 row: `09-01: [RESIL-04, RESIL-07], 09-02: [RESIL-05, RESIL-06, RESIL-07]`
   - A11Y-01 through A11Y-03 rows: `11-01: [A11Y-01, A11Y-02, A11Y-03]`
   - UX-01 row: `10-01: [UX-01, UX-02, UX-03]`
   - UX-02 row: `10-01: [UX-01, UX-02, UX-03]`
   - UX-03 row: `10-01: [UX-01, UX-02, UX-03], 10-02: [UX-03, UX-04]`
   - UX-04 row: `10-02: [UX-03, UX-04]`
   - OPS-01 row: `11-02: [OPS-01]`
   - DOCDEBT-14 row: `14-01, 14-02: [DOCDEBT-14]`

   Remove the asterisk footnotes from "satisfied*" since all 3 sources now agree. Change `**satisfied***` to `**satisfied**`.

3. Remove the footnote on line 89 that says SUMMARY frontmatter has `requirements-completed: []` for all v2.0 plans.
   Replace with: `*All 16 requirements verified as satisfied by all 3 sources (VERIFICATION.md + SUMMARY frontmatter + REQUIREMENTS.md).*`

4. In Tech Debt Summary (line 155), remove item 1 ("v2.0 SUMMARY frontmatter empty") since it is already resolved.
   Update item 2 to become item 1. Adjust "Total: 7 items" to "Total: 6 items" on line 166.

5. Update the ROADMAP tech debt item in the audit frontmatter (lines 16-20): remove the SUMMARY frontmatter item from phase 14-documentation-cleanup tech_debt since it is resolved. Keep the Phase 16 ROADMAP row item but mark it as resolved (or remove it since we are fixing it now).
  </action>
  <verify>
Verify ROADMAP Phase 16 row format:
```bash
grep "16\. Tech Debt" .planning/ROADMAP.md
```
Expected: `| 16. Tech Debt Cleanup | v2.0 | 1/1 | Complete | 2026-02-28 |`

Verify audit no longer claims empty frontmatter:
```bash
grep -c "requirements-completed: \[\]" .planning/v2.0-MILESTONE-AUDIT.md
```
Expected: 0 (no references to empty arrays in the audit report)

Verify all progress rows have consistent 5-column format:
```bash
grep -E "^\| [0-9]+\." .planning/ROADMAP.md | awk -F'|' '{print NF-1, $0}'
```
Expected: All rows show 5 columns
  </verify>
  <done>
- ROADMAP Phase 16 row matches the 5-column format used by all other v2.0 phases
- Audit report Requirements Coverage table shows actual populated SUMMARY frontmatter values (not empty arrays)
- Audit footnote updated to reflect 3-source agreement
- Tech debt count reduced from 7 to 6 (SUMMARY item resolved)
  </done>
</task>

</tasks>

<verification>
1. `grep "16\. Tech Debt" .planning/ROADMAP.md` shows `| 16. Tech Debt Cleanup | v2.0 | 1/1 | Complete | 2026-02-28 |`
2. All ROADMAP progress rows have exactly 5 pipe-separated columns
3. Audit report does not contain any claims about empty `requirements-completed: []` for v2.0 files
4. Audit tech debt count is 6, not 7
</verification>

<success_criteria>
- ROADMAP.md Phase 16 row is column-aligned with rows 8-15
- v2.0 milestone audit accurately reflects the already-populated SUMMARY frontmatter
- No stale data remains in the audit report
</success_criteria>

<output>
No SUMMARY needed for quick plans. Commit message: `docs: fix ROADMAP Phase 16 row alignment and update stale audit report`
</output>
