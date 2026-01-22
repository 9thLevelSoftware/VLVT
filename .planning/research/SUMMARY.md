# Project Research Summary

**Project:** VLVT Dating App - After Hours Mode
**Domain:** Proximity-based After Hours/casual dating feature
**Researched:** 2026-01-22
**Confidence:** HIGH

## Executive Summary

After Hours Mode is a premium, timed, proximity-based matching feature for the VLVT dating app. Research confirms this is a well-established domain with clear patterns: the core loop of session-based matching with ephemeral chat has been validated by apps like Pure and Grindr's "Right Now." The recommended approach is to **extend existing services** (profile-service and chat-service) rather than create new microservices, leveraging VLVT's existing PostgreSQL Haversine implementation for proximity queries and Socket.IO infrastructure for real-time messaging.

The key differentiation is VLVT's **auto-matching system** (system assigns matches vs. endless swiping) combined with **ephemeral-by-default chat with mutual save**. No major competitor offers both. This creates urgency, reduces decision fatigue, and respects privacy while allowing genuine connections to persist.

Critical risks center on **location privacy** (trilateration attacks have been demonstrated on 6 major dating apps), **ban evasion** (a December 2025 lawsuit explicitly cited this as "defective design"), and **deepfake verification bypass** (60% of users cannot identify AI-generated profiles). All three require proactive mitigation in Phase 1 - they cannot be bolted on later. VLVT's existing KYCAid + Rekognition verification provides a foundation, but must be enhanced with server-side location fuzzing, device fingerprinting for ban enforcement, and deepfake detection.

## Technology Decisions

The existing VLVT stack (Flutter + Node.js/Express + Socket.IO + PostgreSQL + Redis) is well-suited for After Hours Mode. Key additions:

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **PostGIS** | Geospatial queries | Precise distance calculations, spatial indexing; superior to earthdistance extension |
| **Redis GEOADD/GEOSEARCH** | Real-time proximity cache | Sub-millisecond queries for active users; already in stack |
| **BullMQ** | Session expiry scheduling | Robust delayed jobs that survive restarts; replaces unmaintained alternatives |
| **@socket.io/redis-adapter** | Horizontal scaling | Modern replacement for deprecated socket.io-redis; supports sharded Pub/Sub |
| **flutter_foreground_task** | Background location (mobile) | Required for Android 14+ foreground services; works with existing geolocator |

**Upgrade required:** Replace deprecated `socket.io-redis: ^6.1.1` with `@socket.io/redis-adapter: ^8.3.x`.

**Start simple:** Use PostgreSQL Haversine (existing pattern) for Phase 1. Add Redis Geo only if scale demands (hundreds of concurrent sessions).

## Feature Landscape

### Table Stakes (Must Have for Launch)
- Photo verification gate (existing Rekognition - make mandatory)
- Separate After Hours profile (photo + description)
- Basic preferences (gender seeking, distance range)
- 30-minute timed sessions
- Location fuzzing (ranges like "< 1 km", not exact coordinates)
- Ephemeral chat with mutual save mechanism
- Blocking (permanent, bidirectional, cross-feature)
- Premium gate (RevenueCat integration)

### Differentiators (VLVT's Competitive Edge)
- **Auto-matching system** - No swiping; system assigns matches and pushes profile cards
- **Ephemeral-by-default with mutual save** - Privacy first, but connections can persist
- **Session-scoped declines** - "Not tonight" does not equal "never"
- **Separate After Hours profile** - Context-appropriate presentation

### Anti-Features (Do NOT Build)
- Exact location display (trilateration risk)
- Unlimited session duration (zombie profiles)
- Swipe-based interface (conflicts with auto-matching)
- AI-generated responses (authenticity is paramount)
- Social media integration (privacy concern)
- Algorithmic desirability scoring (creates harmful feedback loops)

### Defer to Post-MVP
- Kinks/interests tags
- Session extension option
- Voice messages
- Activity notifications ("X just went live")

## Architecture Approach

**Recommendation: Extend existing services, not new microservice.**

- **profile-service** gains: After Hours profiles, preferences, session lifecycle, proximity matching
- **chat-service** gains: After Hours Socket.IO rooms, ephemeral messages, save-to-permanent flow
- **auth-service**: No changes needed (existing JWT + middleware patterns sufficient)

**Data Flow:**
1. User activates session via profile-service (validates premium + verification)
2. profile-service creates session record, adds user to matching pool
3. Matching runs periodically, finds compatible nearby active users
4. chat-service notifies both users via Socket.IO (`After Hours:new_match`)
5. Users chat in ephemeral room; messages stored in `after_hours_messages` table
6. Session expires: messages deleted unless both tapped "Save"
7. Mutual save: messages copied to permanent `messages` table, regular match created

**New Database Tables:**
- `after_hours_profiles` - Separate profile for After Hours
- `after_hours_preferences` - Gender seeking, distance, interests
- `after_hours_sessions` - Active sessions with expiry
- `after_hours_declines` - Session-scoped declines (reset each session)
- `after_hours_matches` - Temporary connections
- `after_hours_messages` - Ephemeral messages (auto-cleanup)

## Critical Risks

### 1. Trilateration Location Attacks (CRITICAL)
**Risk:** Attackers pinpoint exact user location within 10-111 meters by spoofing GPS from multiple points.
**Prevention:** Server-side coordinate rounding (3 decimals), random jitter (+/- 500m), distance buckets not continuous values, randomized ordering within buckets, rate-limited queries.
**Phase:** Must be correct in Phase 1. Cannot retrofit.

### 2. Ban Evasion (CRITICAL)
**Risk:** Banned predators return within hours using same photos/identity. December 2025 lawsuit cited this as "defective design."
**Prevention:** Device fingerprinting (IDFA/GAID + device ID), photo hashing against ban database, verification selfie comparison against banned faces, phone number reputation scoring.
**VLVT Advantage:** Tie bans to verified identity, not just accounts.
**Phase:** Phase 2 (Safety Systems) - Must launch with this.

### 3. Deepfake Verification Bypass (CRITICAL)
**Risk:** Scammers use real-time deepfake video to pass liveness checks. 62% of users cannot identify AI profiles.
**Prevention:** ISO 30107-3 certified liveness detection, deepfake detection models, 99%+ confidence threshold (not 80%), behavioral verification, human review for edge cases.
**Phase:** Phase 1 - Foundation must resist current attacks.

### 4. Unmatch-Before-Report Exploitation (HIGH)
**Risk:** Bad actors unmatch victims before they can report, erasing evidence.
**Prevention:** Server-side chat retention (30-90 days post-unmatch), allow reporting after unmatch, flag rapid unmatch patterns as suspicious.
**VLVT Note:** Ephemeral UI can coexist with server-side retention for safety. Be transparent in ToS.
**Phase:** Phase 2 (Chat Implementation).

### 5. GDPR/Privacy Violations (HIGH)
**Risk:** Location + implied sexual orientation = "special category" data. Grindr fined 6.5M EUR for improper handling.
**Prevention:** Explicit consent with purpose limitation, no location sharing with third parties, data minimization, clear deletion on account deletion, documented Article 9 legal basis.
**Phase:** Phase 1 - Consent flows from start.

## Implementation Priorities

Based on dependencies and risk analysis:

### Phase 1: Foundation & Safety (Weeks 1-2)
**Rationale:** Location fuzzing and verification must be correct from day one. Data layer must exist before any features.
**Delivers:** Database schema, location privacy utilities, enhanced verification gate
**Addresses:** Trilateration risk, GDPR compliance, deepfake bypass
**Build Order:**
1. Database migrations (After Hours tables)
2. Server-side location fuzzing utility
3. Premium + verification middleware
4. Consent flow updates

### Phase 2: Profile & Session Management (Weeks 3-4)
**Rationale:** Cannot match users without profiles and sessions.
**Delivers:** After Hours profile CRUD, preferences, session lifecycle
**Implements:** profile-service extensions
**Build Order:**
1. After Hours profile endpoints
2. Preferences endpoints
3. Session start/end endpoints
4. Session expiry with BullMQ

### Phase 3: Matching Engine (Week 5)
**Rationale:** Core differentiator; depends on sessions existing.
**Delivers:** Proximity matching, preference filtering, match notifications
**Uses:** PostgreSQL Haversine (existing pattern)
**Build Order:**
1. Proximity matching query
2. Preference filter logic
3. Match notification trigger to chat-service

### Phase 4: Real-Time Chat (Weeks 6-7)
**Rationale:** Depends on matching to create connections.
**Delivers:** Ephemeral chat rooms, session-scoped messaging, Socket.IO events
**Avoids:** Battery drain (adaptive polling), overwhelming notifications
**Build Order:**
1. Socket.IO room management for After Hours
2. Ephemeral message storage
3. After Hours:* event handlers
4. Session expiry notifications
5. Server-side retention for safety

### Phase 5: Save Mechanism & Conversion (Week 8)
**Rationale:** Depends on working chat flow.
**Delivers:** Mutual save voting, message conversion to permanent, match creation
**Build Order:**
1. Save vote storage
2. Mutual save detection
3. Message copy to permanent table
4. Regular match creation

### Phase 6: Frontend Integration (Weeks 9-11)
**Rationale:** Backend must be complete for testing.
**Delivers:** After HoursService state machine, profile screens, preference settings, match card UI, ephemeral chat UI, save interaction
**Uses:** flutter_foreground_task for background location
**Build Order:**
1. After HoursService (session state)
2. Profile creation screens
3. Preference settings
4. Match card UI
5. Ephemeral chat UI
6. Save interaction flow

### Phase 7: Safety Systems & Polish (Week 12)
**Rationale:** Final layer before launch.
**Delivers:** Ban evasion prevention, cleanup jobs, analytics, edge case handling
**Addresses:** Ban evasion, unmatch exploitation, moderation queue
**Build Order:**
1. Device fingerprinting
2. Photo hashing for ban detection
3. Cleanup job for expired sessions
4. Report system enhancements
5. Analytics events

## Open Questions

1. **Session duration:** 30 minutes is recommended baseline. Should premium users get extension option?
2. **Re-matching within session:** If user declines all matches, do they wait for new users to activate, or session just ends empty?
3. **iOS background limitations:** iOS limits background location to ~30s every 15min. Acceptable, or need push notification workaround?
4. **Interests/tags:** Defer to v2, or include basic version in MVP?
5. **Video verification:** Current photo verification sufficient, or add video liveness for After Hours specifically?

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Extends proven VLVT patterns; well-documented libraries |
| Features | HIGH | Multiple competitor analyses, clear market convergence |
| Architecture | MEDIUM-HIGH | Service extension is sound; some edge cases TBD |
| Pitfalls | HIGH | Recent lawsuits, security research, and GDPR cases provide clear guidance |

**Overall confidence:** HIGH

### Gaps to Address

- **iOS background location constraints:** Need practical testing during Phase 6
- **Moderation scale:** Queue management strategies need validation with launch traffic
- **Deepfake detection vendor:** Research identified need; specific vendor TBD
- **Session extension mechanics:** Product decision needed before Phase 5

## Sources

### Security Research (HIGH confidence)
- KU Leuven: Dating App Location Leaks (2024)
- Check Point: Geolocation Risks in Dating Apps
- Trend Micro: Deepfakes vs eKYC

### Legal Cases (HIGH confidence)
- NPR: Match Group Predator Investigation (Feb 2025)
- Denver Post: Hinge/Tinder Lawsuit (Dec 2025)
- Grindr GDPR Fine (Norwegian DPA)

### Industry Analysis (HIGH confidence)
- Grindr "Right Now" product announcements
- Tinder Face Check expansion (Oct 2025)
- Pure dating app model
- Feeld interests/desires system

### Technical Documentation (HIGH confidence)
- BullMQ official docs
- Socket.IO Redis adapter
- Android/iOS location services
- PostGIS vs earthdistance comparisons

---
*Research completed: 2026-01-22*
*Ready for roadmap: yes*
