# Phase 4: Real-Time Chat - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Matched users can chat instantly with ephemeral messages. Messages disappear when the session ends unless both users save. Server-side retention for safety (30 days). The save mechanism itself is Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Match arrival experience
- Full-screen takeover when match is found — demands attention
- Brief celebratory animation (confetti/pulse) for 1-2 seconds before showing match card
- Match card shows full profile preview: photo, name, bio, distance (scrollable if long)
- Two action buttons: Chat / Decline

### Chat interaction model
- Debounced typing indicators — shows "typing..." after brief pause, less jittery
- Read receipts enabled — checkmarks or "seen" when other person reads
- Auto-retry silently on send failure — only show error after multiple failures
- Full chat history persists if user leaves and reopens app mid-session

### Session expiry flow
- 2-minute warning before session expires
- Warning appears as in-chat banner — doesn't interrupt conversation
- 30-60 second grace period after expiry for active chats to wrap up or save
- Direct return to main app after expiry — no summary screen, smooth transition

### Waiting/empty states
- Animated searching (pulsing radar animation) with session timer
- Show active user count: "12 people active nearby" — social proof
- Brief cooldown message after decline: "Finding your next match..." then back to search
- If searching for a while: show count + reassurance ("12 people nearby, finding your best match...")

### Claude's Discretion
- Exact animation style and timing for match arrival
- Typing indicator debounce timing
- Number of auto-retry attempts before showing error
- Grace period exact duration (30-60s range)

</decisions>

<specifics>
## Specific Ideas

- Match arrival should feel like a celebration — brief but exciting
- Chat should feel low-pressure despite read receipts (debounced typing helps)
- Expiry should be graceful, not jarring — user should feel the session "ends" naturally
- Waiting state should feel active, not broken — animation + count keeps engagement

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-real-time-chat*
*Context gathered: 2026-01-22*
