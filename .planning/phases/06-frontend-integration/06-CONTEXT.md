# Phase 6: Frontend Integration - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete Flutter UI for After Hours Mode. This includes the AfterHoursService state machine, profile/preferences screens, session activation flow, match card UI, ephemeral chat UI, and background location handling. All backend functionality (Phases 1-5) is complete.

</domain>

<decisions>
## Implementation Decisions

### Session Activation Flow
- Guided setup: walk through profile/preferences if not set, then confirm
- Entry point is a dedicated tab bar item in main navigation (always visible)
- Countdown timer is always visible throughout After Hours (persistent in app bar or status area)
- Easy exit: clear "End Session" button with one-tap confirmation

### Match Card Presentation
- Modal overlay: card slides up over current screen when match arrives
- Standard info shown: photo, name, age, distance, After Hours bio
- Swipe gestures: swipe right to chat, left to decline (Tinder-style)
- Auto-decline after 5-minute timer (from backend) if user doesn't respond

### Chat UI Differences
- Subtle indicator: same look as regular chat, but with badge/label showing it's ephemeral
- Save button placed above the message input area (prominent, always visible)
- Session timer shown as banner below app bar (always-visible strip with time remaining)
- Partner saved first: prominent alert/modal saying "They saved! Save back to keep chatting"

### State Transitions
- 2-minute expiry warning: non-blocking banner at top, timer turns urgent color
- Session end: immediate transition, chat closes, user returns to main app automatically
- Waiting state: active searching UI with animation showing "searching nearby" and nearby user count
- Error handling: silent retry in background, only show error if persistent

### Claude's Discretion
- Exact animation styles and durations
- Color choices for timer states (normal, warning, urgent)
- Loading skeleton designs
- Specific gesture feedback (haptics, visual cues)
- Empty state illustrations

</decisions>

<specifics>
## Specific Ideas

- Swipe gestures for match cards should feel like Tinder (familiar pattern)
- Timer should be visually prominent but not anxiety-inducing until warning phase
- "They saved" alert should create urgency without being annoying

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-frontend-integration*
*Context gathered: 2026-01-23*
