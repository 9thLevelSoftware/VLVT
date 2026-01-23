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

## Phase 4: Real-Time Chat

**Goal:** Matched users can chat instantly with ephemeral messages

**Rationale:** Depends on matching to create connections. Chat is the core interaction once matched.

### Requirements Addressed
- User can tap "Chat" to connect instantly with ephemeral chat
- Ephemeral chat disappears when session ends

### Deliverables
- [ ] Socket.IO room management for After Hours matches
- [ ] Ephemeral message storage (after_hours_messages table)
- [ ] `after_hours:new_match` event handler
- [ ] `after_hours:send_message` event handler
- [ ] `after_hours:typing` event handler
- [ ] Session expiry notification to connected users
- [ ] Server-side message retention for safety (30 days post-session)
- [ ] Message cleanup job for expired+unsaved sessions

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

## Phase 5: Save Mechanism & Conversion

**Goal:** Both users can "Save" to convert ephemeral connection to permanent match

**Rationale:** Allows genuine connections to persist beyond the session while defaulting to privacy.

### Requirements Addressed
- Both users can tap "Save" to convert chat to regular match
- Ephemeral chat disappears when session ends (unless saved)

### Deliverables
- [ ] Save vote endpoint (`POST /api/after-hours/matches/{id}/save`)
- [ ] Save vote storage (both users must vote)
- [ ] Mutual save detection logic
- [ ] Message copy from ephemeral to permanent table
- [ ] Regular match creation in existing `matches` table
- [ ] Notification to both users on successful save
- [ ] UI state update via Socket.IO

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

## Phase 6: Frontend Integration

**Goal:** Complete Flutter UI for After Hours Mode

**Rationale:** Backend must be complete for meaningful frontend testing. This phase brings it all together for users.

### Requirements Addressed
- All user-facing interactions from PROJECT.md Active requirements

### Deliverables
- [ ] `AfterHoursService` (session state machine: inactive -> active -> matched -> chatting)
- [ ] After Hours profile creation screens
- [ ] After Hours preferences settings screen
- [ ] Session activation flow with countdown timer
- [ ] Match card UI (photo, description, Chat/Decline buttons)
- [ ] Ephemeral chat UI (similar to existing chat, with session timer)
- [ ] Save button interaction and confirmation
- [ ] Session expiry handling (graceful transition back to main app)
- [ ] Background location handling (flutter_foreground_task)

### Technical Notes
- State machine: `AfterHoursState { inactive, activating, active, matched, chatting, expired }`
- Profile screens: reuse existing photo picker, adapt form for After Hours fields
- Match card: Card widget with CachedNetworkImage, two action buttons
- Chat UI: fork existing ChatScreen, add session timer and save button
- Background location: required for Android 14+ foreground service compliance

### Dependencies
- Phases 1-5 (full backend)

### Risks
- **iOS background limitations**: May need push notification workaround
- **State complexity**: Comprehensive testing of all state transitions

---

## Phase 7: Safety Systems & Polish

**Goal:** Production-ready safety features and operational polish

**Rationale:** Final layer before launch. Addresses remaining safety requirements and operational concerns.

### Requirements Addressed
- Blocks from main app carry over to After Hours mode
- User can block within After Hours mode (permanent)
- Quick report/exit mechanism for bad matches

### Deliverables
- [ ] Block synchronization (main app blocks apply to After Hours)
- [ ] After Hours block endpoint (creates permanent block)
- [ ] Device fingerprinting for ban enforcement
- [ ] Photo hashing against ban database
- [ ] Quick report flow (one-tap report + exit)
- [ ] Moderation queue for After Hours reports
- [ ] Cleanup jobs (expired sessions, orphaned data)
- [ ] Analytics events for After Hours funnel
- [ ] Edge case handling and error states

### Technical Notes
- Block sync: query existing `blocks` table in matching exclusion logic
- New block: insert into `blocks` table, same as main app
- Device fingerprint: store IDFA/GAID + device ID at session start
- Photo hash: perceptual hash on After Hours profile photo, compare against banned hashes
- Report flow: `POST /api/after-hours/matches/{id}/report` with reason enum
- Analytics: `after_hours_session_started`, `after_hours_match_received`, `after_hours_chat_started`, `after_hours_match_saved`

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
| 4 | Real-Time Chat | Ephemeral chat, Socket.IO events | Phase 3 |
| 5 | Save Mechanism | Mutual save, conversion to permanent | Phase 4 |
| 6 | Frontend Integration | Complete Flutter UI | Phases 1-5 |
| 7 | Safety Systems | Blocking, reporting, ban enforcement | Phase 6 |

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
