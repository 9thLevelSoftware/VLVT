---
phase: 04-real-time-chat
plan: 04
subsystem: frontend-services
tags: [flutter, socket.io, real-time, after-hours]

dependency-graph:
  requires: [04-01, 04-02]
  provides: [flutter-socket-after-hours, after-hours-chat-service]
  affects: [04-05, 05-*]

tech-stack:
  added: []
  patterns: [stream-controllers, auto-retry, exponential-backoff]

key-files:
  created:
    - frontend/lib/services/after_hours_chat_service.dart
  modified:
    - frontend/lib/services/socket_service.dart

decisions:
  - id: 04-04-01
    choice: "8 separate stream controllers for After Hours events"
    rationale: "Consistent with existing socket_service.dart patterns"
  - id: 04-04-02
    choice: "3-attempt retry with 1s, 2s, 4s exponential backoff"
    rationale: "Silent retry up to multiple failures per CONTEXT.md requirements"
  - id: 04-04-03
    choice: "Separate HTTP service for message history vs socket for real-time"
    rationale: "HTTP for history retrieval (app reopen), socket for real-time operations"

metrics:
  tasks-completed: 2
  duration: ~3 min
  completed: 2025-01-22
---

# Phase 04 Plan 04: Flutter Socket Extension & Chat Service Summary

**One-liner:** Extended socket_service.dart with 8 After Hours event streams and created after_hours_chat_service.dart with auto-retry message sending

## What Was Built

### 1. Socket Service After Hours Extension
Extended `frontend/lib/services/socket_service.dart` with comprehensive After Hours support:

**Stream Controllers (8 new):**
- `_afterHoursMatchController` - New match found
- `_afterHoursMessageController` - New message received
- `_afterHoursTypingController` - Typing indicators
- `_afterHoursReadController` - Read receipts
- `_sessionExpiringController` - 2-minute warning
- `_sessionExpiredController` - Session ended
- `_noMatchesController` - No matches available
- `_matchExpiredController` - Match auto-declined

**Event Listeners:**
- `after_hours:match` - Match found during session
- `after_hours:new_message` - Real-time message receipt
- `after_hours:user_typing` - Ephemeral typing status
- `after_hours:messages_read` - Ephemeral read receipts
- `after_hours:session_expiring` - 2-minute warning before expiry
- `after_hours:session_expired` - Session ended
- `after_hours:no_matches` - No suitable matches
- `after_hours:match_expired` - Auto-decline timer fired

**Emitter Methods:**
- `sendAfterHoursMessage()` - Send message with 10s timeout
- `sendAfterHoursTypingIndicator()` - Ephemeral typing emit
- `markAfterHoursMessagesRead()` - Mark messages read
- `joinAfterHoursChat()` / `leaveAfterHoursChat()` - Room management

### 2. After Hours Chat Service
Created `frontend/lib/services/after_hours_chat_service.dart`:

**getMessageHistory():**
- HTTP GET to `/api/after-hours/messages/{matchId}`
- Supports cursor pagination with `before` timestamp
- Used when user reopens app mid-session

**sendMessageWithRetry():**
- Wraps socket sending with auto-retry
- 3 attempts with exponential backoff (1s, 2s, 4s)
- Waits for reconnection if socket disconnected
- Returns null only after all retries fail

## Integration Points

```
SocketService                    AfterHoursChatService
     |                                    |
     |-- Stream controllers ------------>| (consumes streams)
     |                                    |
     |<-- sendAfterHoursMessage ---------|
     |                                    |
     +-- Socket.IO server                 +-- HTTP /api/after-hours/*
```

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

```
flutter analyze lib/services/socket_service.dart lib/services/after_hours_chat_service.dart
Analyzing 2 items...
No issues found!
```

Pattern matches confirmed:
- `after_hours:match` listener present
- `sendAfterHoursMessage` method present
- `getMessageHistory` and `sendMessageWithRetry` present

## Commits

| Hash | Description |
|------|-------------|
| 33a43c9 | feat(04-04): extend socket_service.dart with After Hours events |
| 45af8c7 | feat(04-04): create AfterHoursChatService for chat operations |

## Next Phase Readiness

**Ready for Plan 04-05 (Client Integration Tests):**
- Socket events ready for UI consumption
- Chat service ready for provider integration
- All streams disposable in widget lifecycle

**Dependencies satisfied:**
- Backend After Hours handler (04-01, 04-02) provides server-side events
- Frontend services now ready to receive and emit
