# Architecture Patterns

**Domain:** After Hours Mode for Dating App
**Researched:** 2026-01-22
**Confidence:** MEDIUM-HIGH

## Recommendation: Extend Existing Services

After analyzing VLVT's existing architecture, the recommended approach is to **extend existing services** rather than create a new microservice.

**Rationale:**
1. VLVT already has three well-scoped services (auth, profile, chat) that map cleanly to After Hours Mode needs
2. Adding a fourth service introduces deployment complexity, inter-service communication overhead, and operational burden for a team presumably optimizing for delivery speed
3. After Hours Mode is conceptually "profiles + matching + chat" with time constraints — not a fundamentally different domain
4. Socket.IO infrastructure in chat-service already handles real-time messaging at the right abstraction level

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Flutter Frontend                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────────┐   │
│  │ After HoursService │  │ After HoursProfile │  │ After HoursChatService             │   │
│  │ (session mgmt)│  │ (separate     │  │ (ephemeral chat, integrates   │   │
│  │               │  │  from main)   │  │  with existing SocketService) │   │
│  └───────┬───────┘  └───────┬───────┘  └───────────────┬───────────────┘   │
└──────────┼──────────────────┼──────────────────────────┼───────────────────┘
           │                  │                          │
           │ HTTP             │ HTTP                     │ WebSocket
           ▼                  ▼                          ▼
┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐
│  profile-service │  │  profile-service │  │       chat-service          │
│  (port 3002)     │  │  (port 3002)     │  │       (port 3003)           │
│                  │  │                  │  │                             │
│ NEW ENDPOINTS:   │  │ NEW TABLES:      │  │ NEW FUNCTIONALITY:          │
│ - POST /After Hours/  │  │ - after_hours_profiles│  │ - After Hours Socket.IO rooms    │
│     session      │  │ - after_hours_prefs   │  │ - Ephemeral message storage │
│ - GET /After Hours/   │  │ - after_hours_sessions│  │ - Session-scoped chat       │
│     matches      │  │ - after_hours_declines│  │ - Save-to-permanent flow    │
│ - POST /After Hours/  │  │                  │  │ - Matching queue broadcast  │
│     preferences  │  │                  │  │                             │
└────────┬─────────┘  └────────┬─────────┘  └──────────────┬──────────────┘
         │                     │                           │
         └─────────────────────┼───────────────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │    PostgreSQL      │
                    │                    │
                    │  Existing tables + │
                    │  NEW After Hours tables │
                    └────────────────────┘
                               │
                         (Optional)
                               ▼
                    ┌────────────────────┐
                    │      Redis         │
                    │                    │
                    │ - Session cache    │
                    │ - Active user queue│
                    │ - Geospatial index │
                    └────────────────────┘
```

## Component Boundaries

### 1. profile-service Extension

**Current responsibilities:** User profiles, photos, discovery, face verification

**New responsibilities for After Hours Mode:**
| Responsibility | Why Here |
|----------------|----------|
| After Hours profile CRUD | Natural extension of profile management |
| After Hours preferences storage | Preferences are profile-adjacent data |
| Session lifecycle management | Sessions gate profile visibility |
| Proximity matching logic | Discovery filtering already uses Haversine here |
| Decline tracking | Similar to existing swipes table pattern |

**New endpoints:**
```
POST   /api/v1/After Hours/profile          # Create/update After Hours profile
GET    /api/v1/After Hours/profile          # Get own After Hours profile
POST   /api/v1/After Hours/preferences      # Set After Hours preferences
GET    /api/v1/After Hours/preferences      # Get After Hours preferences
POST   /api/v1/After Hours/session/start    # Start timed session
POST   /api/v1/After Hours/session/end      # End session early
GET    /api/v1/After Hours/session          # Get current session status
GET    /api/v1/After Hours/matches          # Get matching users in proximity
POST   /api/v1/After Hours/decline/:userId  # Decline user for this session
```

**Why not a new service:**
- After Hours profiles reference the same user_id
- Photo handling infrastructure already exists
- Geo-proximity filtering (Haversine) already implemented
- Premium/verification checks can reuse existing middleware

### 2. chat-service Extension

**Current responsibilities:** Matches, messages, Socket.IO real-time, push notifications

**New responsibilities for After Hours Mode:**
| Responsibility | Why Here |
|----------------|----------|
| Ephemeral chat rooms | Extension of existing Socket.IO rooms |
| Session-scoped messaging | Messages already have match_id context |
| Save-to-permanent conversion | Creates regular match from After Hours state |
| Real-time match notifications | Existing FCM + Socket.IO infrastructure |
| After Hours match creation | Similar to current match POST endpoint |

**New endpoints:**
```
POST   /api/v1/After Hours/connect/:userId  # Create After Hours connection (not full match)
POST   /api/v1/After Hours/save/:matchId    # Vote to save (needs mutual)
GET    /api/v1/After Hours/messages/:matchId # Get ephemeral messages
```

**New Socket.IO events:**
```
Event: After Hours:new_match
  Direction: Server → Client
  Payload: { matchedUserId, profile, distance, sessionExpiresAt }

Event: After Hours:match_declined
  Direction: Client → Server
  Payload: { matchedUserId }

Event: After Hours:send_message
  Direction: Client → Server
  Payload: { matchId, text }

Event: After Hours:message
  Direction: Server → Client
  Payload: { matchId, message }

Event: After Hours:save_requested
  Direction: Server → Client
  Payload: { matchId, requestedBy }

Event: After Hours:save_confirmed
  Direction: Server → Client
  Payload: { matchId, permanentMatchId }

Event: After Hours:session_ending
  Direction: Server → Client
  Payload: { expiresAt, minutesRemaining }

Event: After Hours:session_expired
  Direction: Server → Client
  Payload: { }
```

### 3. auth-service (No Changes)

Auth-service handles authentication only. After Hours Mode authorization (premium + verified checks) uses existing JWT payload and middleware patterns already in profile-service and chat-service.

## Data Flow

### Session Start Flow

```
1. User taps "Start After Hours Mode" in Flutter app

2. Frontend → profile-service POST /After Hours/session/start
   - Validates: premium subscription (RevenueCat check)
   - Validates: user is verified (verifications table)
   - Validates: After Hours profile exists
   - Validates: no active session
   - Creates: after_hours_sessions record with expires_at
   - Returns: { sessionId, expiresAt, duration }

3. Frontend → chat-service (Socket.IO)
   - Emits: join_after_hours_session { sessionId }
   - Server: Joins user to after-hours-active room
   - Server: Starts checking for matches

4. Frontend starts local countdown timer
```

### Matching Flow

```
1. profile-service runs matching query (triggered periodically or on new session)

2. Matching query:
   SELECT users with:
   - Active After Hours session (not expired)
   - Within distance preference of current user
   - Gender matches current user's seeking preference
   - Current user's gender matches their seeking preference
   - Not declined by either user this session
   - Not blocked by either user (permanent blocks table)
   - Verified status = true

3. For each match found:
   - profile-service notifies chat-service (internal HTTP or message queue)
   - chat-service emits After Hours:new_match to both users

4. Users see profile card, can Chat or Decline
```

### Ephemeral Chat Flow

```
1. User A taps "Chat" on User B's profile card

2. Frontend → chat-service POST /After Hours/connect/:userB
   - Creates: after_hours_matches record (type='After Hours', not regular match)
   - Creates: after_hours_conversations record with session_id
   - Returns: { matchId, conversationId }

3. chat-service emits to both users:
   - After Hours:connected { matchId, partnerProfile }

4. Messages flow through existing Socket.IO:
   - Client emits: After Hours:send_message { matchId, text }
   - Server stores in after_hours_messages (separate table, auto-expires)
   - Server emits: After Hours:message to match partner

5. When session expires:
   - Server emits: After Hours:session_expired
   - Messages NOT deleted immediately (grace period for save)
   - After grace period, cleanup job purges after_hours_messages
```

### Save-to-Permanent Flow

```
1. User A taps "Save" in ephemeral chat

2. Frontend → chat-service POST /After Hours/save/:matchId
   - Records: save_votes for this match
   - If only User A voted: notify User B via Socket.IO
   - If both voted: proceed to step 3

3. Mutual save detected:
   - Creates: regular matches record (permanent)
   - Copies: after_hours_messages to regular messages table
   - Clears: After Hours state for this pair
   - Emits: After Hours:save_confirmed { permanentMatchId }

4. Users redirected to regular chat for this new permanent match
```

## Database Schema Additions

### New Tables

```sql
-- Separate After Hours profile (different from main profile)
CREATE TABLE after_hours_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,           -- Single After Hours photo
    description TEXT,                   -- after-hours-specific bio
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- After Hours preferences
CREATE TABLE after_hours_preferences (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seeking_gender VARCHAR(50) NOT NULL,  -- Male, Female, Any
    max_distance_km INTEGER DEFAULT 10,   -- Proximity range
    interests TEXT[],                      -- Kinks/interests tags
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Active After Hours sessions
CREATE TABLE after_hours_sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,    -- NULL if still active
    latitude DECIMAL(10, 8) NOT NULL,     -- Session start location
    longitude DECIMAL(11, 8) NOT NULL,
    CONSTRAINT one_active_session UNIQUE (user_id) WHERE ended_at IS NULL
);

-- Session declines (reset each session)
CREATE TABLE after_hours_declines (
    session_id VARCHAR(255) NOT NULL REFERENCES after_hours_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    declined_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, user_id, declined_user_id)
);

-- After Hours connections (temporary matches)
CREATE TABLE after_hours_matches (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL REFERENCES after_hours_sessions(id),
    user_id_1 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_2 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    save_votes TEXT[] DEFAULT '{}',       -- Array of user_ids who voted to save
    converted_to_match_id VARCHAR(255) REFERENCES matches(id),
    UNIQUE(session_id, user_id_1, user_id_2)
);

-- Ephemeral messages (auto-cleanup)
CREATE TABLE after_hours_messages (
    id VARCHAR(255) PRIMARY KEY,
    after_hours_match_id VARCHAR(255) NOT NULL REFERENCES after_hours_matches(id) ON DELETE CASCADE,
    sender_id VARCHAR(255) NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_after_hours_sessions_active ON after_hours_sessions(user_id) WHERE ended_at IS NULL;
CREATE INDEX idx_after_hours_sessions_location ON after_hours_sessions(latitude, longitude) WHERE ended_at IS NULL;
CREATE INDEX idx_after_hours_sessions_expires ON after_hours_sessions(expires_at) WHERE ended_at IS NULL;
CREATE INDEX idx_after_hours_matches_session ON after_hours_matches(session_id);
CREATE INDEX idx_after_hours_messages_match ON after_hours_messages(after_hours_match_id);
```

## Proximity Matching Options

### Option A: PostgreSQL Haversine (Recommended for Phase 1)

**Use existing pattern from profile-service discovery:**

```sql
-- Find matching active sessions within distance
SELECT
    hs.user_id,
    hp.photo_url,
    hp.description,
    hpref.seeking_gender,
    hpref.interests,
    (6371 * acos(
        cos(radians($1)) * cos(radians(hs.latitude)) *
        cos(radians(hs.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(hs.latitude))
    )) AS distance_km
FROM after_hours_sessions hs
JOIN after_hours_profiles hp ON hs.user_id = hp.user_id
JOIN after_hours_preferences hpref ON hs.user_id = hpref.user_id
WHERE hs.ended_at IS NULL
  AND hs.expires_at > NOW()
  AND hs.user_id != $3
  AND (6371 * acos(...)) <= $4  -- max distance
  -- Preference matching
  AND (hpref.seeking_gender = $5 OR hpref.seeking_gender = 'Any')
  -- Not declined this session
  AND hs.user_id NOT IN (
      SELECT declined_user_id FROM after_hours_declines
      WHERE session_id = $6 AND user_id = $3
  )
  -- Not blocked
  AND hs.user_id NOT IN (
      SELECT blocked_user_id FROM blocks WHERE user_id = $3
      UNION
      SELECT user_id FROM blocks WHERE blocked_user_id = $3
  )
ORDER BY distance_km
LIMIT 20;
```

**Pros:**
- Consistent with existing discovery implementation
- No new infrastructure needed
- Simpler deployment

**Cons:**
- Query complexity increases with active user count
- Not optimal for thousands of concurrent After Hours sessions

### Option B: Redis Geospatial (Phase 2 if scale demands)

If After Hours Mode scales to hundreds of concurrent active sessions:

```javascript
// On session start
await redis.geoadd('After Hours:active', longitude, latitude, `user:${userId}`);
await redis.expire('After Hours:active', sessionDurationSeconds);

// Find nearby users
const nearby = await redis.georadius('After Hours:active', longitude, latitude,
    maxDistanceKm, 'km', 'WITHDIST', 'COUNT', 50);

// Filter by preferences (still hit Postgres for preference matching)
```

**Pros:**
- Sub-millisecond proximity queries
- Built-in TTL for session expiry
- Scales to thousands of concurrent users

**Cons:**
- Additional infrastructure (Redis)
- Sync complexity between Redis and Postgres
- Preference filtering still requires Postgres lookup

**Recommendation:** Start with PostgreSQL Haversine. Add Redis only if performance monitoring shows need.

## Ephemeral vs. Persistent Chat Handling

### Separation Strategy

| Aspect | Regular Chat | After Hours Chat |
|--------|--------------|-------------|
| Table | messages | after_hours_messages |
| Lifecycle | Permanent | Session-scoped |
| Match reference | matches.id | after_hours_matches.id |
| Socket.IO events | send_message | After Hours:send_message |
| Retention | Forever | Until session ends + grace period |

### Message Conversion on Save

When both users vote to save:

```sql
BEGIN;

-- Create permanent match
INSERT INTO matches (id, user_id_1, user_id_2, created_at)
VALUES ($1, $2, $3, NOW())
RETURNING id;

-- Copy messages to permanent storage
INSERT INTO messages (id, match_id, sender_id, text, created_at)
SELECT
    'msg_' || gen_random_uuid(),
    $1,  -- new permanent match_id
    sender_id,
    text,
    created_at
FROM after_hours_messages
WHERE after_hours_match_id = $4
ORDER BY created_at;

-- Mark after_hours_match as converted
UPDATE after_hours_matches
SET converted_to_match_id = $1
WHERE id = $4;

COMMIT;
```

### Cleanup Job

Scheduled job (cron or pg_cron) to clean expired After Hours data:

```sql
-- Run every 15 minutes
-- Grace period: 30 minutes after session expiry

DELETE FROM after_hours_messages hm
USING after_hours_matches hma, after_hours_sessions hs
WHERE hm.after_hours_match_id = hma.id
  AND hma.session_id = hs.id
  AND hs.expires_at < NOW() - INTERVAL '30 minutes'
  AND hma.converted_to_match_id IS NULL;  -- Don't delete if saved

DELETE FROM after_hours_matches
WHERE expires_at < NOW() - INTERVAL '30 minutes'
  AND converted_to_match_id IS NULL;

UPDATE after_hours_sessions
SET ended_at = expires_at
WHERE expires_at < NOW()
  AND ended_at IS NULL;
```

## Session State Management

### State Machine

```
     ┌─────────┐
     │  NONE   │ ◄───────────────────────────────────────┐
     └────┬────┘                                          │
          │ start_session                                 │
          ▼                                               │
     ┌─────────┐                                          │
     │ ACTIVE  │ ───── expire OR end_early ───────────────┤
     └────┬────┘                                          │
          │ get_match                                     │
          ▼                                               │
     ┌─────────┐                                          │
     │ MATCHED │ ───── decline ────────────► back to ACTIVE
     └────┬────┘                                          │
          │ chat                                          │
          ▼                                               │
     ┌─────────┐                                          │
     │CHATTING │ ───── session_expires ───────────────────┤
     └────┬────┘                                          │
          │ mutual_save                                   │
          ▼                                               │
     ┌─────────┐                                          │
     │ SAVED   │ (converted to permanent match)           │
     └─────────┘
```

### Frontend State Handling

```dart
// After HoursService state
enum After HoursState {
  inactive,       // No session
  starting,       // POST to start session
  active,         // Session running, waiting for matches
  matched,        // Profile card showing
  chatting,       // In ephemeral chat
  saving,         // Mutual save in progress
  expired,        // Session ended
}

class After HoursService extends ChangeNotifier {
  After HoursState _state = After HoursState.inactive;
  After HoursSession? _currentSession;
  List<After HoursMatch> _pendingMatches = [];
  After HoursMatch? _currentMatch;
  Timer? _expiryTimer;

  // Session countdown
  Duration get timeRemaining => _currentSession?.expiresAt.difference(DateTime.now());
}
```

## Integration Points with Existing Services

### Premium Gating (SubscriptionService)

```typescript
// profile-service/src/middleware/after-hours-auth.ts

async function requireAfter HoursAccess(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.userId;

  // Check premium subscription
  const subscription = await pool.query(
    `SELECT is_active FROM user_subscriptions
     WHERE user_id = $1 AND is_active = true
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [userId]
  );

  if (subscription.rows.length === 0) {
    return res.status(403).json({
      success: false,
      error: 'Premium subscription required for After Hours Mode',
      upgrade: true
    });
  }

  // Check verification status
  const verification = await pool.query(
    `SELECT * FROM verifications
     WHERE user_id = $1 AND status = 'approved'`,
    [userId]
  );

  if (verification.rows.length === 0) {
    return res.status(403).json({
      success: false,
      error: 'Verification required for After Hours Mode',
      requiresVerification: true
    });
  }

  next();
}
```

### Block Inheritance

Existing blocks table already enforced in discovery queries. After Hours matching query includes:

```sql
AND hs.user_id NOT IN (
    SELECT blocked_user_id FROM blocks WHERE user_id = $3
    UNION
    SELECT user_id FROM blocks WHERE blocked_user_id = $3
)
```

### Location Fuzzing

Extend existing `redactCoordinates` for After Hours display:

```typescript
// utils/geo-redact.ts (extended)

export function fuzzLocationForAfter Hours(
  latitude: number,
  longitude: number,
  fuzzRadiusKm: number = 0.5  // 500m randomization
): { latitude: number; longitude: number } {
  // Random angle
  const angle = Math.random() * 2 * Math.PI;

  // Random distance within fuzz radius
  const distance = Math.random() * fuzzRadiusKm;

  // Offset in km
  const latOffset = distance * Math.cos(angle) / 111.32;  // km to degrees
  const lngOffset = distance * Math.sin(angle) / (111.32 * Math.cos(latitude * Math.PI / 180));

  return {
    latitude: Math.round((latitude + latOffset) * 1000) / 1000,  // 3 decimal places
    longitude: Math.round((longitude + lngOffset) * 1000) / 1000
  };
}
```

## Suggested Build Order

Based on dependencies between components:

### Phase 1: Data Layer (Foundation)
1. Database migrations for After Hours tables
2. After Hours profile model and validation
3. After Hours preferences model

**Why first:** Everything depends on data storage.

### Phase 2: Profile Service Extensions
1. After Hours profile CRUD endpoints
2. After Hours preferences endpoints
3. Session start/end endpoints
4. Premium + verification middleware

**Why second:** Chat needs profiles and sessions to exist.

### Phase 3: Matching Engine
1. Proximity matching query
2. Preference filtering logic
3. Match notification trigger

**Why third:** Can test matching with mock sessions before real-time.

### Phase 4: Chat Service Extensions
1. After Hours Socket.IO room management
2. Ephemeral message storage
3. After Hours:* event handlers
4. Session expiry notifications

**Why fourth:** Depends on matching to generate connections.

### Phase 5: Save Mechanism
1. Save vote storage
2. Mutual save detection
3. Message conversion to permanent
4. Match creation from After Hours

**Why fifth:** Depends on working chat flow.

### Phase 6: Frontend Integration
1. After HoursService (session state machine)
2. After Hours profile screens
3. Preference settings
4. Match card UI
5. Ephemeral chat UI
6. Save interaction

**Why last:** Backend must be complete for testing.

### Phase 7: Cleanup & Polish
1. Cleanup job for expired sessions
2. Session reminder notifications
3. Analytics events
4. Error handling edge cases

## Anti-Patterns to Avoid

### 1. Storing Exact Coordinates in After Hours Profiles

**What:** Persisting precise GPS coordinates visible to other users.

**Why bad:** Privacy violation, stalking risk.

**Instead:** Only store coordinates in session table (ephemeral), display fuzzed location.

### 2. Synchronous Matching on Session Start

**What:** Blocking the session start request while computing all matches.

**Why bad:** Slow response, bad UX, timeout risk with many active users.

**Instead:** Return session immediately, compute matches asynchronously, push via Socket.IO.

### 3. Shared Message Table with Type Column

**What:** Using existing `messages` table with `type='After Hours'` flag.

**Why bad:**
- Cleanup queries affect production message table
- No clear ownership boundary
- Risk of accidentally exposing After Hours messages

**Instead:** Separate `after_hours_messages` table with clear lifecycle.

### 4. Client-Side Session Expiry Enforcement

**What:** Trusting client timer to end session.

**Why bad:** User can tamper, restart app to get free time.

**Instead:** Server enforces expiry via `expires_at` column, client timer is display-only.

### 5. Polling for Matches

**What:** Frontend polling `/After Hours/matches` every N seconds.

**Why bad:** Inefficient, latency in match delivery, battery drain.

**Instead:** Server pushes matches via Socket.IO when computed.

## Sources

- [Nearby Connections: Proximity-Based User Discovery](https://medium.com/@bpalav555/nearby-connections-introducing-proximity-based-user-discovery-for-real-time-dating-experiences-a0412caa8f32) - Proximity matching patterns
- [Redis Geohashing](https://dev.to/tanyonghe/redis-geohashing-storing-and-querying-location-data-with-ease-1gf4) - Geospatial matching with Redis
- [Geohash vs PostGIS](https://www.alibabacloud.com/blog/geohash-vs--postgis_597031) - Comparison of geospatial approaches
- [Ephemeral Chat Messages](https://getstream.io/blog/ephemeral-chat-messages/) - Ephemeral messaging patterns
- [Socket.IO Rooms](https://socket.io/docs/v3/rooms/) - Room management for real-time features
- [Scaling Socket.IO](https://ably.com/topic/scaling-socketio) - Horizontal scaling considerations
- [Redis Session Management](https://redis.io/solutions/session-management/) - Session caching patterns
- VLVT codebase analysis: Existing Haversine implementation in `profile-service/src/index.ts`
