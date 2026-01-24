# After Hours Mode — Roadmap

**Milestone:** v1.0 After Hours Mode
**Created:** 2026-01-22
**Phases:** 7
**Depth:** Comprehensive

## Success Criteria

1. Verified premium users can activate timed After Hours sessions
2. System auto-matches users by proximity and preferences
3. Users receive match cards and can Chat or Decline
4. Ephemeral chat works in real-time during session
5. Mutual Save converts ephemeral chat to permanent match
6. Location is fuzzed to prevent trilateration attacks
7. Blocks carry over from main app and can be added in After Hours
8. Session expires automatically after duration

---

## Phase 1: Foundation & Safety ✓

**Goal:** Establish data layer and privacy utilities that must be correct from day one

**Status:** Complete
**Completed:** 2026-01-22

**Rationale:** Location fuzzing and verification gates cannot be retrofitted. The database schema must exist before any features can be built. GDPR compliance starts at the data layer.

**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Database migration for After Hours tables and GDPR consent
- [x] 01-02-PLAN.md — Location fuzzing utility for privacy protection
- [x] 01-03-PLAN.md — After Hours authorization middleware (premium + verified + consent)

### Requirements Addressed
- Location fuzzing (general area, not exact coordinates)
- Only verified users can access After Hours mode
- After Hours mode requires premium subscription

### Deliverables
- [x] Database migrations for After Hours tables
- [x] Server-side location fuzzing utility (coordinate rounding + random jitter)
- [x] Premium + verification middleware for After Hours endpoints
- [x] GDPR consent flow updates

### Technical Notes
- Create `after_hours_profiles`, `after_hours_preferences`, `after_hours_sessions`, `after_hours_declines`, `after_hours_matches`, `after_hours_messages` tables
- Location fuzzing: round to 3 decimal places (~111m), add +/- 500m random jitter
- Middleware pattern: `requirePremium() + requireVerified()` chain
- Add PostGIS extension if not present (for future spatial indexing)

### Dependencies
- None (foundation phase)

### Risks
- **Trilateration attacks**: Mitigated by server-side fuzzing from day one
- **GDPR violations**: Mitigated by consent flow before any location storage

---

## Phase 2: Profile & Session Management ✓

**Goal:** Users can create After Hours profiles, set preferences, and start/end sessions

**Status:** Complete
**Completed:** 2026-01-23

**Rationale:** Cannot match users without profiles and sessions existing. This phase establishes the user-facing entry point to After Hours Mode.

**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — After Hours profile CRUD with photo upload
- [x] 02-02-PLAN.md — After Hours preferences CRUD with smart defaults
- [x] 02-03-PLAN.md — Session lifecycle with BullMQ expiry

### Requirements Addressed
- User can create separate After Hours profile (dedicated photo + description)
- User can set After Hours preferences (gender seeking, kinks/interests, distance range)
- User can activate After Hours mode session (fixed duration)

### Deliverables
- [x] After Hours profile CRUD endpoints (create, read, update)
- [x] Photo upload for After Hours profile (reuse existing Sharp pipeline)
- [x] Preferences endpoints (gender seeking, distance range)
- [x] Session start endpoint (creates session, validates eligibility)
- [x] Session end endpoint (manual early termination)
- [x] Session expiry job with BullMQ (automatic timeout)

### Technical Notes
- Profile endpoint: `POST/GET/PATCH /api/after-hours/profile`
- Preferences endpoint: `POST/PATCH /api/after-hours/preferences`
- Session endpoint: `POST /api/after-hours/session/start`, `POST /api/after-hours/session/end`
- Default session duration: 30 minutes (configurable via env)
- BullMQ delayed job: `session:expire:{sessionId}` with TTL

### Dependencies
- Phase 1 (database schema, middleware)

### Risks
- **Session state inconsistency**: Mitigate with atomic session creation in transaction
- **Photo storage**: Reuse existing R2 infrastructure, separate bucket prefix

---

## Phase 3: Matching Engine ✓

**Goal:** System automatically matches active users by proximity and preferences

**Status:** Complete
**Completed:** 2026-01-22

**Plans:** 4 plans

Plans:
- [x] 03-01-PLAN.md — Schema additions and core matching query logic
- [x] 03-02-PLAN.md — BullMQ matching scheduler (periodic + event-driven)
- [x] 03-03-PLAN.md — Decline, current match, and nearby count endpoints
- [x] 03-04-PLAN.md — Auto-decline timer and match expiry handling

**Rationale:** Core differentiator of After Hours Mode. Users don't swipe; they receive match assignments from the system. Depends on sessions existing.

### Requirements Addressed
- System auto-matches users by proximity within preference criteria
- Matched profile card pops up with photo and description
- Declined users reappear in future sessions (fresh each session)

### Deliverables
- [x] Proximity matching query (PostgreSQL Haversine, existing pattern)
- [x] Preference filter logic (gender seeking, distance range)
- [x] Match creation endpoint (called by matching job)
- [x] Match notification trigger (webhook to chat-service)
- [x] Decline endpoint (session-scoped, not permanent)
- [x] Decline reset on session start

### Technical Notes
- Matching query: existing Haversine pattern in profile-service
- Run matching as periodic job (every 30 seconds) or event-driven on session start
- Exclude: blocked users, already-matched-this-session, declined-this-session
- Match creation: insert into `after_hours_matches`, notify chat-service
- Decline storage: `after_hours_declines` with session_id FK (auto-deleted with session)

### Dependencies
- Phase 2 (sessions must exist to match within)

### Risks
- **Empty matches**: If no compatible users active, inform user gracefully
- **Race conditions**: Lock session during match creation

---

## Phase 4: Real-Time Chat ✓

**Goal:** Matched users can chat instantly with ephemeral messages

**Status:** Complete
**Completed:** 2026-01-22

**Rationale:** Depends on matching to create connections. Chat is the core interaction once matched.

**Plans:** 4 plans

Plans:
- [x] 04-01-PLAN.md — Redis pub/sub subscriber and After Hours Socket.IO handlers
- [x] 04-02-PLAN.md — Ephemeral message handlers and HTTP history endpoint
- [x] 04-03-PLAN.md — 30-day message retention cleanup and session expiry notifications
- [x] 04-04-PLAN.md — Flutter socket events and chat service

### Requirements Addressed
- User can tap "Chat" to connect instantly with ephemeral chat
- Ephemeral chat disappears when session ends

### Deliverables
- [x] Socket.IO room management for After Hours matches
- [x] Ephemeral message storage (after_hours_messages table)
- [x] `after_hours:match` event handler (relayed from Redis pub/sub)
- [x] `after_hours:send_message` event handler
- [x] `after_hours:typing` event handler
- [x] Session expiry notification to connected users
- [x] Server-side message retention for safety (30 days post-session)
- [x] Message cleanup job for expired+unsaved sessions

### Technical Notes
- Room naming: `after_hours:match:{matchId}`
- Events: `after_hours:new_match`, `after_hours:send_message`, `after_hours:typing`, `after_hours:session_expiring`, `after_hours:session_expired`
- Rate limiting: reuse existing socket rate limiter patterns
- Retention: keep messages server-side for 30 days even if UI shows "deleted"
- Cleanup: BullMQ job runs daily, deletes messages older than retention period where match not saved

### Dependencies
- Phase 3 (matches must exist to chat within)

### Risks
- **Battery drain**: Use adaptive polling, not aggressive keep-alive
- **Notification spam**: Batch notifications during high-activity periods
- **Evidence destruction**: Server-side retention mitigates unmatch-before-report

---

## Phase 5: Save Mechanism & Conversion ✓

**Goal:** Both users can "Save" to convert ephemeral connection to permanent match

**Status:** Complete
**Completed:** 2026-01-23

**Rationale:** Allows genuine connections to persist beyond the session while defaulting to privacy.

**Plans:** 3 plans

Plans:
- [x] 05-01-PLAN.md — Backend save endpoint with atomic conversion and notifications
- [x] 05-02-PLAN.md — Flutter save button and service integration
- [x] 05-03-PLAN.md — Gap closure: Wire Socket.IO to After Hours router

### Requirements Addressed
- Both users can tap "Save" to convert chat to regular match
- Ephemeral chat disappears when session ends (unless saved)

### Deliverables
- [x] Save vote endpoint (`POST /api/after-hours/matches/{id}/save`)
- [x] Save vote storage (both users must vote)
- [x] Mutual save detection logic
- [x] Message copy from ephemeral to permanent table
- [x] Regular match creation in existing `matches` table
- [x] Notification to both users on successful save
- [x] UI state update via Socket.IO (gap closure complete)

### Technical Notes
- Save votes: `after_hours_matches.user1_save_vote`, `user2_save_vote` (boolean)
- Mutual detection: trigger on second vote, check both true
- Copy messages: `INSERT INTO messages SELECT ... FROM after_hours_messages WHERE match_id = ?`
- Create match: insert into `matches` table with special `source = 'after_hours'`
- Notify: `after_hours:match_saved` event to both users

### Dependencies
- Phase 4 (chat must exist to save)

### Risks
- **Partial save state**: Handle case where one saves but session expires before other decides
- **Duplicate matches**: Check existing matches before creating

---

## Phase 6: Frontend Integration ✓

**Goal:** Complete Flutter UI for After Hours Mode

**Status:** Complete
**Completed:** 2026-01-23

**Rationale:** Backend must be complete for meaningful frontend testing. This phase brings it all together for users.

**Plans:** 6 plans

Plans:
- [x] 06-01-PLAN.md — AfterHoursService state machine and tab navigation
- [x] 06-02-PLAN.md — After Hours profile and preferences screens
- [x] 06-03-PLAN.md — Session activation flow and timer widgets
- [x] 06-04-PLAN.md — Match card overlay with swipe gestures
- [x] 06-05-PLAN.md — Ephemeral chat screen and background location
- [x] 06-06-PLAN.md — Gap closure: API integration, provider registration, foreground task

### Requirements Addressed
- All user-facing interactions from PROJECT.md Active requirements

### Deliverables
- [x] `AfterHoursService` (session state machine: inactive -> active -> matched -> chatting)
- [x] After Hours profile creation screens
- [x] After Hours preferences settings screen
- [x] Session activation flow with countdown timer
- [x] Match card UI (photo, description, Chat/Decline buttons)
- [x] Ephemeral chat UI (similar to existing chat, with session timer)
- [x] Save button interaction and confirmation
- [x] Session expiry handling (graceful transition back to main app)
- [x] Real API calls in AfterHoursService
- [x] AfterHoursProfileService provider registration
- [x] Background location handling (flutter_foreground_task)

### Technical Notes
- State machine: `AfterHoursState { inactive, activating, searching, matched, chatting, expiring, expired }`
- Profile screens: reuse existing photo picker, adapt form for After Hours fields
- Match card: Modal overlay with swipe gestures (Tinder-style)
- Chat UI: fork existing ChatScreen, add session timer and save button
- Background location: required for Android 14+ foreground service compliance

### Dependencies
- Phases 1-5 (full backend)

### Risks
- **iOS background limitations**: May need push notification workaround
- **State complexity**: Comprehensive testing of all state transitions

---

## Phase 7: Safety Systems & Polish ✓

**Goal:** Production-ready safety features and operational polish

**Status:** Complete
**Completed:** 2026-01-24

**Rationale:** Final layer before launch. Addresses remaining safety requirements and operational concerns.

**Plans:** 5 plans

Plans:
- [x] 07-01-PLAN.md — Backend block and report endpoints for After Hours
- [x] 07-02-PLAN.md — Device fingerprinting and photo perceptual hashing
- [x] 07-03-PLAN.md — Session cleanup jobs (BullMQ)
- [x] 07-04-PLAN.md — Frontend quick report flow with auto-exit
- [x] 07-05-PLAN.md — Analytics events for After Hours funnel

### Requirements Addressed
- Blocks from main app carry over to After Hours mode
- User can block within After Hours mode (permanent)
- Quick report/exit mechanism for bad matches

### Deliverables
- [x] Block synchronization (main app blocks apply to After Hours) - already implemented in matching-engine.ts
- [x] After Hours block endpoint (creates permanent block)
- [x] After Hours report endpoint with auto-block
- [x] Device fingerprinting for ban enforcement
- [x] Photo hashing against ban database
- [x] Quick report flow (one-tap report + exit)
- [x] Session cleanup jobs (expired sessions, orphaned data)
- [x] Analytics events for After Hours funnel

### Technical Notes
- Block sync: already implemented - `blocks` table queried in matching-engine.ts
- New block: insert into `blocks` table, same as main app
- Device fingerprint: store IDFV/Android ID + device model at session start
- Photo hash: perceptual hash via sharp-phash, compare against banned_photo_hashes table
- Report flow: `POST /api/after-hours/matches/{id}/report` with reason enum, auto-blocks
- Analytics: `after_hours_session_started`, `after_hours_match_received`, `after_hours_chat_started`, `after_hours_match_saved`
- Cleanup: BullMQ job at 4 AM UTC (1 hour after message cleanup)

### Dependencies
- Phase 6 (frontend must exist for full integration testing)

### Risks
- **Ban evasion sophistication**: Monitor for patterns, iterate on fingerprinting
- **Moderation scale**: Plan for launch traffic spikes

---

## Phase Summary

| Phase | Name | Deliverables | Dependencies |
|-------|------|--------------|--------------|
| 1 | Foundation & Safety ✓ | Schema, location fuzzing, middleware | None |
| 2 | Profile & Session ✓ | Profile CRUD, preferences, session lifecycle | Phase 1 |
| 3 | Matching Engine ✓ | Proximity matching, preference filtering | Phase 2 |
| 4 | Real-Time Chat ✓ | Ephemeral chat, Socket.IO events | Phase 3 |
| 5 | Save Mechanism ✓ | Mutual save, conversion to permanent | Phase 4 |
| 6 | Frontend Integration ✓ | Complete Flutter UI | Phases 1-5 |
| 7 | Safety Systems ✓ | Blocking, reporting, ban enforcement | Phase 6 |

---

## Open Questions (To Resolve During Planning)

1. ~~**Session extension**: Should premium users be able to extend sessions?~~ **RESOLVED:** Yes, unlimited extensions (see 02-CONTEXT.md)
2. ~~**Empty queue behavior**: What happens when no compatible users are active?~~ **RESOLVED:** Emit `after_hours:no_matches` with active user count for social proof (see 03-CONTEXT.md)
3. **iOS background location**: Accept limitations or implement push workaround?
4. **Interests/tags**: Include basic version or defer to v2?
5. **Video verification**: Add video liveness specifically for After Hours?

---

*Roadmap created: 2026-01-22*
*Ready for phase planning: yes*
