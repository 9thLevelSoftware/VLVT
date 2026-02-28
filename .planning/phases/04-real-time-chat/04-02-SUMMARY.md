---
phase: 04-real-time-chat
plan: 02
subsystem: api
tags: [http, rest-api, messages, pagination, after-hours]

# Dependency graph
requires:
  - phase: 04-01
    provides: After Hours Socket.IO handlers base infrastructure
  - phase: 01-01
    provides: after_hours_messages table schema
provides:
  - HTTP endpoint for After Hours message history retrieval
  - Cursor-based pagination for message history
  - Match ownership validation for message access
affects: [frontend-chat, 04-03, 04-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [cursor-pagination, factory-router-pattern]

key-files:
  created:
    - backend/chat-service/src/routes/after-hours-chat.ts
  modified:
    - backend/chat-service/src/socket/after-hours-handler.ts
    - backend/chat-service/src/index.ts

key-decisions:
  - "Return messages even if match expired - allows history viewing"
  - "Cursor pagination with 'before' timestamp parameter"
  - "50 message limit per request for performance"
  - "Messages ordered newest-first, client reverses for display"
  - "Ephemeral read receipts without DB storage"

patterns-established:
  - "Router factory: createAfterHoursChatRouter(pool) returns configured router"
  - "Message history cursor: ?before=ISO_TIMESTAMP for pagination"

requirements-completed: []

# Metrics
duration: 18min
completed: 2025-01-23
---

# Phase 04-02: After Hours Message Handlers & HTTP History Summary

**Extended After Hours handlers with message/typing/read handlers and HTTP endpoint for message history retrieval**

## Performance

- **Duration:** 18 min
- **Started:** 2025-01-23T03:36:44Z
- **Completed:** 2025-01-23T03:54:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

### Task 1: Socket.IO Message Handlers
- Added `after_hours:send_message` handler with INSERT INTO after_hours_messages
- Added `after_hours:typing` handler with ephemeral emit to recipient (no DB storage)
- Added `after_hours:mark_read` handler with ephemeral read receipt emission
- All handlers validate match ownership and active status (declined_by IS NULL, expires_at > NOW)
- Return `MATCH_EXPIRED` error code when match is no longer active
- Rate limiting applied: 30/60/60 per minute for send/typing/read respectively

### Task 2: HTTP Message History Endpoint
- Created `GET /after-hours/messages/:matchId` endpoint
- Validates UUID format for matchId
- Verifies user is part of match (user_id_1 or user_id_2)
- Returns messages even if match expired (for history viewing)
- Supports cursor pagination with `before` timestamp parameter
- Returns `hasMore` boolean for infinite scroll implementation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add After Hours message handlers** - `a8f16ee`
   - Extended after-hours-handler.ts with send_message, typing, mark_read handlers
   - 292 lines added with DB insert, emit, and validation logic

2. **Task 2: HTTP message history endpoint** - `1437804`
   - Created routes/after-hours-chat.ts with GET endpoint
   - Registered route in index.ts with auth middleware

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `backend/chat-service/src/socket/after-hours-handler.ts` | Modified | Added 3 message handlers (send, typing, read) |
| `backend/chat-service/src/routes/after-hours-chat.ts` | Created | HTTP endpoint for message history |
| `backend/chat-service/src/index.ts` | Modified | Route registration |

## Decisions Made

1. **Ephemeral read receipts:** Read receipts for After Hours messages are emitted to sender without database storage. Rationale: Ephemeral messages don't need persistent read state - they disappear when match expires anyway.

2. **Messages returned for expired matches:** The HTTP endpoint returns messages even if the match has expired. Rationale: Users should be able to view their chat history when reopening the app, even if the session has ended.

3. **MATCH_EXPIRED error code:** Both Socket.IO and HTTP return a specific error code when trying to send messages to expired matches. Client can handle this to show appropriate UI.

4. **Cursor pagination (not offset):** Using timestamp-based cursor (`?before=`) instead of offset pagination. Rationale: More efficient for real-time chat where new messages are constantly being added.

## Deviations from Plan

None - plan executed exactly as written.

## Key Patterns Implemented

### Socket Message Flow
```
Client -> after_hours:send_message -> validate match -> INSERT DB -> callback({success}) -> emit to recipient
```

### HTTP History Flow
```
Client -> GET /after-hours/messages/:matchId -> validate user -> SELECT messages -> return with hasMore
```

### Rate Limiting
```typescript
if (rateLimiter) {
  socket.on('after_hours:send_message', rateLimiter.wrapHandler('after_hours:send_message', handler));
} else {
  socket.on('after_hours:send_message', handler);  // Fallback for tests
}
```

## Verification Results

| Check | Status |
|-------|--------|
| `npm run build` succeeds | PASS |
| `after_hours:send_message` in handler | PASS |
| `after-hours/messages` in routes | PASS |
| INSERT INTO after_hours_messages | PASS |
| SELECT FROM after_hours_messages | PASS |

## Success Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Users can send messages that persist in after_hours_messages table | PASS | INSERT query in handleAfterHoursSendMessage |
| Typing indicators broadcast to chat partner | PASS | io.to(user:recipientId).emit in handleAfterHoursTyping |
| Read receipts emitted (not stored) | PASS | emit without DB query in handleAfterHoursMarkRead |
| HTTP endpoint allows message history retrieval | PASS | GET /after-hours/messages/:matchId endpoint |
| All operations validate match ownership | PASS | user_id_1/user_id_2 checks in all handlers |

## Next Phase Readiness

- Message handlers ready for After Hours chat UI
- HTTP history endpoint ready for app reopen scenario
- Ephemeral messaging foundation complete
- Ready for Phase 04-03: FCM push notifications for After Hours events

---
*Phase: 04-real-time-chat*
*Plan: 02*
*Completed: 2025-01-23*
