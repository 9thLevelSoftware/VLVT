# Phase 3: Matching Engine - Research

**Researched:** 2026-01-22
**Domain:** Proximity-based matching, preference filtering, match delivery, decline handling
**Confidence:** HIGH

## Summary

Phase 3 implements the automatic matching engine for After Hours Mode. Users don't swipe - the system assigns matches based on proximity and preferences. This research examines the existing VLVT codebase patterns for building the matching query (Haversine formula), job scheduling (BullMQ), and real-time notifications (Socket.IO/FCM).

The codebase already contains all necessary patterns: the discovery endpoint uses Haversine for distance calculations, BullMQ handles session expiry jobs, and chat-service demonstrates Socket.IO + FCM for real-time updates. The matching engine follows these patterns closely, with additional considerations for concurrency (PostgreSQL SKIP LOCKED), decline tracking across sessions, and match delivery UX.

**Primary recommendation:** Implement matching as a BullMQ job scheduler (periodic fallback every 30 seconds) combined with event-driven triggers. Use PostgreSQL SKIP LOCKED for concurrent matching safety. Deliver matches via Socket.IO with FCM push fallback for backgrounded apps.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg | ^8.16.3 | PostgreSQL client | Existing database access, transaction support |
| bullmq | ^5.x | Job scheduling | Existing session expiry pattern, delayed/repeatable jobs |
| ioredis | ^5.x | Redis client | BullMQ dependency, already configured |
| socket.io | ^4.x | Real-time events | Existing chat-service pattern for match notifications |
| firebase-admin | ^12.x | Push notifications | Existing FCM service for offline users |
| @vlvt/shared | file:../shared | Shared middleware | After Hours auth, error codes, rate limiting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ periodic | PostgreSQL pg_cron | BullMQ already set up, more flexible with event triggers |
| SKIP LOCKED | Advisory locks | SKIP LOCKED is simpler, no need for explicit lock management |
| Socket.IO rooms | Direct emit to all | Rooms provide natural user grouping, better isolation |

**Installation:** No new packages required - all dependencies already in profile-service.

## Architecture Patterns

### Recommended Project Structure
```
backend/profile-service/src/
├── routes/
│   └── after-hours.ts          # Add matching endpoints
├── services/
│   ├── session-scheduler.ts    # Existing - extend with matching triggers
│   └── matching-engine.ts      # NEW - matching query logic
├── jobs/
│   └── matching-job.ts         # NEW - BullMQ worker for periodic matching
└── utils/
    └── distance-calculator.ts  # NEW - Haversine formula (extracted)
```

### Pattern 1: Proximity Matching Query with Haversine
**What:** SQL query combining distance calculation, preference filtering, and exclusion logic
**When to use:** Finding compatible active users for matching
**Example:**
```typescript
// Source: Existing profile-service/src/index.ts lines 1214-1236
// Adapted for After Hours matching

interface MatchCandidate {
  userId: string;
  sessionId: string;
  name: string;
  age: number;
  photoUrl: string;
  description: string;
  distance: number;
}

async function findMatchCandidates(
  pool: Pool,
  userId: string,
  sessionId: string,
  userLocation: { lat: number; lng: number },
  preferences: UserPreferences
): Promise<MatchCandidate[]> {
  // Haversine formula for distance in km
  // 6371 = Earth radius in km
  const query = `
    WITH user_session AS (
      SELECT id, fuzzed_latitude, fuzzed_longitude
      FROM after_hours_sessions
      WHERE user_id = $1 AND ended_at IS NULL
    ),
    active_sessions AS (
      SELECT
        s.id as session_id,
        s.user_id,
        s.fuzzed_latitude,
        s.fuzzed_longitude,
        ahp.photo_url,
        ahp.description,
        p.name,
        p.age,
        p.gender,
        pref.seeking_gender,
        (
          6371 * acos(
            cos(radians($2)) * cos(radians(s.fuzzed_latitude)) *
            cos(radians(s.fuzzed_longitude) - radians($3)) +
            sin(radians($2)) * sin(radians(s.fuzzed_latitude))
          )
        ) AS distance
      FROM after_hours_sessions s
      JOIN after_hours_profiles ahp ON ahp.user_id = s.user_id
      JOIN profiles p ON p.user_id = s.user_id
      JOIN after_hours_preferences pref ON pref.user_id = s.user_id
      WHERE s.ended_at IS NULL
        AND s.expires_at > NOW()
        AND s.user_id != $1
    )
    SELECT *
    FROM active_sessions a
    WHERE distance <= $4
      -- Mutual gender preference matching
      AND (a.seeking_gender = 'Any' OR a.seeking_gender = $5)
      AND ($6 = 'Any' OR $6 = a.gender)
      -- Age range filtering
      AND a.age >= $7 AND a.age <= $8
      -- Exclude blocked users (bidirectional)
      AND a.user_id NOT IN (
        SELECT blocked_user_id FROM blocks WHERE user_id = $1
        UNION
        SELECT user_id FROM blocks WHERE blocked_user_id = $1
      )
      -- Exclude already matched this session
      AND a.user_id NOT IN (
        SELECT user_id_2 FROM after_hours_matches WHERE session_id = $9 AND user_id_1 = $1
        UNION
        SELECT user_id_1 FROM after_hours_matches WHERE session_id = $9 AND user_id_2 = $1
      )
      -- Exclude declined this session (3-session memory)
      AND a.user_id NOT IN (
        SELECT declined_user_id FROM after_hours_declines
        WHERE user_id = $1
          AND decline_count < 3  -- Reappear after 3 sessions
      )
      -- Exclude users who declined me (for 3 sessions)
      AND $1 NOT IN (
        SELECT declined_user_id FROM after_hours_declines
        WHERE user_id = a.user_id
          AND decline_count < 3
      )
    ORDER BY distance ASC
    LIMIT 1
  `;

  const result = await pool.query(query, [
    userId,
    userLocation.lat,
    userLocation.lng,
    preferences.maxDistanceKm,
    preferences.seekingGender,
    userGender,
    preferences.minAge,
    preferences.maxAge,
    sessionId
  ]);

  return result.rows;
}
```

### Pattern 2: Match Creation with SELECT FOR UPDATE SKIP LOCKED
**What:** Atomic match creation preventing race conditions when two users could be matched simultaneously
**When to use:** Creating after_hours_matches to prevent duplicate matches
**Example:**
```typescript
// Source: PostgreSQL SKIP LOCKED pattern for concurrent job processing
// https://www.inferable.ai/blog/posts/postgres-skip-locked

async function createAfterHoursMatch(
  pool: Pool,
  user1Id: string,
  session1Id: string,
  user2Id: string,
  session2Id: string
): Promise<AfterHoursMatch | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock both users' active sessions to prevent concurrent matching
    // SKIP LOCKED ensures another matching job won't wait, just skip
    const lockCheck = await client.query(
      `SELECT id, user_id FROM after_hours_sessions
       WHERE user_id IN ($1, $2)
         AND ended_at IS NULL
         AND id NOT IN (
           SELECT session_id FROM after_hours_matches
           WHERE (user_id_1 = $1 OR user_id_2 = $1)
             AND created_at > NOW() - INTERVAL '5 minutes'
         )
       FOR UPDATE SKIP LOCKED`,
      [user1Id, user2Id]
    );

    // If we couldn't lock both sessions, someone else is matching them
    if (lockCheck.rows.length < 2) {
      await client.query('ROLLBACK');
      return null; // Try again with next candidate
    }

    // Calculate match expiry (shorter of both sessions' expiry, max 10 min)
    const expiryResult = await client.query(
      `SELECT LEAST(
        (SELECT expires_at FROM after_hours_sessions WHERE id = $1),
        (SELECT expires_at FROM after_hours_sessions WHERE id = $2),
        NOW() + INTERVAL '10 minutes'
      ) as expires_at`,
      [session1Id, session2Id]
    );

    // Create the match
    const matchResult = await client.query(
      `INSERT INTO after_hours_matches
       (session_id, user_id_1, user_id_2, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [session1Id, user1Id, user2Id, expiryResult.rows[0].expires_at]
    );

    await client.query('COMMIT');

    return matchResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Pattern 3: BullMQ Job Scheduler for Periodic Matching
**What:** Repeatable job that runs matching for all active sessions periodically
**When to use:** Fallback when event-driven matching doesn't fire
**Example:**
```typescript
// Source: BullMQ Job Schedulers documentation
// https://docs.bullmq.io/guide/job-schedulers

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const QUEUE_NAME = 'after-hours-matching';

let matchingQueue: Queue | null = null;
let matchingWorker: Worker | null = null;

export async function initializeMatchingScheduler(
  pool: Pool,
  io: SocketServer
): Promise<void> {
  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  matchingQueue = new Queue(QUEUE_NAME, { connection });

  // Set up periodic job scheduler (every 30 seconds)
  await matchingQueue.upsertJobScheduler(
    'periodic-matching',
    { every: 30000 }, // 30 seconds
    { name: 'run-matching-cycle', data: {} }
  );

  matchingWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === 'run-matching-cycle') {
        await runMatchingCycleForAllSessions(pool, io);
      } else if (job.name === 'match-single-user') {
        // Event-driven: user just joined or declined
        await runMatchingForUser(pool, io, job.data.userId, job.data.sessionId);
      }
    },
    { connection }
  );

  matchingWorker.on('failed', (job, err) => {
    logger.error('Matching job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Matching scheduler initialized', { interval: '30s' });
}

// Trigger matching for specific user (event-driven)
export async function triggerMatchingForUser(
  userId: string,
  sessionId: string
): Promise<void> {
  if (!matchingQueue) return;

  await matchingQueue.add(
    'match-single-user',
    { userId, sessionId },
    {
      delay: 15000, // 15 second delay after session start
      jobId: `match:user:${userId}:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: 10,
    }
  );
}
```

### Pattern 4: Real-time Match Delivery via Socket.IO
**What:** Notify user of new match using existing Socket.IO infrastructure
**When to use:** Delivering match card to user's app
**Example:**
```typescript
// Source: chat-service/src/socket/index.ts - broadcastOnlineStatus pattern
// Adapted for After Hours match delivery

async function deliverMatchToUser(
  io: SocketServer,
  pool: Pool,
  userId: string,
  match: AfterHoursMatch,
  otherUserProfile: MatchCardProfile
): Promise<void> {
  // Resolve photo URL to presigned URL
  const photoUrl = otherUserProfile.photoUrl
    ? await resolvePhotoUrl(otherUserProfile.photoUrl)
    : null;

  const matchCard = {
    matchId: match.id,
    expiresAt: match.expires_at,
    profile: {
      name: otherUserProfile.name,
      age: otherUserProfile.age,
      photoUrl,
      description: otherUserProfile.description,
      distance: otherUserProfile.distance, // Already calculated
    },
    // Timer for auto-decline (from CONTEXT.md decision)
    autoDeclineAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  };

  // Emit to user's room (existing pattern from chat-service)
  io.to(`user:${userId}`).emit('after_hours_match', matchCard);

  logger.info('Match delivered via Socket.IO', {
    userId,
    matchId: match.id,
    otherUserId: otherUserProfile.userId,
  });

  // Also send FCM push for offline/backgrounded users
  await sendAfterHoursMatchNotification(pool, userId, otherUserProfile.name);
}

// FCM notification for backgrounded app
async function sendAfterHoursMatchNotification(
  pool: Pool,
  recipientUserId: string,
  matchedUserName: string
): Promise<void> {
  if (!isFirebaseReady()) return;

  const tokens = await getUserTokens(pool, recipientUserId);
  if (tokens.length === 0) return;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: 'New match nearby!',
      body: `${matchedUserName} is ready to connect`,
    },
    data: {
      type: 'after_hours_match',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    apns: {
      payload: {
        aps: { sound: 'default', badge: 1, contentAvailable: true },
      },
    },
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'after_hours', priority: 'high' },
    },
  };

  await admin.messaging().sendEachForMulticast(message);
}
```

### Pattern 5: Decline Tracking with Session Counter
**What:** Track declines with counter to allow reappearance after N sessions
**When to use:** POST /decline endpoint and matching exclusion query
**Example:**
```typescript
// Source: CONTEXT.md decision - "declined users excluded for 3 sessions"

// Modified schema needed (see migration):
// after_hours_declines needs:
// - decline_count INTEGER DEFAULT 1
// - first_declined_at TIMESTAMP (for analytics)
// - last_session_id UUID (track which session triggered this)

async function recordDecline(
  pool: Pool,
  userId: string,
  sessionId: string,
  declinedUserId: string
): Promise<void> {
  // Upsert: increment counter if exists, create if new
  await pool.query(
    `INSERT INTO after_hours_declines
     (user_id, declined_user_id, session_id, decline_count, first_declined_at, last_session_id)
     VALUES ($1, $2, $3, 1, NOW(), $3)
     ON CONFLICT (user_id, declined_user_id)
     DO UPDATE SET
       decline_count = after_hours_declines.decline_count + 1,
       last_session_id = $3`,
    [userId, declinedUserId, sessionId]
  );

  logger.info('Decline recorded', { userId, declinedUserId, sessionId });

  // Trigger matching to find next candidate
  await triggerMatchingForUser(userId, sessionId);
}

// Reset decline counter after 3 sessions (cron job or on session end)
async function resetDeclineCounters(pool: Pool): Promise<void> {
  // Find declines older than 3 sessions for any given user pair
  // This runs as part of session cleanup
  await pool.query(
    `UPDATE after_hours_declines
     SET decline_count = 0
     WHERE decline_count >= 3
       AND last_session_id NOT IN (
         SELECT id FROM after_hours_sessions
         WHERE ended_at IS NULL
       )`
  );
}
```

### Anti-Patterns to Avoid
- **Polling in frontend:** Use Socket.IO events, not HTTP polling for match status
- **Matching in request handler:** Use BullMQ job to avoid blocking HTTP request
- **SELECT without SKIP LOCKED:** Race condition when multiple workers match simultaneously
- **Storing presigned URLs:** Store R2 keys, resolve to presigned URLs on delivery
- **Blocking on Redis:** Use fire-and-forget pattern like session-scheduler.ts

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distance calculation | Custom math | Haversine in SQL (existing pattern) | PostgreSQL handles precision, indexing |
| Concurrent job processing | Application-level locks | SELECT FOR UPDATE SKIP LOCKED | Database-level atomicity, no distributed state |
| Periodic job scheduling | setInterval/setTimeout | BullMQ Job Schedulers | Survives restarts, exactly-once execution |
| Real-time notifications | Long polling | Socket.IO rooms | Already configured, proven pattern |
| Push for offline users | Custom push logic | FCM service (existing) | Handles token rotation, multicast |

**Key insight:** The matching engine is primarily a composition of existing patterns (Haversine + BullMQ + Socket.IO). The novel work is the matching query logic and decline memory across sessions.

## Common Pitfalls

### Pitfall 1: Mutual Match Race Condition
**What goes wrong:** Two matching jobs try to match the same pair of users simultaneously, creating duplicate matches
**Why it happens:** No locking between finding candidate and creating match
**How to avoid:** Use `SELECT FOR UPDATE SKIP LOCKED` on both users' sessions before inserting match. If lock fails, skip and try next candidate
**Warning signs:** Duplicate matches in database, users seeing the same person twice

### Pitfall 2: Stale Matches After Session Expiry
**What goes wrong:** Match delivered just before session expires, user can't respond
**Why it happens:** Not checking session expiry freshness before delivering match
**How to avoid:** Always verify `expires_at > NOW() + INTERVAL '2 minutes'` before creating match. Don't match users with <2 minutes remaining
**Warning signs:** Match cards appearing then immediately disappearing, confused users

### Pitfall 3: Empty Queue Infinite Loop
**What goes wrong:** Matching job keeps running for user with no candidates, wasting resources
**Why it happens:** No early exit when no candidates available
**How to avoid:** If matching query returns 0 results, set a "last_checked_at" flag and skip user for 30 seconds. Emit "no_matches_available" event to frontend
**Warning signs:** High CPU on matching worker, Redis queue backing up

### Pitfall 4: Decline Memory Across User Deletion
**What goes wrong:** Declined user deletes account, decline record references deleted user
**Why it happens:** Missing ON DELETE CASCADE on declined_user_id FK
**How to avoid:** Ensure `declined_user_id REFERENCES users(id) ON DELETE CASCADE` (already in schema)
**Warning signs:** Foreign key constraint errors, orphaned decline records

### Pitfall 5: Socket.IO Room Leakage
**What goes wrong:** User ends session but still receives match events
**Why it happens:** Not leaving After Hours-specific room on session end
**How to avoid:** When session ends, emit event to leave `after_hours:${sessionId}` room, not just disconnect
**Warning signs:** Users receiving matches after ending session, "ghost" match cards

### Pitfall 6: Match Card Timer Drift
**What goes wrong:** Auto-decline timer on frontend doesn't match server state
**Why it happens:** Using client time instead of server-provided timestamp
**How to avoid:** Send `autoDeclineAt` as ISO timestamp from server, calculate remaining time on frontend. Handle clock skew with NTP
**Warning signs:** Cards auto-declining early/late, timing inconsistencies

## Code Examples

Verified patterns from existing codebase:

### Active User Count for Social Proof
```typescript
// Source: Existing profile-service pattern for count queries
// CONTEXT.md: "Show active user count nearby as social proof"

async function getActiveUserCountNearby(
  pool: Pool,
  userLocation: { lat: number; lng: number },
  maxDistanceKm: number
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT s.user_id) as count
     FROM after_hours_sessions s
     WHERE s.ended_at IS NULL
       AND s.expires_at > NOW()
       AND (
         6371 * acos(
           cos(radians($1)) * cos(radians(s.fuzzed_latitude)) *
           cos(radians(s.fuzzed_longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(s.fuzzed_latitude))
         )
       ) <= $3`,
    [userLocation.lat, userLocation.lng, maxDistanceKm]
  );

  return parseInt(result.rows[0].count) || 0;
}
```

### Decline Endpoint with Post-Decline Matching
```typescript
// Source: POST pattern from after-hours.ts
// CONTEXT.md: "Silent decline - other user never knows"

router.post('/decline', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { matchId } = req.body;

  try {
    // Get current session
    const sessionResult = await pool.query(
      `SELECT id FROM after_hours_sessions
       WHERE user_id = $1 AND ended_at IS NULL`,
      [userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active session',
        code: 'NO_ACTIVE_SESSION',
      });
    }

    const sessionId = sessionResult.rows[0].id;

    // Get the match to find declined user
    const matchResult = await pool.query(
      `SELECT user_id_1, user_id_2 FROM after_hours_matches
       WHERE id = $1 AND (user_id_1 = $2 OR user_id_2 = $2)`,
      [matchId, userId]
    );

    if (matchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Match not found',
      });
    }

    const match = matchResult.rows[0];
    const declinedUserId = match.user_id_1 === userId
      ? match.user_id_2
      : match.user_id_1;

    // Record decline (silent - no notification to other user)
    await recordDecline(pool, userId, sessionId, declinedUserId);

    // Soft-delete the match (or mark as declined)
    await pool.query(
      `UPDATE after_hours_matches
       SET declined_by = $1, declined_at = NOW()
       WHERE id = $2`,
      [userId, matchId]
    );

    logger.info('Match declined', { userId, matchId, declinedUserId });

    // Trigger matching to find next candidate (30-second cooldown)
    await triggerMatchingForUser(userId, sessionId);

    res.json({
      success: true,
      message: 'Match declined',
      // Frontend shows "Looking for matches..." state
    });
  } catch (error: any) {
    logger.error('Failed to decline match', { error: error.message, userId });
    res.status(500).json({ success: false, error: 'Failed to decline match' });
  }
});
```

### Current Match Status Endpoint
```typescript
// CONTEXT.md: "One chat at a time - user must decline or save current match before getting another"

router.get('/match/current', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // Get active match for this user
    const result = await pool.query(
      `SELECT m.*, p.name, p.age, ahp.photo_url, ahp.description,
              s.fuzzed_latitude, s.fuzzed_longitude
       FROM after_hours_matches m
       JOIN after_hours_sessions s ON
         (m.user_id_1 = $1 AND s.user_id = m.user_id_2) OR
         (m.user_id_2 = $1 AND s.user_id = m.user_id_1)
       JOIN profiles p ON p.user_id = s.user_id
       JOIN after_hours_profiles ahp ON ahp.user_id = s.user_id
       WHERE (m.user_id_1 = $1 OR m.user_id_2 = $1)
         AND m.declined_by IS NULL
         AND m.expires_at > NOW()
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        hasMatch: false,
        match: null,
        status: 'searching', // Frontend shows "Looking for matches..."
      });
    }

    const match = result.rows[0];
    const photoUrl = match.photo_url
      ? await resolvePhotoUrl(match.photo_url)
      : null;

    res.json({
      success: true,
      hasMatch: true,
      match: {
        id: match.id,
        expiresAt: match.expires_at,
        profile: {
          name: match.name,
          age: match.age,
          photoUrl,
          description: match.description,
        },
      },
    });
  } catch (error: any) {
    logger.error('Failed to get current match', { error: error.message, userId });
    res.status(500).json({ success: false, error: 'Failed to get match status' });
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bull library | BullMQ | 2020+ | BullMQ is the maintained successor |
| QueueScheduler class | Built-in job schedulers | BullMQ 5.16+ | Simpler API for repeatable jobs |
| SELECT FOR UPDATE (wait) | SELECT FOR UPDATE SKIP LOCKED | PostgreSQL 9.5+ | No deadlocks in concurrent job processing |
| Long polling | WebSocket (Socket.IO) | Industry standard | Real-time delivery, less server load |

**Deprecated/outdated:**
- Bull (original): Use BullMQ instead
- Repeatable jobs old API: Use `upsertJobScheduler` instead

## Open Questions

Things that couldn't be fully resolved:

1. **Match expiry vs session expiry timing**
   - What we know: Matches have expires_at, sessions have expires_at
   - What's unclear: Should match always expire before session? What if session extended?
   - Recommendation: Match expires at MIN(session1.expires_at, session2.expires_at, NOW+10min). Update match expiry when session extended.

2. **Decline counter reset mechanism**
   - What we know: Declines should reset after 3 sessions per CONTEXT.md
   - What's unclear: How to count "sessions" - any session, or sessions where both users were active?
   - Recommendation: Simple counter increment per decline. Reset to 0 when counter reaches 3 on next query. "3 sessions" = 3 declines.

3. **Match card auto-decline timer duration**
   - What we know: CONTEXT.md says "Hard timer on match card - auto-decline after X minutes"
   - What's unclear: Exact duration
   - Recommendation: Claude's discretion. Suggest 5 minutes - long enough to review, short enough to keep things moving.

4. **Active user count accuracy**
   - What we know: Show "12 people nearby in After Hours"
   - What's unclear: Should this count all active sessions, or only compatible (matching preferences)?
   - Recommendation: Count all active sessions within user's max distance preference. Simpler, avoids revealing preference info.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/profile-service/src/index.ts` lines 1214-1236 - Haversine formula pattern
- Existing codebase: `backend/profile-service/src/services/session-scheduler.ts` - BullMQ pattern
- Existing codebase: `backend/chat-service/src/socket/index.ts` - Socket.IO room pattern
- Existing codebase: `backend/profile-service/src/services/fcm-service.ts` - FCM notification pattern
- Existing codebase: `backend/migrations/021_add_after_hours_tables.sql` - Database schema
- Existing codebase: `backend/profile-service/src/routes/after-hours.ts` - Transaction pattern

### Secondary (MEDIUM confidence)
- [BullMQ Job Schedulers Documentation](https://docs.bullmq.io/guide/job-schedulers) - Repeatable jobs
- [PostgreSQL SKIP LOCKED](https://www.inferable.ai/blog/posts/postgres-skip-locked) - Concurrent queue processing
- [BullMQ Repeatable Jobs](https://docs.bullmq.io/guide/jobs/repeatable) - Legacy API (deprecated)

### Tertiary (LOW confidence)
- None - all findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use
- Matching query: HIGH - Haversine formula already proven in discovery
- Concurrency: MEDIUM - SKIP LOCKED pattern new to codebase but well-documented
- Real-time delivery: HIGH - Socket.IO pattern matches chat-service
- Decline tracking: MEDIUM - Requires schema modification, logic is straightforward

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable domain, established patterns)
