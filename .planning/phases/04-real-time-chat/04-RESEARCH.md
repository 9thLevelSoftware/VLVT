# Phase 4: Real-Time Chat - Research

**Researched:** 2026-01-22
**Domain:** Real-time messaging, ephemeral chat, Socket.IO room management, Redis pub/sub integration
**Confidence:** HIGH

## Summary

Phase 4 implements real-time chat for After Hours matches. The key difference from regular chat is ephemeral messaging (messages disappear when session ends unless saved) and session-scoped rooms. This research examines the existing chat-service Socket.IO patterns and determines how to extend them for After Hours mode.

The codebase already has comprehensive real-time infrastructure: Socket.IO with JWT auth, room-based messaging (`user:{userId}`), rate limiting, typing indicators, read receipts, and FCM push notifications. Phase 3 added Redis pub/sub event publishing from profile-service (`after_hours:events` channel). Phase 4 connects these systems: chat-service subscribes to Redis pub/sub and delivers match events via Socket.IO, plus adds ephemeral message handlers specific to After Hours matches.

**Primary recommendation:** Extend existing Socket.IO infrastructure with After Hours-specific event handlers. Subscribe to Redis pub/sub channel in chat-service to relay match events. Use match-scoped rooms (`after_hours:match:{matchId}`) for targeted message delivery. Store messages in `after_hours_messages` table with server-side 30-day retention regardless of UI "deletion".

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| socket.io | ^4.8.x | Real-time WebSocket server | Existing chat infrastructure, room support |
| socket_io_client | ^3.1.3 | Flutter WebSocket client | Existing frontend integration |
| ioredis | ^5.x | Redis client | Pub/sub subscription, BullMQ compatibility |
| pg | ^8.16.x | PostgreSQL client | Existing database patterns |
| firebase-admin | ^12.x | Push notifications | Existing FCM service |
| @vlvt/shared | file:../shared | Rate limiting | Existing socket-rate-limiter |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bullmq | ^5.x | Job scheduling | Message cleanup jobs (30-day retention) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Redis pub/sub | Direct Socket.IO cross-service | Redis decouples services, allows profile-service to stay Socket-free |
| Match-scoped rooms | User rooms only | Match rooms provide cleaner chat isolation, easier typing broadcast |
| PostgreSQL for ephemeral messages | Redis for messages | PostgreSQL provides 30-day retention easily, matches existing patterns |

**Installation:** No new packages required - all dependencies already in chat-service.

## Architecture Patterns

### Recommended Project Structure
```
backend/chat-service/src/
|-- socket/
|   |-- index.ts                    # Extend with Redis subscriber
|   |-- auth-middleware.ts          # Existing (no changes)
|   |-- message-handler.ts          # Existing regular chat
|   +-- after-hours-handler.ts      # NEW: After Hours event handlers
|-- services/
|   |-- fcm-service.ts              # Extend with After Hours notifications
|   +-- after-hours-chat-service.ts # NEW: Business logic for ephemeral messages
+-- jobs/
    +-- message-cleanup-job.ts      # NEW: 30-day message retention cleanup

frontend/lib/
|-- services/
|   |-- socket_service.dart         # Extend with After Hours events
|   +-- after_hours_chat_service.dart # NEW: After Hours chat API
|-- screens/
|   +-- after_hours_chat_screen.dart # NEW: Ephemeral chat UI
+-- widgets/
    |-- session_expiry_banner.dart  # NEW: 2-minute warning banner
    +-- match_card_overlay.dart     # NEW: Full-screen match arrival
```

### Pattern 1: Redis Pub/Sub Subscriber in chat-service
**What:** chat-service subscribes to `after_hours:events` channel to receive match events from profile-service
**When to use:** On chat-service startup, before Socket.IO initialization
**Example:**
```typescript
// Source: Existing matching-scheduler.ts pub/sub pattern (publisher side)
// Adapted for subscriber in chat-service

import IORedis from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import logger from '../utils/logger';

const REDIS_EVENTS_CHANNEL = 'after_hours:events';

let redisSubscriber: IORedis | null = null;

export async function initializeRedisSubscriber(io: SocketServer): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisSubscriber = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Redis timeout')), 10000);

    redisSubscriber!.once('ready', () => {
      clearTimeout(timeout);
      logger.info('Redis subscriber connected for After Hours events');
      resolve();
    });

    redisSubscriber!.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Subscribe to After Hours events channel
  await redisSubscriber.subscribe(REDIS_EVENTS_CHANNEL);

  // Handle incoming events
  redisSubscriber.on('message', (channel, message) => {
    if (channel !== REDIS_EVENTS_CHANNEL) return;

    try {
      const event = JSON.parse(message);
      handleAfterHoursEvent(io, event);
    } catch (error) {
      logger.error('Failed to parse After Hours event', { error, message });
    }
  });

  logger.info('Subscribed to After Hours events channel');
}

function handleAfterHoursEvent(
  io: SocketServer,
  event: { type: string; targetUserId: string; payload: any }
): void {
  const { type, targetUserId, payload } = event;

  // Emit to user's room (existing pattern)
  io.to(`user:${targetUserId}`).emit(type, payload);

  logger.debug('After Hours event delivered', {
    type,
    targetUserId,
    matchId: payload.matchId,
  });
}
```

### Pattern 2: After Hours Message Handler with Ephemeral Storage
**What:** Socket.IO event handlers for sending/receiving ephemeral messages
**When to use:** After user accepts match and enters chat
**Example:**
```typescript
// Source: Existing message-handler.ts pattern
// Adapted for After Hours ephemeral messages

interface AfterHoursSendMessageData {
  matchId: string;  // UUID from after_hours_matches
  text: string;
  tempId?: string;
}

const handleAfterHoursSendMessage = async (
  data: AfterHoursSendMessageData,
  callback?: Function
) => {
  try {
    const { matchId, text, tempId } = data;

    // Validate input
    if (!matchId || !text || text.trim().length === 0) {
      return callback?.({ success: false, error: 'Invalid message data' });
    }

    if (text.length > 2000) {
      return callback?.({
        success: false,
        error: 'Message too long (max 2000 characters)',
      });
    }

    // Verify user is part of the After Hours match (not regular match)
    const matchCheck = await pool.query(
      `SELECT user_id_1, user_id_2, expires_at, declined_by
       FROM after_hours_matches
       WHERE id = $1`,
      [matchId]
    );

    if (matchCheck.rows.length === 0) {
      return callback?.({ success: false, error: 'Match not found' });
    }

    const match = matchCheck.rows[0];

    // Authorization check
    if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
      return callback?.({ success: false, error: 'Unauthorized' });
    }

    // Check match is still active
    if (match.declined_by || new Date(match.expires_at) < new Date()) {
      return callback?.({
        success: false,
        error: 'Match has expired',
        code: 'MATCH_EXPIRED',
      });
    }

    // Insert into after_hours_messages (ephemeral storage)
    const messageResult = await pool.query(
      `INSERT INTO after_hours_messages (match_id, sender_id, text)
       VALUES ($1, $2, $3)
       RETURNING id, match_id, sender_id, text, created_at`,
      [matchId, userId, text.trim()]
    );

    const message = messageResult.rows[0];
    const recipientId = match.user_id_1 === userId
      ? match.user_id_2
      : match.user_id_1;

    const messageResponse = {
      id: message.id,
      matchId: message.match_id,
      senderId: message.sender_id,
      text: message.text,
      timestamp: message.created_at,
      tempId,
    };

    // Acknowledge to sender
    callback?.({ success: true, message: messageResponse });

    // Emit to recipient via user room
    io.to(`user:${recipientId}`).emit('after_hours:new_message', messageResponse);

    // Also emit to match room for other devices of same user
    io.to(`after_hours:match:${matchId}`).emit('after_hours:new_message', messageResponse);

    logger.info('After Hours message sent', {
      messageId: message.id,
      matchId,
      senderId: userId,
      recipientId,
    });
  } catch (error) {
    logger.error('Error sending After Hours message', { error, matchId: data.matchId });
    callback?.({ success: false, error: 'Failed to send message' });
  }
};
```

### Pattern 3: Debounced Typing Indicator (Frontend)
**What:** Client-side debouncing to prevent typing indicator spam
**When to use:** User is typing in After Hours chat
**Example:**
```dart
// Source: Existing chat_screen.dart typing pattern
// Enhanced with debounce from CONTEXT.md decision

import 'dart:async';

class _AfterHoursChatScreenState extends State<AfterHoursChatScreen> {
  Timer? _typingDebounceTimer;
  Timer? _typingStopTimer;
  bool _isTyping = false;

  static const _typingDebounceMs = 300;   // Debounce before showing "typing"
  static const _typingStopMs = 2000;      // Stop indicator after 2s of no input

  void _onTextChanged(String text) {
    final socketService = context.read<SocketService>();

    // Cancel existing debounce timer
    _typingDebounceTimer?.cancel();

    if (text.trim().isEmpty) {
      // Empty text - stop typing immediately
      if (_isTyping) {
        _isTyping = false;
        socketService.sendAfterHoursTypingIndicator(
          matchId: widget.matchId,
          isTyping: false,
        );
      }
      return;
    }

    // Debounce: wait 300ms before emitting "typing" to reduce jitter
    _typingDebounceTimer = Timer(
      const Duration(milliseconds: _typingDebounceMs),
      () {
        if (!_isTyping) {
          _isTyping = true;
          socketService.sendAfterHoursTypingIndicator(
            matchId: widget.matchId,
            isTyping: true,
          );
        }
      },
    );

    // Reset the stop timer on each keystroke
    _typingStopTimer?.cancel();
    _typingStopTimer = Timer(
      const Duration(milliseconds: _typingStopMs),
      () {
        if (_isTyping) {
          _isTyping = false;
          socketService.sendAfterHoursTypingIndicator(
            matchId: widget.matchId,
            isTyping: false,
          );
        }
      },
    );
  }
}
```

### Pattern 4: Session Expiry Warning Banner
**What:** In-chat banner showing 2-minute warning before session ends
**When to use:** When session `expires_at - now < 2 minutes`
**Example:**
```dart
// Source: CONTEXT.md decision - "2-minute warning as in-chat banner"

class SessionExpiryBanner extends StatelessWidget {
  final DateTime expiresAt;
  final VoidCallback? onSaveMatch;

  const SessionExpiryBanner({
    super.key,
    required this.expiresAt,
    this.onSaveMatch,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<int>(
      stream: Stream.periodic(
        const Duration(seconds: 1),
        (_) => expiresAt.difference(DateTime.now()).inSeconds,
      ),
      builder: (context, snapshot) {
        final secondsLeft = snapshot.data ?? 0;

        // Only show if under 2 minutes
        if (secondsLeft > 120 || secondsLeft <= 0) {
          return const SizedBox.shrink();
        }

        final minutes = secondsLeft ~/ 60;
        final seconds = secondsLeft % 60;
        final timeString = '${minutes}:${seconds.toString().padLeft(2, '0')}';

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          color: secondsLeft <= 30
              ? VlvtColors.error.withOpacity(0.9)
              : VlvtColors.warning.withOpacity(0.9),
          child: Row(
            children: [
              const Icon(Icons.timer, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Session ends in $timeString',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (onSaveMatch != null)
                TextButton(
                  onPressed: onSaveMatch,
                  child: const Text(
                    'Save Match',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
```

### Pattern 5: Message Auto-Retry with Silent Failure
**What:** Automatically retry failed messages up to 3 times before showing error
**When to use:** Socket send fails (network issues, temporary disconnection)
**Example:**
```dart
// Source: CONTEXT.md decision - "Auto-retry silently, error after multiple failures"

class AfterHoursChatService {
  static const _maxRetries = 3;
  static const _retryDelayMs = [1000, 2000, 4000]; // Exponential backoff

  Future<Message?> sendMessageWithRetry({
    required String matchId,
    required String text,
    required String tempId,
  }) async {
    final socketService = _socketService;
    int attempts = 0;

    while (attempts < _maxRetries) {
      try {
        if (!socketService.isConnected) {
          // Wait for connection (up to 5 seconds)
          await _waitForConnection(timeout: const Duration(seconds: 5));
        }

        final message = await socketService.sendAfterHoursMessage(
          matchId: matchId,
          text: text,
          tempId: tempId,
        );

        if (message != null) {
          return message; // Success
        }

        // Null response = soft failure, retry
        attempts++;
        if (attempts < _maxRetries) {
          await Future.delayed(Duration(milliseconds: _retryDelayMs[attempts - 1]));
        }
      } catch (e) {
        attempts++;
        if (attempts < _maxRetries) {
          await Future.delayed(Duration(milliseconds: _retryDelayMs[attempts - 1]));
        }
      }
    }

    // All retries failed - return null to signal error
    return null;
  }

  Future<void> _waitForConnection({required Duration timeout}) async {
    final deadline = DateTime.now().add(timeout);

    while (DateTime.now().isBefore(deadline)) {
      if (_socketService.isConnected) return;
      await Future.delayed(const Duration(milliseconds: 100));
    }

    throw Exception('Connection timeout');
  }
}
```

### Pattern 6: 30-Day Server-Side Retention (Message Cleanup Job)
**What:** BullMQ job that cleans up messages 30 days after match expires (if not saved)
**When to use:** Safety feature - retain messages server-side for potential reports
**Example:**
```typescript
// Source: CONTEXT.md requirement - "Server-side message retention for safety (30 days)"

import { Queue, Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import logger from '../utils/logger';

const CLEANUP_QUEUE_NAME = 'after-hours-message-cleanup';
const RETENTION_DAYS = 30;

export async function initializeMessageCleanupJob(pool: Pool): Promise<void> {
  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, { connection });

  // Schedule daily cleanup at 3 AM UTC
  await cleanupQueue.upsertJobScheduler(
    'daily-cleanup',
    { pattern: '0 3 * * *' }, // Cron: 3 AM daily
    { name: 'cleanup-expired-messages', data: {} }
  );

  const cleanupWorker = new Worker(
    CLEANUP_QUEUE_NAME,
    async (job: Job) => {
      if (job.name === 'cleanup-expired-messages') {
        await cleanupExpiredMessages(pool);
      }
    },
    { connection }
  );

  cleanupWorker.on('failed', (job, err) => {
    logger.error('Message cleanup job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('Message cleanup job scheduled', { schedule: '3 AM UTC daily' });
}

async function cleanupExpiredMessages(pool: Pool): Promise<void> {
  try {
    // Delete messages where:
    // 1. Match expired more than 30 days ago
    // 2. Match was NOT saved (converted_to_match_id IS NULL)
    const result = await pool.query(
      `DELETE FROM after_hours_messages
       WHERE match_id IN (
         SELECT id FROM after_hours_matches
         WHERE expires_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
           AND converted_to_match_id IS NULL
       )
       RETURNING id`,
    );

    const deletedCount = result.rows.length;

    if (deletedCount > 0) {
      logger.info('Cleaned up expired After Hours messages', {
        deletedCount,
        retentionDays: RETENTION_DAYS,
      });
    }

    // Also clean up the expired matches themselves
    await pool.query(
      `DELETE FROM after_hours_matches
       WHERE expires_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         AND converted_to_match_id IS NULL`,
    );
  } catch (error: any) {
    logger.error('Failed to cleanup expired messages', { error: error.message });
    throw error;
  }
}
```

### Anti-Patterns to Avoid
- **Blocking on Redis in request path:** Initialize subscriber async on startup, not per-request
- **Storing presigned URLs in messages:** Store R2 keys only, resolve on retrieval
- **Polling for messages:** Use Socket.IO real-time delivery
- **Client-side message deletion:** Server retains for 30 days regardless of UI state
- **Single room for all users:** Use match-scoped rooms for isolation
- **Tight coupling profile-service to Socket.IO:** Keep pub/sub decoupled via Redis

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Real-time message delivery | HTTP polling | Socket.IO (existing) | Already configured, handles reconnection |
| Rate limiting chat | Custom counters | socket-rate-limiter (existing) | Per-socket tracking, configurable limits |
| JWT auth for sockets | Custom middleware | socketAuthMiddleware (existing) | Already handles expiry, algorithm pinning |
| Cross-service events | Direct HTTP calls | Redis pub/sub (already used by matching-scheduler) | Decoupled, reliable, async |
| Push notifications | Custom FCM logic | fcm-service (existing) | Handles token rotation, multicast |
| Message queuing | Custom retry logic | MessageQueueService (existing Flutter) | Handles offline queuing, auto-retry |

**Key insight:** Phase 4 is primarily integration work - connecting existing real-time infrastructure (Socket.IO, FCM, Redis pub/sub) with the After Hours match/session model from Phase 3.

## Common Pitfalls

### Pitfall 1: Messages Delivered to Wrong Match
**What goes wrong:** Messages from After Hours chat appear in regular chat or vice versa
**Why it happens:** Reusing same event names or not checking match type
**How to avoid:** Use `after_hours:` prefix for all After Hours events. Validate match type before allowing message send.
**Warning signs:** Users seeing ephemeral messages in permanent chat, confusion about message persistence

### Pitfall 2: Redis Subscriber Blocking Server Startup
**What goes wrong:** chat-service fails to start if Redis is temporarily unavailable
**Why it happens:** Awaiting Redis connection in synchronous startup path
**How to avoid:** Initialize Redis subscriber asynchronously, allow server to start without it. Log warnings, retry in background.
**Warning signs:** Deployment failures when Redis has brief outages

### Pitfall 3: Session Expiry Race Condition
**What goes wrong:** User sends message right as session expires, message saved but session shows expired
**Why it happens:** Not using transactions, checking expiry before insert
**How to avoid:** Use transaction that checks `expires_at > NOW()` as part of INSERT. Return MATCH_EXPIRED if check fails.
**Warning signs:** Messages appearing in expired chats, user confusion

### Pitfall 4: Typing Indicator Storm
**What goes wrong:** Every keystroke sends typing event, overwhelming server and recipient
**Why it happens:** No debouncing on client side
**How to avoid:** Debounce typing start (300ms), auto-stop after 2s of no input (per CONTEXT.md)
**Warning signs:** High Socket.IO traffic, rate limiting triggers, jittery UI

### Pitfall 5: Socket Room Leakage
**What goes wrong:** User joins match room but never leaves, receives messages after declining
**Why it happens:** Not cleaning up room membership on decline/expire
**How to avoid:** On `after_hours:match_expired` or decline, explicitly leave `after_hours:match:{matchId}` room
**Warning signs:** Users receiving messages from matches they declined

### Pitfall 6: Message History Lost on App Reopen
**What goes wrong:** User closes app during chat, reopens and messages are gone
**Why it happens:** Only loading messages via Socket.IO, no HTTP endpoint for history
**How to avoid:** Provide GET endpoint for After Hours message history (per CONTEXT.md: "Full chat history persists if user leaves and reopens")
**Warning signs:** User complaints about missing messages, support tickets

### Pitfall 7: Grace Period Confusion
**What goes wrong:** Session expires but grace period allows continued chat, then abruptly cuts off
**Why it happens:** Unclear grace period handling, no visual feedback
**How to avoid:** Per CONTEXT.md: 30-60 second grace period with clear banner. Disable send button when grace period ends.
**Warning signs:** Users mid-sentence getting cut off, frustrated user feedback

## Code Examples

Verified patterns from existing codebase:

### Socket.IO Event Registration Pattern
```typescript
// Source: chat-service/src/socket/message-handler.ts lines 452-467
// Pattern for registering handlers with rate limiting

export const setupAfterHoursHandlers = (
  io: SocketServer,
  socket: SocketWithAuth,
  pool: Pool,
  rateLimiter?: SocketRateLimiter
) => {
  const userId = socket.userId!;

  // Define handlers
  const handleSendMessage = async (data: any, callback?: Function) => { /* ... */ };
  const handleTyping = async (data: any, callback?: Function) => { /* ... */ };
  const handleMarkRead = async (data: any, callback?: Function) => { /* ... */ };

  // Register with rate limiting if available
  if (rateLimiter) {
    socket.on('after_hours:send_message', rateLimiter.wrapHandler('after_hours:send_message', handleSendMessage));
    socket.on('after_hours:typing', rateLimiter.wrapHandler('after_hours:typing', handleTyping));
    socket.on('after_hours:mark_read', rateLimiter.wrapHandler('after_hours:mark_read', handleMarkRead));
  } else {
    socket.on('after_hours:send_message', handleSendMessage);
    socket.on('after_hours:typing', handleTyping);
    socket.on('after_hours:mark_read', handleMarkRead);
  }

  logger.debug('After Hours handlers registered', { socketId: socket.id, userId });
};
```

### Room Join/Leave Pattern
```typescript
// Source: chat-service/src/socket/index.ts lines 68-81
// Adapted for After Hours match rooms

// On match acceptance - join room
socket.on('after_hours:join_chat', (data: { matchId: string }) => {
  const matchId = data.matchId;

  // Validate user is part of this match (already done in match acceptance flow)
  socket.join(`after_hours:match:${matchId}`);

  logger.info('User joined After Hours chat room', {
    socketId: socket.id,
    userId: socket.userId,
    matchId,
  });
});

// On match decline/expire - leave room
socket.on('after_hours:leave_chat', (data: { matchId: string }) => {
  socket.leave(`after_hours:match:${data.matchId}`);
});
```

### Frontend Socket Event Listener Pattern
```dart
// Source: frontend/lib/services/socket_service.dart lines 145-169
// Pattern for listening to After Hours events

void _setupAfterHoursEventHandlers() {
  // New match event (from Redis pub/sub via chat-service)
  _socket!.on('after_hours:match', (data) {
    debugPrint('Socket: New After Hours match received');
    try {
      if (data is! Map<String, dynamic>) return;
      _afterHoursMatchController.add(data);
    } catch (e) {
      debugPrint('Socket: Error parsing After Hours match: $e');
    }
  });

  // New message in After Hours chat
  _socket!.on('after_hours:new_message', (data) {
    debugPrint('Socket: After Hours message received');
    try {
      if (data is! Map<String, dynamic>) return;
      final message = Message.fromJson(data);
      _afterHoursMessageController.add(message);
    } catch (e) {
      debugPrint('Socket: Error parsing After Hours message: $e');
    }
  });

  // Session expiry warning
  _socket!.on('after_hours:session_expiring', (data) {
    debugPrint('Socket: Session expiring warning');
    try {
      if (data is! Map<String, dynamic>) return;
      _sessionExpiringController.add(data);
    } catch (e) {
      debugPrint('Socket: Error parsing session expiring: $e');
    }
  });
}
```

### Read Receipt with checkmarks Pattern
```dart
// Source: CONTEXT.md decision - "Read receipts enabled - checkmarks or 'seen'"
// Following existing MessageStatusIndicator pattern

enum AfterHoursMessageStatus {
  sending,
  sent,
  delivered,
  read,
  failed,
}

Widget buildMessageStatusIcon(AfterHoursMessageStatus status) {
  switch (status) {
    case AfterHoursMessageStatus.sending:
      return const SizedBox(
        width: 14,
        height: 14,
        child: CircularProgressIndicator(strokeWidth: 1.5),
      );
    case AfterHoursMessageStatus.sent:
      return const Icon(Icons.check, size: 14, color: Colors.grey);
    case AfterHoursMessageStatus.delivered:
      return const Icon(Icons.done_all, size: 14, color: Colors.grey);
    case AfterHoursMessageStatus.read:
      return const Icon(Icons.done_all, size: 14, color: VlvtColors.gold);
    case AfterHoursMessageStatus.failed:
      return const Icon(Icons.error_outline, size: 14, color: VlvtColors.error);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP polling for messages | Socket.IO real-time | Industry standard | Immediate delivery, lower latency |
| Single Redis client | Separate pub/sub client | BullMQ best practice | Avoids subscription mode conflicts |
| Per-keystroke typing | Debounced typing | UX best practice | Smoother experience, less jitter |
| Client-controlled deletion | Server-side retention | Safety requirement | Evidence preserved for moderation |

**Deprecated/outdated:**
- Polling transport in Socket.IO: Use WebSocket-only for CSRF protection (already configured)
- Legacy engine.io protocol: Disabled via `allowEIO3: false` (already configured)

## Open Questions

Things that couldn't be fully resolved:

1. **Grace period exact duration**
   - What we know: CONTEXT.md specifies 30-60 second range
   - What's unclear: Should it be configurable? Different for active vs idle chats?
   - Recommendation: Claude's discretion. Suggest 45 seconds fixed - long enough to finish a thought, short enough to not extend session significantly.

2. **Read receipts batch frequency**
   - What we know: Should show "seen" when other person reads
   - What's unclear: Send read receipt per-message or batch?
   - Recommendation: Batch on scroll/visibility change, not per-message. Debounce 500ms to avoid flooding.

3. **Message history pagination**
   - What we know: Need GET endpoint for app reopen scenario
   - What's unclear: Pagination approach? Cursor vs offset?
   - Recommendation: Match existing messages endpoint pattern (timestamp cursor pagination). After Hours matches typically have fewer messages.

4. **Notification batching during high activity**
   - What we know: CONTEXT.md mentions "Batch notifications during high-activity periods"
   - What's unclear: What defines "high activity"? How to batch?
   - Recommendation: Skip FCM for messages arriving <5 seconds apart. User already in active chat if rapid messages.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/chat-service/src/socket/index.ts` - Socket.IO initialization pattern
- Existing codebase: `backend/chat-service/src/socket/message-handler.ts` - Message event handlers
- Existing codebase: `backend/profile-service/src/services/matching-scheduler.ts` - Redis pub/sub publishing
- Existing codebase: `frontend/lib/services/socket_service.dart` - Flutter Socket.IO client
- Existing codebase: `frontend/lib/screens/chat_screen.dart` - Chat UI patterns
- Existing codebase: `backend/shared/src/middleware/socket-rate-limiter.ts` - Rate limiting
- Existing codebase: `backend/migrations/021_add_after_hours_tables.sql` - after_hours_messages schema

### Secondary (MEDIUM confidence)
- [Socket.IO Rooms Documentation](https://socket.io/docs/v4/rooms/) - Room management
- [IORedis Pub/Sub](https://github.com/redis/ioredis#pubsub) - Subscription pattern

### Tertiary (LOW confidence)
- None - all findings verified with primary codebase sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use
- Socket.IO patterns: HIGH - Exact patterns from existing chat-service
- Redis pub/sub: HIGH - Pattern already implemented in matching-scheduler
- Ephemeral message storage: HIGH - after_hours_messages table already exists
- Frontend patterns: HIGH - Matches existing socket_service.dart and chat_screen.dart

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable domain, established patterns)
