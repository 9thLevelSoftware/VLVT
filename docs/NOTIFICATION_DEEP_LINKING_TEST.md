# Notification Deep Linking Test Plan

## Overview
This document describes how to test push notification deep linking functionality in the VLVT app.

## Implementation Details

### Backend Notification Payloads

**Message Notifications** (`backend/chat-service/src/services/fcm-service.ts:95-184`):
```typescript
{
  notification: {
    title: "New message from [SenderName]",
    body: "[Message preview]"
  },
  data: {
    type: "message",
    matchId: "[match-id]",
    senderId: "[user-id]",
    senderName: "[name]",
    click_action: "FLUTTER_NOTIFICATION_CLICK"
  }
}
```

**Match Notifications** (`backend/chat-service/src/services/fcm-service.ts:189-271`):
```typescript
{
  notification: {
    title: "🎉 It's a match!",
    body: "You and [MatchedUserName] liked each other!"
  },
  data: {
    type: "match",
    matchId: "[match-id]",
    matchedUserName: "[name]",
    click_action: "FLUTTER_NOTIFICATION_CLICK"
  }
}
```

### Frontend Notification Handling

**Flow:**
1. `notification_service.dart` receives notification
2. Extracts `message.data` payload
3. Calls `onNotificationTap` callback with data
4. `main.dart` `_handleNotificationTap()` routes to appropriate screen

**Message Notification Navigation** (`main.dart:100-114`):
- Extracts `matchId` from data
- Navigates to `ChatScreen(matchId: matchId)`
- Opens the specific chat conversation

**Match Notification Navigation** (`main.dart:116-133`):
- Clears navigation stack
- Navigates to `MainScreen(initialTab: 1)`
- Shows Matches tab for premium users
- Shows Profile tab for free users (tab clamping)

### Notification Scenarios Handled

1. **Foreground**: App is open and visible
   - Shows local notification
   - User taps → navigates to screen

2. **Background**: App is running but not visible
   - System shows notification
   - User taps → `onMessageOpenedApp` fires → navigates

3. **Terminated**: App is completely closed
   - System shows notification
   - User taps → app launches → `getInitialMessage` fires → navigates

## Test Cases

### Test Case 1: Message Notification - Foreground
**Prerequisites:**
- User A and User B are matched
- User A is logged into the app on Device 1
- User B is logged into the app on Device 2
- Device 1 app is in foreground

**Steps:**
1. On Device 2, open chat with User A
2. Send a message: "Test message foreground"
3. On Device 1, notification should appear at top
4. Tap the notification

**Expected Result:**
- App navigates to ChatScreen
- Shows conversation with User B
- Message "Test message foreground" is visible
- Debug logs show:
  ```
  👆 Notification tapped
     Type: message
     Match ID: [match-id]
  Handling notification tap: {type: message, matchId: [match-id], ...}
  Navigating to chat screen for match: [match-id]
  ```

### Test Case 2: Message Notification - Background
**Prerequisites:**
- Same as Test Case 1
- Device 1 app is in background (home screen or another app)

**Steps:**
1. On Device 2, send message: "Test message background"
2. On Device 1, notification appears in system tray
3. Tap the notification

**Expected Result:**
- App comes to foreground
- Navigates to ChatScreen with User B
- Message visible
- Same debug logs as Test Case 1

### Test Case 3: Message Notification - Terminated
**Prerequisites:**
- Same as Test Case 1
- Device 1 app is completely closed (swiped away)

**Steps:**
1. On Device 2, send message: "Test message terminated"
2. On Device 1, notification appears
3. Tap the notification

**Expected Result:**
- App launches
- Shows splash screen briefly
- Navigates to ChatScreen with User B
- Message visible
- Debug logs show notification handling

### Test Case 4: Match Notification - Background (Premium User)
**Prerequisites:**
- User A (Device 1) has premium subscription
- User B (Device 2) exists but not matched with A
- Device 1 app is in background

**Steps:**
1. On Device 2, like User A's profile
2. On Device 1, like User B's profile (creates match)
3. Match notification appears on Device 2
4. Tap the notification

**Expected Result:**
- App comes to foreground
- Navigation stack clears
- Shows MainScreen with Matches tab selected (index 1)
- New match with User A is visible
- Debug logs show:
  ```
  👆 Notification tapped
     Type: match
     Match ID: [match-id]
  Handling notification tap: {type: match, matchId: [match-id], ...}
  Navigating to MainScreen for new match notification
  ```

### Test Case 5: Match Notification - Free User
**Prerequisites:**
- User A (Device 1) is free tier (no premium)
- Same setup as Test Case 4

**Steps:**
1. Create a match (same as Test Case 4)
2. Tap match notification on Device 1

**Expected Result:**
- App shows MainScreen
- Free users have 2 tabs: Search (0), Profile (1)
- Tab 1 (Profile) is selected due to tab clamping
- Upgrade banner is visible
- User can upgrade to see Matches

**Note:** This is expected behavior - free users don't have access to Matches tab

### Test Case 6: Invalid Notification Data
**Prerequisites:**
- Device has test notification capability

**Steps:**
1. Send test notification with missing matchId:
   ```json
   {
     "data": {
       "type": "message"
     }
   }
   ```
2. Tap notification

**Expected Result:**
- Debug log: "Invalid matchId in notification data"
- No navigation occurs
- App remains on current screen

### Test Case 7: Multiple Rapid Notifications
**Prerequisites:**
- User A and User B matched
- Device 1 app in background

**Steps:**
1. On Device 2, send 3 messages quickly
2. 3 notifications appear on Device 1
3. Tap first notification → opens chat
4. Go back to notification tray
5. Tap second notification

**Expected Result:**
- First tap navigates to chat
- Second tap doesn't stack another chat screen
- User sees the same chat with all messages
- No navigation stack issues

## Manual Testing Tools

### Using Firebase Console
1. Go to Firebase Console → Cloud Messaging
2. Send test notification:
   - **Title:** "New message from TestUser"
   - **Body:** "This is a test message"
   - **Additional options → Custom data:**
     ```
     type: message
     matchId: [valid-match-id]
     ```
3. Select target device token
4. Send notification

### Using Backend API (if available)
```bash
# Send test message notification
curl -X POST http://localhost:3003/test/send-notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [jwt-token]" \
  -d '{
    "recipientUserId": "[user-id]",
    "type": "message",
    "matchId": "[match-id]",
    "senderName": "Test User",
    "messageText": "Test notification message"
  }'
```

## Debug Logging

Enable debug logging by running the app in debug mode:
```bash
cd frontend
flutter run
```

Key log messages to watch for:
- `🔔 Initializing notification service...`
- `📱 FCM Token: [token]...`
- `📬 Foreground message received: [message-id]`
- `👆 Notification tapped`
- `Handling notification tap: {type: ..., matchId: ...}`
- `Navigating to chat screen for match: [match-id]`
- `Navigating to MainScreen for new match notification`

## Verification Checklist

- [ ] Message notifications navigate to correct chat (foreground)
- [ ] Message notifications navigate to correct chat (background)
- [ ] Message notifications navigate to correct chat (terminated)
- [ ] Match notifications navigate to matches tab (premium users)
- [ ] Match notifications handled gracefully for free users
- [ ] Invalid matchId is handled without crash
- [ ] Multiple notifications don't cause navigation stack issues
- [ ] Debug logs show correct notification data extraction
- [ ] iOS notifications work correctly
- [ ] Android notifications work correctly
- [ ] Notification channels are properly configured
- [ ] Notification tap callback is set during initialization

## Known Issues & Limitations

### Issue: Free Users and Match Notifications
**Status:** Expected Behavior
- Free users tapping match notifications go to Profile tab
- This is because MainScreen tab clamping protects against invalid indices
- Free users should see upgrade banner and be prompted to subscribe

**Potential Improvement:**
- Could show a dialog explaining they need premium to see matches
- Or navigate to paywall screen directly

### Issue: Navigator Not Ready
**Status:** Fixed
- Added null check for `navigatorKey.currentState`
- Logs warning if navigator not ready
- Prevents crashes during app initialization

## Implementation Files

### Key Files
- `frontend/lib/main.dart` - Lines 88-137: `_handleNotificationTap()`
- `frontend/lib/services/notification_service.dart` - Notification setup and handling
- `frontend/lib/screens/chat_screen.dart` - Accepts matchId parameter
- `frontend/lib/screens/main_screen.dart` - Accepts initialTab parameter
- `backend/chat-service/src/services/fcm-service.ts` - Sends notifications

### Configuration Files
- `frontend/android/app/src/main/AndroidManifest.xml` - Android notification config
- `frontend/ios/Runner/Info.plist` - iOS notification config
- `backend/chat-service/.env` - Firebase Admin SDK credentials

## Troubleshooting

### Notifications Not Received
1. Check FCM token registration:
   ```
   ✅ FCM token registered with backend
   ```
2. Verify Firebase credentials in backend
3. Check device notification permissions
4. Verify Firebase Cloud Messaging is enabled in Firebase Console

### Notifications Received But Not Navigating
1. Check debug logs for `onNotificationTap callback not set`
2. Verify notification data includes `type` and `matchId`
3. Check that `navigatorKey` is properly set in MaterialApp
4. Verify notification service initialization completed

### Chat Screen Shows Loading Forever
1. Verify matchId is valid
2. Check network connectivity
3. Verify chat-service is running
4. Check backend logs for errors

### Wrong Screen Opens
1. Verify notification data has correct `type` field
2. Check tab index for premium vs free users
3. Review debug logs for navigation decisions

## Future Improvements

1. **Better Free User Handling**: Show paywall or explanation dialog for match notifications
2. **Deep Link to Specific Match**: For match notifications, could open the specific match detail
3. **Notification Actions**: Add quick reply buttons to message notifications
4. **Badge Count**: Update app icon badge based on unread messages
5. **Grouping**: Group multiple notifications from same user
6. **Rich Content**: Show profile pictures in notifications
