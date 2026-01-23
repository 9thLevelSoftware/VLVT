# Phase 3: Matching Engine - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

System automatically matches active After Hours users by proximity and preferences. Users don't swipe — they receive match assignments from the system. One match at a time, must decide before seeing next. Creating chat and save functionality are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Match timing & frequency
- Short delay (10-30 seconds) after session start before first match attempt
- Hybrid matching: event-driven (new users join, user declines) + periodic fallback
- One chat at a time — user must decline or save current match before getting another
- Cooldown before re-match after decline (e.g., 30 seconds)

### Match delivery experience
- Single match card at a time (no queue visible)
- Full-screen takeover when match appears — can't miss it, must decide
- Card shows: photo + name + age + distance + bio excerpt (After Hours description)
- Hard timer on match card — auto-decline after X minutes if no decision

### Empty queue handling
- Waiting screen with animation ("Looking for matches nearby...")
- Show active user count nearby as social proof ("12 people nearby in After Hours")
- Short wait (1-2 minutes) before suggesting preference expansion
- Offer to expand distance when queue empty ("No matches within 5km. Expand to 10km?")

### Decline behavior
- Silent decline — other user never knows they were declined
- Declines are final for the session (no undo)
- Short memory across sessions — declined users excluded for 3 sessions, then can reappear
- System needs to track decline history with session counter

### Claude's Discretion
- Exact timing values (initial delay, cooldown duration, card timer duration)
- Periodic fallback interval for matching job
- Animation design for waiting state
- Distance expansion increments
- Active user count display format

</decisions>

<specifics>
## Specific Ideas

- Match card should feel like a "moment" — full-screen takeover with anticipation
- The waiting animation should feel active, not like the app is broken
- Social proof count should encourage patience without revealing too much

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-matching-engine*
*Context gathered: 2026-01-22*
