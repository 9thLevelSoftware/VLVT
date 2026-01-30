# Phase 7: Safety Systems - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Preserve chat history (including After Hours) server-side for 30 days after unmatch so moderators can investigate reports. Build a moderation dashboard with report queue, conversation review, and enforcement actions. Implement end-to-end report workflow from user submission to moderator resolution.

</domain>

<decisions>
## Implementation Decisions

### Chat preservation
- Soft-delete with flag on unmatch — messages stay in same table, hidden from users, visible to moderators
- Entire conversation preserved (both sides) for full context
- 30-day retention after unmatch; auto-delete permanently unless an open report exists — then retain until resolved
- Disclosure in privacy policy only — no in-app notification at unmatch time

### Moderation interface
- Simple web dashboard (HTML/JS) — not just API endpoints
- Admin role system — add admin/moderator role to user table, multiple people can log in with own credentials
- Three enforcement actions: warn (notify user), temporary suspension, permanent ban
- Moderators see full profile (photos, bio, verification status) alongside the complete conversation thread

### Report workflow
- Both predefined categories AND optional free-text details
- Predefined categories must include: harassment, inappropriate content, spam, underage, impersonation, suspected bot, other
- Auto-restrict on threshold — after N reports, user is hidden from discovery until reviewed
- Generic acknowledgment to reporting user: "Thanks for your report. We've reviewed it and taken appropriate action."
- Category-based priority — safety-critical categories (underage, safety threat) surface first in moderation queue

### After Hours retention
- Same mechanism as regular chat — soft-delete flag, same 30-day window from unmatch, same moderator access
- No visual distinction in moderation view — After Hours messages shown same as regular messages
- 30-day clock starts from unmatch (not session end), consistent with regular chat
- Photos shared in After Hours sessions preserved alongside messages for moderator review

### Claude's Discretion
- Auto-restrict threshold number (e.g., 3 reports)
- Suspension duration options
- Dashboard layout and navigation
- Priority category assignments
- Cleanup job scheduling details

</decisions>

<specifics>
## Specific Ideas

- "Suspected bot" must be a predefined report category — important for dating app context
- Auto-restrict is a safety-first approach: hide from discovery on threshold, don't wait for moderator
- Generic acknowledgment keeps reporter informed without revealing enforcement details

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-safety-systems-polish*
*Context gathered: 2026-01-30*
