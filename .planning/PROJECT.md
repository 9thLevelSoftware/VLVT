# VLVT — After Hours Mode

## What This Is

VLVT is a dating app with a Flutter frontend and Node.js microservices backend. **After Hours Mode** is a premium, time-boxed feature for spontaneous connections — users activate a session, get auto-matched by proximity and preferences, and can chat ephemerally or save matches permanently.

## Core Value

When users activate After Hours Mode, they connect with nearby interested people *immediately* — no waiting for mutual swipes, no browsing. The system does the matching; users just decide yes or no.

## Requirements

### Validated

Existing VLVT capabilities:

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

After Hours Mode (v1.0):

- ✓ User can create separate After Hours profile (dedicated photo + description) — v1.0
- ✓ User can set After Hours preferences (gender seeking, distance range) — v1.0
- ✓ User can activate After Hours mode session (fixed duration) — v1.0
- ✓ System auto-matches users by proximity within preference criteria — v1.0
- ✓ Matched profile card pops up with photo and description — v1.0
- ✓ User can tap "Chat" to connect instantly with ephemeral chat — v1.0
- ✓ User can tap "Decline" to skip (hidden for current session only) — v1.0
- ✓ Ephemeral chat disappears when session ends — v1.0
- ✓ Both users can tap "Save" to convert chat to regular match — v1.0
- ✓ Declined users reappear in future sessions (fresh each session) — v1.0
- ✓ Only verified users can access After Hours mode — v1.0
- ✓ Blocks from main app carry over to After Hours mode — v1.0
- ✓ User can block within After Hours mode (permanent) — v1.0
- ✓ Quick report/exit mechanism for bad matches — v1.0
- ✓ Location fuzzing (general area, not exact coordinates) — v1.0
- ✓ After Hours mode requires premium subscription — v1.0

### Active

(Next milestone requirements will be defined here)

### Out of Scope

- Role/position preferences (top/bottom/vers) — keep preferences focused on gender for v1
- Persistent After Hours chat history — ephemeral by design, conflicts with privacy goals
- Free tier access to After Hours mode — premium differentiator
- After Hours mode for unverified users — safety requirement

## Context

**Current state (v1.0 shipped 2026-01-24):**
- Backend: ~9,200 LOC TypeScript across auth-service, profile-service, chat-service
- Frontend: ~32,500 LOC Dart (Flutter)
- Database: 25 migrations, PostgreSQL with PostGIS-ready schema
- After Hours: 6 new tables, 7 phases, 28 plans completed

**Technical environment:**
- Microservices: auth-service (3001), profile-service (3002), chat-service (3003)
- Real-time: Socket.IO + Redis pub/sub for cross-service events
- Background jobs: BullMQ for session expiry, matching, cleanup
- Storage: R2 for photos, PostgreSQL for data

**Known considerations for next milestone:**
- iOS background location may need push notification workaround
- Interests/tags system deferred from v1.0
- Video verification for After Hours deferred from v1.0

## Constraints

- **Premium only**: After Hours mode gated by RevenueCat subscription — monetization requirement
- **Verification required**: Only verified users can access — safety requirement
- **Fixed session duration**: Timed sessions prevent indefinite active state
- **Location privacy**: Fuzzy location display, not exact coordinates
- **Existing stack**: TypeScript/Express/Socket.IO backend, Flutter frontend

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Separate After Hours profile | Users want different presentation for After Hours vs regular dating | ✓ Good |
| Ephemeral chat by default | Privacy-first design for sensitive feature | ✓ Good |
| Session-based decline reset | Moods change, same person might be right tomorrow | ✓ Good |
| Auto-matching vs manual browse | Removes friction, creates urgency and spontaneity | ✓ Good |
| Mutual save for persistence | Both parties consent to continued connection | ✓ Good |
| 500m location fuzzing | Balances privacy vs utility for proximity matching | ✓ Good |
| Redis pub/sub for match events | Decouples profile-service matching from chat-service notifications | ✓ Good |
| 30-day message retention | Server-side storage for moderation compliance | ✓ Good |
| Device fingerprinting | Ban enforcement across account recreation | ✓ Good |

---
*Last updated: 2026-01-24 after v1.0 milestone*
