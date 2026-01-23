# Phase 2: Profile & Session Management - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create After Hours profiles, set preferences, and start/end timed sessions. This phase establishes the user-facing entry point to After Hours Mode — the APIs for profile CRUD, preferences, and session lifecycle.

</domain>

<decisions>
## Implementation Decisions

### Session lifecycle
- Duration options: 15, 30, or 60 minutes (user choice at activation)
- Extensions: unlimited — user can extend active session as many times as they want
- No cooldown between sessions — can start new session immediately after one ends
- Early termination: yes, user can end session anytime without confirmation

### Profile separation
- Separate photo + bio from main profile; name/age inherited from main
- Single photo only for After Hours profile
- Profile always editable in settings, but only discoverable during active sessions
- Profile creation required before first session activation

### Preferences scope
- Completely separate from main app preferences
- Fields: gender seeking, distance range, age range, sexual orientation
- Distance max: same as main app (no special restriction)
- Smart defaults based on main profile preferences, user can adjust

### Activation flow
- Confirmation dialog shown before starting (shows duration choice)
- Location captured once on "Go Live" tap — used for entire session
- Location permission required — block activation if denied
- Manual early end available anytime

### Claude's Discretion
- Session expiry behavior for active chats (grace period, warnings)
- Exact confirmation dialog design and copy
- Default preference values when inheriting from main
- Error messaging for blocked activation scenarios

</decisions>

<specifics>
## Specific Ideas

No specific product references — open to standard approaches that match existing VLVT patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-profile-session-management*
*Context gathered: 2026-01-22*
