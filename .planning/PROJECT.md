# VLVT — After Hours Mode

## What This Is

VLVT is a dating app with a Flutter frontend and Node.js microservices backend. This milestone adds **After Hours Mode** — a premium, time-boxed feature for spontaneous connections. Users activate a session, set preferences, and get auto-matched with nearby users also in After Hours mode. Matches pop up as profile cards; users can instantly chat or decline.

## Core Value

When users activate After Hours Mode, they connect with nearby interested people *immediately* — no waiting for mutual swipes, no browsing. The system does the matching; users just decide yes or no.

## Requirements

### Validated

Existing VLVT capabilities (from codebase analysis):

- ✓ User authentication (email/password, Apple Sign-In, Google Sign-In) — existing
- ✓ JWT token management with refresh token rotation — existing
- ✓ User profiles with photos and bio — existing
- ✓ Photo upload with Sharp processing and R2 storage — existing
- ✓ Profile discovery with geo-proximity filtering — existing
- ✓ Swipe-based matching (like/pass) — existing
- ✓ Real-time messaging via Socket.IO — existing
- ✓ Typing indicators and read receipts — existing
- ✓ Push notifications via Firebase — existing
- ✓ RevenueCat subscription management (premium/free tiers) — existing
- ✓ User blocking and reporting — existing
- ✓ ID verification via KYCAid — existing
- ✓ Face verification via AWS Rekognition — existing

### Active

After Hours Mode feature set:

- [ ] User can create separate After Hours profile (dedicated photo + description)
- [ ] User can set After Hours preferences (gender seeking, kinks/interests, distance range)
- [ ] User can activate After Hours mode session (fixed duration)
- [ ] System auto-matches users by proximity within preference criteria
- [ ] Matched profile card pops up with photo and description
- [ ] User can tap "Chat" to connect instantly with ephemeral chat
- [ ] User can tap "Decline" to skip (hidden for current session only)
- [ ] Ephemeral chat disappears when session ends
- [ ] Both users can tap "Save" to convert chat to regular match
- [ ] Declined users reappear in future sessions (fresh each session)
- [ ] Only verified users can access After Hours mode
- [ ] Blocks from main app carry over to After Hours mode
- [ ] User can block within After Hours mode (permanent)
- [ ] Quick report/exit mechanism for bad matches
- [ ] Location fuzzing (general area, not exact coordinates)
- [ ] After Hours mode requires premium subscription

### Out of Scope

- Role/position preferences (top/bottom/vers) — keep preferences focused on gender + interests for v1
- Persistent After Hours chat history — ephemeral by design, conflicts with privacy goals
- Free tier access to After Hours mode — premium differentiator
- After Hours mode for unverified users — safety requirement

## Context

**Technical environment:**
- Existing microservices: auth-service (3001), profile-service (3002), chat-service (3003)
- Socket.IO already handles real-time messaging with rate limiting
- PostgreSQL with 20+ migrations, well-established schema
- RevenueCat already gates premium features
- Verification system (KYCAid + Rekognition) already in place

**Implementation considerations:**
- After Hours profiles need separate storage from main profiles
- Session management for timed After Hours mode
- Matching algorithm needs proximity + preference filtering
- Ephemeral chat requires separate handling from regular chat
- "Save" mechanism converts ephemeral state to persistent match

## Constraints

- **Premium only**: After Hours mode gated by RevenueCat subscription — monetization requirement
- **Verification required**: Only verified users can access — safety requirement
- **Fixed session duration**: Timed sessions (e.g., 30 min) prevent indefinite active state
- **Location privacy**: Fuzzy location display, not exact coordinates
- **Existing stack**: Must integrate with current TypeScript/Express/Socket.IO backend and Flutter frontend

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Separate After Hours profile | Users want different presentation for After Hours vs regular dating | — Pending |
| Ephemeral chat by default | Privacy-first design for sensitive feature | — Pending |
| Session-based decline reset | Moods change, same person might be right tomorrow | — Pending |
| Auto-matching vs manual browse | Removes friction, creates urgency and spontaneity | — Pending |
| Mutual save for persistence | Both parties consent to continued connection | — Pending |

---
*Last updated: 2026-01-22 after initialization*
