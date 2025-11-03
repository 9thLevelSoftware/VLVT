# API Integration Documentation

This document describes the changes made to integrate the Flutter frontend with the backend APIs.

## Overview

The frontend has been refactored to consume live APIs from the backend services instead of using hardcoded stub data. All authenticated API requests now include the JWT token from AuthService as an `Authorization: Bearer <token>` header.

## Changes Made

### 1. Model Classes

Created model classes in `frontend/lib/models/` for type safety:

- **Profile** (`profile.dart`): Represents user profile data
  - Fields: userId, name, age, bio, photos, interests
  - JSON serialization support

- **Match** (`match.dart`): Represents a match between two users
  - Fields: id, userId1, userId2, createdAt
  - JSON serialization support

- **Message** (`message.dart`): Represents a chat message
  - Fields: id, matchId, senderId, text, timestamp
  - JSON serialization support

### 2. API Service Classes

#### ProfileApiService (`frontend/lib/services/profile_api_service.dart`)

Manages profile-related API calls:

- **getProfile(String userId)**: Fetches a user's profile from `GET /profile/:userId`
- **getDiscoveryProfiles()**: Fetches random profiles from `GET /profiles/discover`
- **updateProfile(Profile profile)**: Updates user profile via `PUT /profile/:userId`

Features:
- Extends ChangeNotifier for state management
- Depends on AuthService for JWT token
- Uses AppConfig.profileServiceUrl as base URL
- Includes Authorization header on all requests
- Proper error handling and logging

#### ChatApiService (`frontend/lib/services/chat_api_service.dart`)

Manages chat and match-related API calls:

- **getMatches(String userId)**: Fetches user matches from `GET /matches/:userId`
- **getMessages(String matchId)**: Fetches messages from `GET /messages/:matchId`

Features:
- Extends ChangeNotifier for state management
- Depends on AuthService for JWT token
- Uses AppConfig.chatServiceUrl as base URL
- Includes Authorization header on all requests
- Proper error handling and logging

### 3. Provider Registration

Updated `frontend/lib/main.dart` to register new services:

```dart
ChangeNotifierProxyProvider<AuthService, ProfileApiService>(
  create: (context) => ProfileApiService(context.read<AuthService>()),
  update: (context, auth, previous) => ProfileApiService(auth),
),
ChangeNotifierProxyProvider<AuthService, ChatApiService>(
  create: (context) => ChatApiService(context.read<AuthService>()),
  update: (context, auth, previous) => ChatApiService(auth),
),
```

Using ProxyProvider ensures the services are recreated when AuthService changes (e.g., on login/logout).

### 4. Screen Refactoring

#### DiscoveryScreen (`frontend/lib/screens/discovery_screen.dart`)

**Changes:**
- Converted to StatefulWidget to manage loading state
- Added initState to fetch profiles on screen load
- Replaced hardcoded profile list with API call to ProfileApiService.getDiscoveryProfiles()
- Added loading indicator while fetching
- Added error handling with retry button
- Updated UI to display Profile model properties (name, age, bio, interests)
- Added Chip widgets to display interests
- Graceful fallbacks for missing data

**Benefits:**
- Real-time profile data from database
- Better user experience with loading states
- Error recovery mechanism

#### MatchesScreen (`frontend/lib/screens/matches_screen.dart`)

**Changes:**
- Converted to StatefulWidget
- Added FutureBuilder to fetch matches from ChatApiService.getMatches()
- Gets userId from AuthService
- Nested FutureBuilder to fetch profile details for each match
- Added loading indicator
- Added error handling with retry button
- Implemented timestamp formatting (_formatTimestamp)
- Shows relative time (e.g., "2h ago", "5d ago")

**Benefits:**
- Real matches from database
- Profile information for each match
- Better error handling
- Improved timestamp display

#### ProfileScreen (`frontend/lib/screens/profile_screen.dart`)

**Changes:**
- Converted to StatefulWidget
- Added FutureBuilder to fetch user profile from ProfileApiService.getProfile()
- Gets userId from AuthService
- Displays real profile data (name, age, bio, interests)
- Shows "No profile information available" when data is missing
- Added loading indicator
- Added error handling with retry button
- Conditional rendering based on available data

**Benefits:**
- Displays actual user profile from database
- Graceful handling of incomplete profiles
- Better user feedback

## API Request Flow

1. User authenticates via AuthService (Sign in with Apple/Google)
2. AuthService stores JWT token and userId
3. Screen components access ProfileApiService or ChatApiService via Provider
4. Services read token from AuthService
5. Services make HTTP requests with Authorization header
6. Backend validates token and returns data
7. Services parse JSON response into model objects
8. UI updates with real data

## Error Handling

All services include comprehensive error handling:
- Network errors are caught and logged
- HTTP error status codes are handled appropriately
- User-friendly error messages are displayed
- Retry mechanisms are provided in UI
- Graceful fallbacks for missing data

## Testing Considerations

To test the integration:
1. Ensure backend services are running (use `./start-backend.sh`)
2. Configure proper service URLs in AppConfig
3. Sign in to get a valid JWT token
4. Navigate through screens to verify API calls
5. Check logs for any errors
6. Test error scenarios (disconnect network, invalid data, etc.)

## Future Enhancements

Potential improvements:
1. Add caching to reduce API calls
2. Implement real-time updates via WebSockets
3. Add pagination for discovery profiles
4. Implement profile editing UI
5. Add image upload for profile photos
6. Add message sending functionality
7. Implement swipe actions to create matches
8. Add analytics/monitoring

## Security Notes

- All API requests include JWT Bearer token
- Token is securely stored via FlutterSecureStorage
- Backend should validate tokens on all endpoints
- Consider implementing token refresh mechanism
- Use HTTPS in production
- Validate all user input on backend
