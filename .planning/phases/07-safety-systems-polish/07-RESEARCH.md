# Phase 7: Safety Systems & Polish - Research

**Researched:** 2026-01-23
**Domain:** Safety features, moderation systems, device fingerprinting, perceptual hashing, analytics
**Confidence:** HIGH

## Summary

Phase 7 addresses production-ready safety features for After Hours mode. The codebase already has robust block/report systems in the main app that can be reused. The key challenges are:

1. **Block synchronization** - The existing `blocks` table is already queried in the matching engine (`matching-engine.ts`). Need to ensure After Hours matching also excludes blocked users.
2. **After Hours blocking** - Need new endpoint to create permanent blocks from After Hours context.
3. **Device fingerprinting** - Need Flutter plugin (`device_info_plus` or `device_identifier_plugin`) to collect IDFV (iOS) / Android ID, store at session start.
4. **Photo hashing** - Sharp-based perceptual hashing libraries exist (`sharp-phash`) that integrate with existing image pipeline.
5. **Quick report flow** - Extend existing report system with After Hours-specific reason enum and auto-exit behavior.
6. **Cleanup jobs** - Extend existing BullMQ pattern from `message-cleanup-job.ts`.

**Primary recommendation:** Leverage existing safety infrastructure. Block sync already partially works. Focus on After Hours-specific endpoints and device fingerprinting.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sharp | existing | Image processing (already used) | Foundation for perceptual hashing |
| sharp-phash | ^2.0.0 | Perceptual image hashing | Integrates with existing Sharp pipeline |
| BullMQ | existing | Background job scheduling | Already used for session/message cleanup |
| device_info_plus | ^10.x | Device info (Flutter) | Already a dependency for feedback |
| device_identifier | ^1.x | Additional device IDs (Flutter) | IDFV/Android ID |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| blockhash-js | ^0.2.0 | Alternative perceptual hash | If sharp-phash insufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sharp-phash | blockhash-js | blockhash-js is pure JS (no native deps) but less integrated with Sharp |
| device_identifier | custom native code | Plugin handles platform differences |

**Installation:**
```bash
# Backend (profile-service)
npm install sharp-phash

# Frontend (already has device_info_plus)
flutter pub add device_identifier
```

## Architecture Patterns

### Recommended Project Structure
```
backend/
  chat-service/
    src/
      routes/
        after-hours-safety.ts     # NEW: After Hours block/report endpoints
      jobs/
        session-cleanup-job.ts    # EXTEND: Add expired session cleanup
  profile-service/
    src/
      services/
        photo-hash-service.ts     # NEW: Perceptual hashing
      utils/
        device-fingerprint.ts     # NEW: Device ID storage

frontend/
  lib/
    services/
      after_hours_safety_service.dart  # NEW: Quick block/report from AH
      device_fingerprint_service.dart  # NEW: Collect device IDs
    widgets/
      quick_report_dialog.dart    # NEW: One-tap report + exit
```

### Pattern 1: Block Synchronization in Matching Query
**What:** The matching engine already excludes blocked users
**When to use:** Any query that returns potential matches
**Example:**
```sql
-- Already in matching-engine.ts findMatchCandidate()
AND a.user_id NOT IN (
  SELECT blocked_user_id FROM blocks WHERE user_id = $1
  UNION
  SELECT user_id FROM blocks WHERE blocked_user_id = $1
)
```
This pattern is already implemented. Verify it covers all matching queries.

### Pattern 2: Perceptual Hash Comparison
**What:** Generate 64-bit hash from image, compare with Hamming distance
**When to use:** Photo upload to After Hours, check against banned hashes
**Example:**
```typescript
// Source: sharp-phash documentation
import sharp from 'sharp';
import phash from 'sharp-phash';

async function getPhotoHash(imageBuffer: Buffer): Promise<string> {
  const image = sharp(imageBuffer);
  const hash = await phash(image);
  return hash; // 64-bit hex string like "8f373714acfcf4d0"
}

function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0;
  const h1 = BigInt('0x' + hash1);
  const h2 = BigInt('0x' + hash2);
  let xor = h1 ^ h2;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

// Similar images: distance < 10 (threshold tunable)
```

### Pattern 3: Device Fingerprint Collection (Flutter)
**What:** Collect stable device identifiers for ban enforcement
**When to use:** Session start, registration
**Example:**
```dart
// Source: device_info_plus + device_identifier packages
import 'package:device_info_plus/device_info_plus.dart';
import 'package:device_identifier/device_identifier.dart';

class DeviceFingerprintService {
  static Future<Map<String, String?>> collectFingerprint() async {
    final deviceInfo = DeviceInfoPlugin();
    Map<String, String?> fingerprint = {};

    if (Platform.isIOS) {
      final iosInfo = await deviceInfo.iosInfo;
      fingerprint['idfv'] = iosInfo.identifierForVendor;
      fingerprint['model'] = iosInfo.model;
    } else if (Platform.isAndroid) {
      final androidInfo = await deviceInfo.androidInfo;
      fingerprint['androidId'] = androidInfo.id;
      fingerprint['model'] = androidInfo.model;
      // Note: GAID requires user consent and may be null
    }

    return fingerprint;
  }
}
```

### Pattern 4: Quick Report with Auto-Exit (Fire-and-Forget)
**What:** One-tap report that doesn't block UI, auto-navigates away
**When to use:** Safety-critical scenarios where speed matters
**Example:**
```typescript
// Backend: POST /api/after-hours/matches/{id}/report
router.post('/matches/:matchId/report', async (req, res) => {
  const { matchId } = req.params;
  const { reason } = req.body; // enum: inappropriate, harassment, spam, underage, other
  const userId = req.user!.userId;

  // Fire-and-forget pattern (don't block response)
  processReport(userId, matchId, reason).catch(err => {
    logger.error('Report processing failed', { matchId, error: err.message });
  });

  // Immediately decline match and return
  await pool.query(
    `UPDATE after_hours_matches SET declined_by = $1, declined_at = NOW() WHERE id = $2`,
    [userId, matchId]
  );

  res.json({ success: true, message: 'Report submitted' });
});
```

### Anti-Patterns to Avoid
- **Awaiting report processing before response:** User needs immediate exit, don't block
- **Using IDFA/GAID without consent:** iOS requires ATT, Android can be opted-out
- **Storing exact location in device fingerprint:** Privacy violation
- **Blocking on photo hash check:** Do async, don't block upload

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Perceptual hashing | Custom DCT implementation | sharp-phash | Algorithm is complex, edge cases in image preprocessing |
| Device fingerprinting | Native iOS/Android code | device_info_plus + device_identifier | Handles OS version differences, permissions |
| Background job scheduling | setTimeout/setInterval | BullMQ (existing) | Persistence across restarts, retry logic |
| Report reason validation | Manual if/else | Express validator enum | Consistent with existing validation middleware |
| Block query optimization | Custom caching | PostgreSQL indexes (existing) | blocks table already has indexes |

**Key insight:** The existing codebase already solves most infrastructure problems. Focus on wiring, not rebuilding.

## Common Pitfalls

### Pitfall 1: Block Sync Not Applied to All Queries
**What goes wrong:** User A blocks User B in main app, but still sees B in After Hours
**Why it happens:** Block exclusion added to some queries but not all
**How to avoid:** Audit all queries that return user profiles or matches for block exclusion
**Warning signs:** QA reports "blocked user appeared in After Hours"

### Pitfall 2: Photo Hash False Positives
**What goes wrong:** Legitimate photos rejected as "banned"
**Why it happens:** Hamming distance threshold too strict, or similar-but-different photos
**How to avoid:** Use threshold of 10+ bits difference, log near-matches for review
**Warning signs:** Support tickets about rejected photos

### Pitfall 3: Device ID Null on Opt-Out
**What goes wrong:** Device fingerprint collection fails, ban enforcement incomplete
**Why it happens:** iOS ATT declined, Android opted out of ad personalization
**How to avoid:** Fall back to device model + stable properties, don't rely solely on IDFA/GAID
**Warning signs:** Null device_id in sessions table

### Pitfall 4: Session Expiry During Active Chat
**What goes wrong:** User mid-conversation when session expires, poor UX
**Why it happens:** No warning before expiry
**How to avoid:** Already implemented - warning 2 minutes before expiry via `scheduleSessionExpiryWarning`
**Warning signs:** User complaints about sudden disconnection

### Pitfall 5: Report Anonymity Leak
**What goes wrong:** Reported user learns who reported them
**Why it happens:** Reporter ID exposed in error message or API response
**How to avoid:** Reports are anonymous by design, never return reporter_id to reported user
**Warning signs:** Security audit finding

## Code Examples

Verified patterns from codebase analysis:

### Existing Block Creation (chat-service/src/index.ts)
```typescript
// Source: C:/Users/dasbl/AndroidStudioProjects/VLVT/backend/chat-service/src/index.ts
// Lines 796-848 - POST /blocks endpoint
app.post('/blocks', authMiddleware, generalLimiter, validateBlock, async (req, res) => {
  const { userId, blockedUserId, reason } = req.body;

  // Already validates: can't block yourself, checks auth
  // Inserts into blocks table
  // Deletes existing matches between the users

  await pool.query(
    `INSERT INTO blocks (id, user_id, blocked_user_id, reason) VALUES ($1, $2, $3, $4)`,
    [blockId, userId, blockedUserId, reason || null]
  );

  // Also deletes matches
  await pool.query(
    `DELETE FROM matches WHERE (user_id_1 = $1 AND user_id_2 = $2) OR (user_id_1 = $2 AND user_id_2 = $1)`,
    [userId, blockedUserId]
  );
});
```

### Existing Report Creation (chat-service/src/index.ts)
```typescript
// Source: C:/Users/dasbl/AndroidStudioProjects/VLVT/backend/chat-service/src/index.ts
// Lines 918-958 - POST /reports endpoint
app.post('/reports', authMiddleware, reportLimiter, validateReport, async (req, res) => {
  const { reporterId, reportedUserId, reason, details } = req.body;

  await pool.query(
    `INSERT INTO reports (id, reporter_id, reported_user_id, reason, details, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [reportId, reporterId, reportedUserId, reason, details || null, 'pending']
  );
});
```

### Existing Block Exclusion in Matching (matching-engine.ts)
```typescript
// Source: C:/Users/dasbl/AndroidStudioProjects/VLVT/backend/profile-service/src/services/matching-engine.ts
// Lines 168-172 - Block exclusion in findMatchCandidate
// Exclude blocked users (bidirectional)
AND a.user_id NOT IN (
  SELECT blocked_user_id FROM blocks WHERE user_id = $1
  UNION
  SELECT user_id FROM blocks WHERE blocked_user_id = $1
)
```

### Existing Analytics Pattern (Flutter)
```dart
// Source: C:/Users/dasbl/AndroidStudioProjects/VLVT/frontend/lib/services/analytics_service.dart
// Lines 260-287 - Safety events

static Future<void> logUserReported(String reportedUserId, String reason) async {
  await _analytics.logEvent(
    name: 'user_reported',
    parameters: {
      'reported_user_id': reportedUserId,
      'reason': reason,
    },
  );
}

static Future<void> logUserBlocked(String blockedUserId) async {
  await _analytics.logEvent(
    name: 'user_blocked',
    parameters: {'blocked_user_id': blockedUserId},
  );
}
```

### Existing Cleanup Job Pattern (message-cleanup-job.ts)
```typescript
// Source: C:/Users/dasbl/AndroidStudioProjects/VLVT/backend/chat-service/src/jobs/message-cleanup-job.ts
// BullMQ job scheduling pattern

cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, { connection: redisConnection });

await cleanupQueue.upsertJobScheduler(
  'daily-cleanup',
  { pattern: '0 3 * * *' }, // Cron: 3 AM daily
  { name: 'cleanup-expired-messages', data: {} }
);

cleanupWorker = new Worker(
  CLEANUP_QUEUE_NAME,
  async (job: Job) => {
    if (job.name === 'cleanup-expired-messages') {
      await cleanupExpiredMessages(pool);
    }
  },
  { connection: redisConnection }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UDID/IMEI collection | IDFV/Android ID | iOS 14+ (2020) | App Store rejection if using UDID |
| MD5 image hashing | Perceptual hashing | ~2015 | MD5 fails on resize/recompression |
| Synchronous report processing | Fire-and-forget | Best practice | Better UX, user doesn't wait |
| Session-scoped blocks only | Permanent blocks | This phase | Cross-mode safety |

**Deprecated/outdated:**
- `device_id` (Flutter package): Use `device_info_plus` instead
- IMEI/UDID collection: Privacy-violating, app store rejection
- Simple MD5/SHA hash for images: Useless after any image transformation

## Open Questions

Things that couldn't be fully resolved:

1. **Ban enforcement granularity**
   - What we know: Device fingerprint + photo hash can identify evaders
   - What's unclear: At what threshold do we auto-ban vs. flag for review?
   - Recommendation: Start with flagging, tune threshold based on false positive rate

2. **Photo hash database size**
   - What we know: Each hash is 64 bits (8 bytes)
   - What's unclear: How many banned photos expected? Need index strategy?
   - Recommendation: Start with simple table, add B-tree index on hash column

3. **Cross-device ban enforcement**
   - What we know: Device ID identifies one device
   - What's unclear: User creates new account on different device
   - Recommendation: Photo hash comparison catches same-photo reuse across devices

## Edge Cases Requiring Handling

### Session Expiry During Chat
- **Current handling:** Warning 2 minutes before expiry (session-scheduler.ts)
- **Gap:** No client-side countdown timer visible
- **Recommendation:** Add countdown in chat UI header

### Double-Blocking
- **Scenario:** User A blocks B, then B also blocks A
- **Current handling:** Both blocks stored independently (correct)
- **Gap:** None identified
- **Recommendation:** Keep as-is, both blocks valid

### Report Then Block
- **Scenario:** User reports then immediately blocks
- **Current handling:** Both actions independent
- **Gap:** Should we auto-block on report from After Hours?
- **Recommendation:** Yes, After Hours reports should auto-block (one-tap safety)

### Match Saved During Block
- **Scenario:** User A saves match, then B blocks A before mutual save
- **Current handling:** Unclear
- **Gap:** Need to check converted_to_match_id behavior
- **Recommendation:** Block should prevent conversion, check in save endpoint

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `chat-service/src/index.ts` (blocks/reports endpoints)
- Codebase analysis: `profile-service/src/services/matching-engine.ts` (block exclusion)
- Codebase analysis: `frontend/lib/services/analytics_service.dart` (event patterns)
- Codebase analysis: `chat-service/src/jobs/message-cleanup-job.ts` (BullMQ pattern)

### Secondary (MEDIUM confidence)
- [sharp-phash documentation](https://www.brand.dev/blog/perceptual-hashing-in-node-js-with-sharp-phash-for-developers)
- [device_info_plus Flutter package](https://pub.dev/packages/device_info_plus)
- [device_identifier Flutter package](https://pub.dev/packages/device_identifier)
- [Flutter device ID guide](https://medium.com/@AlexCodeX/get-device-id-in-flutter-2025-edition-a-360-degree-guide-to-unique-identifiers-privacy-and-0f24d6b13377)

### Tertiary (LOW confidence)
- npm search for perceptual hash libraries (needs version verification)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on existing codebase patterns and verified packages
- Architecture: HIGH - Follows established patterns in codebase
- Pitfalls: MEDIUM - Based on general knowledge, needs validation in production

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable domain, low churn)
