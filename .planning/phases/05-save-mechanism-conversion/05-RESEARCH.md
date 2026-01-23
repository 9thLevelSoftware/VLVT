# Phase 5: Save Mechanism & Conversion - Research

**Researched:** 2026-01-22
**Domain:** Match conversion, transactional operations, real-time notifications, database migrations
**Confidence:** HIGH

## Summary

Phase 5 implements the "Save" mechanism that allows both users in an After Hours ephemeral chat to vote to convert their connection into a permanent match. This is the critical path from ephemeral to persistent - without mutual save, the chat disappears when the session ends.

The codebase already has all the necessary infrastructure: `after_hours_matches` table with `user1_save_vote` and `user2_save_vote` boolean columns, `converted_to_match_id` reference to permanent matches, Socket.IO real-time delivery, FCM push notifications, and the `matches` / `messages` tables for permanent storage. The main work is implementing the save vote endpoint, mutual detection logic, and the transactional message copy operation.

Key challenges include: (1) handling the race condition where one user saves but the session expires before the other decides, (2) preventing duplicate permanent matches, and (3) ensuring atomic message copy from ephemeral to permanent storage. The existing `generateMatchId()` pattern and transaction-based database operations provide the foundation.

**Primary recommendation:** Create a `POST /api/after-hours/matches/{id}/save` endpoint in chat-service that records save votes, detects mutual saves atomically, and performs the conversion in a single transaction. Emit `after_hours:match_saved` via Socket.IO and send FCM notifications on successful conversion.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^4.21.x | HTTP API framework | Existing REST API patterns |
| pg | ^8.16.x | PostgreSQL client | Transaction support, existing queries |
| socket.io | ^4.8.x | Real-time events | Existing notification delivery |
| firebase-admin | ^12.x | Push notifications | Existing FCM service |
| uuid | ^11.x | ID generation | Existing `generateMatchId()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | ^5.x | Redis pub/sub | Publishing save events from chat-service |
| @vlvt/shared | file:../shared | Auth middleware | After Hours auth chain |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgreSQL transactions | Saga pattern | Overkill for single-database operation |
| REST endpoint | Socket.IO only | REST provides reliability, idempotency |
| Synchronous conversion | Background job | Conversion is fast, no need for async |

**Installation:** No new packages required - all dependencies already in chat-service.

## Architecture Patterns

### Recommended Project Structure
```
backend/chat-service/src/
|-- routes/
|   |-- after-hours-chat.ts     # EXTEND: Add save vote endpoint
|-- services/
|   +-- match-conversion-service.ts  # NEW: Conversion business logic
|-- socket/
|   |-- after-hours-handler.ts  # EXTEND: Handle save events

frontend/lib/
|-- services/
|   |-- after_hours_chat_service.dart  # EXTEND: Add saveMatch method
|   |-- socket_service.dart            # EXTEND: Listen for match_saved
|-- widgets/
|   +-- save_match_button.dart         # NEW: Save button with state
|-- screens/
|   |-- after_hours_chat_screen.dart   # EXTEND: Integrate save UI
```

### Pattern 1: Atomic Save Vote with Mutual Detection
**What:** Single endpoint that records vote and checks for mutual save in one transaction
**When to use:** When user taps "Save" button
**Example:**
```typescript
// Source: Combining existing transaction patterns from chat-service
// and after_hours_matches schema from migration 021

interface SaveVoteResult {
  success: boolean;
  mutualSave: boolean;
  permanentMatchId?: string;
  error?: string;
}

async function recordSaveVote(
  pool: Pool,
  afterHoursMatchId: string,
  userId: string
): Promise<SaveVoteResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current match state with FOR UPDATE lock
    const matchResult = await client.query(
      `SELECT user_id_1, user_id_2, user1_save_vote, user2_save_vote,
              converted_to_match_id, expires_at
       FROM after_hours_matches
       WHERE id = $1
       FOR UPDATE`,
      [afterHoursMatchId]
    );

    if (matchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, mutualSave: false, error: 'Match not found' };
    }

    const match = matchResult.rows[0];

    // Verify user is part of match
    const isUser1 = match.user_id_1 === userId;
    const isUser2 = match.user_id_2 === userId;
    if (!isUser1 && !isUser2) {
      await client.query('ROLLBACK');
      return { success: false, mutualSave: false, error: 'Unauthorized' };
    }

    // Check if already converted
    if (match.converted_to_match_id) {
      await client.query('ROLLBACK');
      return {
        success: true,
        mutualSave: true,
        permanentMatchId: match.converted_to_match_id,
      };
    }

    // Record this user's vote
    const voteColumn = isUser1 ? 'user1_save_vote' : 'user2_save_vote';
    await client.query(
      `UPDATE after_hours_matches
       SET ${voteColumn} = TRUE
       WHERE id = $1`,
      [afterHoursMatchId]
    );

    // Check if now both have voted
    const otherVote = isUser1 ? match.user2_save_vote : match.user1_save_vote;

    if (otherVote) {
      // Mutual save! Convert to permanent match
      const permanentMatchId = await convertToPermanentMatch(
        client,
        afterHoursMatchId,
        match.user_id_1,
        match.user_id_2
      );

      await client.query('COMMIT');
      return { success: true, mutualSave: true, permanentMatchId };
    }

    await client.query('COMMIT');
    return { success: true, mutualSave: false };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Pattern 2: Transactional Match Conversion
**What:** Copy messages and create permanent match atomically
**When to use:** When mutual save is detected
**Example:**
```typescript
// Source: ARCHITECTURE.md pattern + existing generateMatchId pattern

async function convertToPermanentMatch(
  client: PoolClient,
  afterHoursMatchId: string,
  userId1: string,
  userId2: string
): Promise<string> {
  // Generate permanent match ID
  const permanentMatchId = generateMatchId();

  // Create permanent match record
  await client.query(
    `INSERT INTO matches (id, user_id_1, user_id_2, source)
     VALUES ($1, $2, $3, 'after_hours')`,
    [permanentMatchId, userId1, userId2]
  );

  // Copy messages from ephemeral to permanent storage
  // Note: Messages get new IDs to avoid conflicts
  await client.query(
    `INSERT INTO messages (id, match_id, sender_id, text, created_at)
     SELECT
       'msg_' || gen_random_uuid(),
       $1,
       sender_id,
       text,
       created_at
     FROM after_hours_messages
     WHERE match_id = $2
     ORDER BY created_at`,
    [permanentMatchId, afterHoursMatchId]
  );

  // Update after_hours_match with reference to permanent match
  await client.query(
    `UPDATE after_hours_matches
     SET converted_to_match_id = $1
     WHERE id = $2`,
    [permanentMatchId, afterHoursMatchId]
  );

  return permanentMatchId;
}
```

### Pattern 3: Real-Time Save Status via Socket.IO
**What:** Notify both users of save actions and conversion result
**When to use:** After save vote is recorded (partial) and after conversion (complete)
**Example:**
```typescript
// Source: Existing after-hours-handler.ts pattern

// After successful save vote (not yet mutual)
function notifySaveVote(
  io: SocketServer,
  afterHoursMatchId: string,
  savingUserId: string,
  otherUserId: string
): void {
  // Notify the other user that their match partner wants to save
  io.to(`user:${otherUserId}`).emit('after_hours:partner_saved', {
    matchId: afterHoursMatchId,
    savedBy: savingUserId,
    timestamp: new Date().toISOString(),
  });
}

// After mutual save and conversion
function notifyMatchSaved(
  io: SocketServer,
  afterHoursMatchId: string,
  permanentMatchId: string,
  userId1: string,
  userId2: string
): void {
  const payload = {
    afterHoursMatchId,
    permanentMatchId,
    timestamp: new Date().toISOString(),
  };

  // Notify both users
  io.to(`user:${userId1}`).emit('after_hours:match_saved', payload);
  io.to(`user:${userId2}`).emit('after_hours:match_saved', payload);

  // Also emit to match room for multi-device support
  io.to(`after_hours:match:${afterHoursMatchId}`).emit(
    'after_hours:match_saved',
    payload
  );
}
```

### Pattern 4: Save Button State Management (Flutter)
**What:** Button showing save status (not saved, saving, waiting for partner, saved)
**When to use:** In After Hours chat screen
**Example:**
```dart
// Source: Existing button patterns + CONTEXT.md UX decisions

enum SaveButtonState {
  notSaved,
  saving,
  waitingForPartner,
  partnerSavedFirst,  // Show urgency
  mutualSaved,
}

class SaveMatchButton extends StatelessWidget {
  final SaveButtonState state;
  final VoidCallback? onSave;

  const SaveMatchButton({
    super.key,
    required this.state,
    this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    switch (state) {
      case SaveButtonState.notSaved:
        return ElevatedButton.icon(
          onPressed: onSave,
          icon: const Icon(Icons.bookmark_border),
          label: const Text('Save Match'),
          style: ElevatedButton.styleFrom(
            backgroundColor: VlvtColors.gold,
          ),
        );

      case SaveButtonState.saving:
        return ElevatedButton.icon(
          onPressed: null,
          icon: const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          label: const Text('Saving...'),
        );

      case SaveButtonState.waitingForPartner:
        return ElevatedButton.icon(
          onPressed: null,
          icon: const Icon(Icons.bookmark, color: VlvtColors.gold),
          label: const Text('Waiting for partner'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.grey.shade200,
          ),
        );

      case SaveButtonState.partnerSavedFirst:
        // Highlighted state - they saved first, prompt user to reciprocate
        return ElevatedButton.icon(
          onPressed: onSave,
          icon: const Icon(Icons.favorite, color: Colors.white),
          label: const Text('Save to keep chatting!'),
          style: ElevatedButton.styleFrom(
            backgroundColor: VlvtColors.primary,
          ),
        );

      case SaveButtonState.mutualSaved:
        return ElevatedButton.icon(
          onPressed: null,
          icon: const Icon(Icons.check_circle, color: Colors.green),
          label: const Text('Match saved!'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green.shade100,
          ),
        );
    }
  }
}
```

### Pattern 5: FCM Push Notification for Saved Match
**What:** Notify user when their partner saves (prompt them to save too)
**When to use:** Partner saved but user is not in app
**Example:**
```typescript
// Source: Existing fcm-service.ts sendMatchNotification pattern

export async function sendSaveNotification(
  pool: Pool,
  recipientUserId: string,
  partnerName: string,
  afterHoursMatchId: string
): Promise<void> {
  if (!isFirebaseReady()) return;

  const tokens = await getUserTokens(pool, recipientUserId);
  if (tokens.length === 0) return;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: `${partnerName} wants to save your match!`,
      body: 'Tap Save to keep chatting after the session ends',
    },
    data: {
      type: 'after_hours_partner_saved',
      afterHoursMatchId,
      partnerName,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          contentAvailable: true,
        },
      },
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'after_hours',
        priority: 'high',
      },
    },
  };

  await admin.messaging().sendEachForMulticast(message);
}

export async function sendMutualSaveNotification(
  pool: Pool,
  recipientUserId: string,
  partnerName: string,
  permanentMatchId: string
): Promise<void> {
  if (!isFirebaseReady()) return;

  const tokens = await getUserTokens(pool, recipientUserId);
  if (tokens.length === 0) return;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: `Match saved with ${partnerName}!`,
      body: 'Your connection is now permanent. Keep chatting anytime!',
    },
    data: {
      type: 'after_hours_match_saved',
      permanentMatchId,
      partnerName,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'matches',
        priority: 'high',
      },
    },
  };

  await admin.messaging().sendEachForMulticast(message);
}
```

### Anti-Patterns to Avoid
- **Non-atomic vote + conversion:** Always use transactions to prevent partial state
- **Checking match expiry separately:** Include expiry check in same query as vote record
- **Duplicate match creation:** Use `converted_to_match_id IS NULL` check before conversion
- **Polling for partner save status:** Use Socket.IO push, not polling
- **Allowing save after session expiry:** Validate session/match is still active

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Match ID generation | Custom incrementing IDs | `generateMatchId()` | UUID prevents collisions |
| Real-time notifications | HTTP polling | Socket.IO + FCM (existing) | Already configured, handles offline |
| Transaction management | Manual BEGIN/COMMIT | pg pool client pattern | Existing pattern handles errors |
| Push notifications | Custom Firebase init | fcm-service (existing) | Handles token rotation, multicast |
| User authorization | Custom JWT parsing | authMiddleware (existing) | Already validates After Hours access |

**Key insight:** Phase 5 is primarily about combining existing patterns (transactions, Socket.IO events, FCM notifications) into the save flow. The infrastructure exists - this phase wires it together.

## Common Pitfalls

### Pitfall 1: Race Condition on Mutual Save Detection
**What goes wrong:** Two users save simultaneously, two permanent matches created
**Why it happens:** Not using row-level locking on the after_hours_match row
**How to avoid:** Use `SELECT ... FOR UPDATE` to lock the row before checking/updating vote status
**Warning signs:** Duplicate entries in matches table with same user pairs

### Pitfall 2: Partial Save State on Session Expiry
**What goes wrong:** User 1 saves, session expires before User 2 decides, User 1 expects conversation saved
**Why it happens:** No handling for "one voted but session expired" case
**How to avoid:**
1. Grace period after session expiry (already implemented in Phase 4) allows save votes
2. Clear messaging: "Your partner hasn't saved yet. Chat will end when session expires."
3. Consider: Allow conversion even after expiry IF both eventually vote (within retention window)
**Warning signs:** User complaints about lost conversations

### Pitfall 3: Duplicate Permanent Match Check
**What goes wrong:** Match created when users already have an existing permanent match
**Why it happens:** Not checking matches table for existing pair
**How to avoid:** Before INSERT, check `SELECT id FROM matches WHERE (user_id_1, user_id_2) OR (user_id_2, user_id_1)`
**Warning signs:** Users appearing twice in each other's match lists

### Pitfall 4: Message Copy Without Ordering
**What goes wrong:** Messages appear out of order in permanent chat
**Why it happens:** Not using `ORDER BY created_at` in copy query
**How to avoid:** Always include `ORDER BY created_at` in the INSERT...SELECT
**Warning signs:** Conversation appears jumbled in regular chat

### Pitfall 5: Socket Room Not Cleaned Up After Conversion
**What goes wrong:** Users still receiving ephemeral chat events after match is saved
**Why it happens:** Not leaving `after_hours:match:{id}` room after conversion
**How to avoid:** Client should leave After Hours room and join regular match room on conversion
**Warning signs:** Duplicate message notifications, confusion about which chat is active

### Pitfall 6: No Idempotency on Save Endpoint
**What goes wrong:** User taps save multiple times, error or inconsistent state
**Why it happens:** Endpoint doesn't handle already-voted case gracefully
**How to avoid:** Check if user already voted before trying to update. Return success with `alreadyVoted: true` if so.
**Warning signs:** 500 errors on double-tap, confusing error messages

## Code Examples

Verified patterns from existing codebase:

### REST Endpoint Pattern
```typescript
// Source: chat-service/src/routes/after-hours-chat.ts
// Pattern for After Hours REST endpoints

router.post(
  '/after-hours/matches/:matchId/save',
  async (req: Request, res: Response) => {
    try {
      const { matchId } = req.params;
      const userId = req.user!.userId;

      // Validate matchId format (UUID)
      if (!matchId || !UUID_REGEX.test(matchId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid match ID format',
        });
      }

      // Delegate to service
      const result = await recordSaveVote(pool, matchId, userId);

      if (!result.success) {
        const statusCode = result.error === 'Match not found' ? 404
          : result.error === 'Unauthorized' ? 403
          : 400;
        return res.status(statusCode).json({
          success: false,
          error: result.error,
        });
      }

      // Real-time notifications handled by service layer

      res.json({
        success: true,
        mutualSave: result.mutualSave,
        permanentMatchId: result.permanentMatchId,
      });
    } catch (error) {
      logger.error('Failed to record save vote', {
        error: error instanceof Error ? error.message : 'Unknown error',
        matchId: req.params.matchId,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to save match',
      });
    }
  }
);
```

### Socket.IO Event Listener Pattern (Flutter)
```dart
// Source: Existing socket_service.dart pattern
// Adding new event listeners for save events

// In _setupEventHandlers():
_socket!.on('after_hours:partner_saved', (data) {
  debugPrint('Socket: Partner saved match');
  try {
    if (data is! Map<String, dynamic>) return;
    _partnerSavedController.add(data);
  } catch (e) {
    debugPrint('Socket: Error parsing partner saved: $e');
  }
});

_socket!.on('after_hours:match_saved', (data) {
  debugPrint('Socket: Match saved (mutual)');
  try {
    if (data is! Map<String, dynamic>) return;
    _matchSavedController.add(data);
  } catch (e) {
    debugPrint('Socket: Error parsing match saved: $e');
  }
});

// Stream getters:
Stream<Map<String, dynamic>> get onPartnerSaved => _partnerSavedController.stream;
Stream<Map<String, dynamic>> get onMatchSaved => _matchSavedController.stream;
```

### Database Migration Pattern
```sql
-- Source: Pattern from existing migrations (e.g., 021)
-- Migration: Add source column to matches table

ALTER TABLE matches ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'swipe';

COMMENT ON COLUMN matches.source IS 'How the match was created: swipe (regular), after_hours (from AH mode)';

-- Index for filtering by source if needed
CREATE INDEX IF NOT EXISTS idx_matches_source ON matches(source);
```

### Service Method Pattern (Flutter)
```dart
// Source: Existing after_hours_chat_service.dart pattern

/// Save an After Hours match
/// Returns SaveResult with success, mutualSave flag, and optional permanentMatchId
Future<SaveResult> saveMatch({required String matchId}) async {
  try {
    final token = await _authService.getToken();
    if (token == null) {
      debugPrint('AfterHoursChatService: No auth token');
      return SaveResult(success: false, error: 'Not authenticated');
    }

    final uri = Uri.parse(
      '${AppConfig.chatServiceUrl}/api/after-hours/matches/$matchId/save',
    );

    final response = await http.post(
      uri,
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return SaveResult(
        success: data['success'] == true,
        mutualSave: data['mutualSave'] == true,
        permanentMatchId: data['permanentMatchId'] as String?,
      );
    }

    if (response.statusCode == 404) {
      return SaveResult(success: false, error: 'Match not found');
    }
    if (response.statusCode == 403) {
      return SaveResult(success: false, error: 'Unauthorized');
    }

    return SaveResult(success: false, error: 'Failed to save match');
  } catch (e) {
    debugPrint('AfterHoursChatService: Error saving match: $e');
    return SaveResult(success: false, error: e.toString());
  }
}

class SaveResult {
  final bool success;
  final bool mutualSave;
  final String? permanentMatchId;
  final String? error;

  SaveResult({
    required this.success,
    this.mutualSave = false,
    this.permanentMatchId,
    this.error,
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling for partner save | Socket.IO push events | Current standard | Instant feedback |
| Non-atomic conversion | Transaction with row lock | Database best practice | Prevents duplicates |
| Silent save | Notification when partner saves | UX best practice | Increases mutual save rate |
| Only in-app notification | FCM push for out-of-app | Mobile standard | Catches users not in app |

**Deprecated/outdated:**
- None identified for this domain

## Open Questions

Things that couldn't be fully resolved:

1. **Save after session expiry grace period**
   - What we know: 30-60 second grace period allows wrap-up
   - What's unclear: Can user 2 save during grace period if user 1 already saved?
   - Recommendation: Yes, allow saves during grace period. Check `expires_at + grace_period` instead of just `expires_at`. Better UX to allow save than lose connection.

2. **Re-save if match already exists**
   - What we know: Need to check for existing permanent match before conversion
   - What's unclear: What to return if users already have a permanent match?
   - Recommendation: Return `{ success: true, mutualSave: true, alreadyExists: true, permanentMatchId }`. Idempotent success, no error.

3. **Notification timing when both save simultaneously**
   - What we know: Both could save at nearly the same time
   - What's unclear: Do both get "partner saved first" notification before "mutual save"?
   - Recommendation: Check if already mutual before sending "partner saved". If mutual, only send "match saved". Row lock ensures serialization.

4. **UI transition after mutual save**
   - What we know: Need to transition from After Hours chat to regular chat
   - What's unclear: Immediate transition vs celebration screen?
   - Recommendation: Brief celebration (1-2 seconds), then seamless transition to regular chat with message history intact.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/migrations/021_add_after_hours_tables.sql` - save vote columns, converted_to_match_id
- Existing codebase: `backend/chat-service/src/routes/after-hours-chat.ts` - REST endpoint patterns
- Existing codebase: `backend/chat-service/src/socket/after-hours-handler.ts` - Socket.IO event patterns
- Existing codebase: `backend/chat-service/src/services/fcm-service.ts` - Push notification patterns
- Existing codebase: `backend/chat-service/src/utils/id-generator.ts` - Match ID generation
- Existing codebase: `frontend/lib/services/socket_service.dart` - Flutter Socket.IO patterns
- Existing codebase: `frontend/lib/services/after_hours_chat_service.dart` - After Hours service patterns
- Planning docs: `.planning/research/ARCHITECTURE.md` - Message conversion SQL pattern

### Secondary (MEDIUM confidence)
- Phase 4 research: Save endpoint mentioned but not detailed
- ROADMAP.md: Technical notes for Phase 5

### Tertiary (LOW confidence)
- None - all patterns verified with codebase

## Metadata

**Confidence breakdown:**
- REST endpoint pattern: HIGH - Exact pattern from existing after-hours-chat.ts
- Transaction pattern: HIGH - Standard pg pool client pattern used throughout
- Socket.IO events: HIGH - Exact pattern from after-hours-handler.ts
- FCM notifications: HIGH - Exact pattern from fcm-service.ts
- Flutter service: HIGH - Exact pattern from existing services
- Migration: HIGH - Standard ALTER TABLE pattern from existing migrations
- UI patterns: MEDIUM - Based on existing button patterns, needs UX confirmation

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable domain, well-defined requirements)
