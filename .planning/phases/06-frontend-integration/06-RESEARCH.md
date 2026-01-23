# Phase 6: Frontend Integration - Research

**Researched:** 2026-01-23
**Domain:** Flutter UI/UX, State Management, Background Services
**Confidence:** HIGH

## Summary

This phase integrates the complete After Hours feature into the Flutter frontend. The research focused on three core areas: (1) building a state machine service using the existing Provider/ChangeNotifier patterns already established in the codebase, (2) implementing Tinder-style swipe gestures and modal overlays using patterns already proven in the discovery screen, and (3) background location handling via flutter_foreground_task for Android 14+ compliance.

The existing codebase provides excellent patterns to follow. The discovery screen already implements swipe gestures with animations, the chat screen demonstrates real-time messaging with Socket.IO integration, and the socket_service.dart already has all After Hours event streams wired up. The primary work is creating new screens and a coordinating service that ties these existing patterns together.

**Primary recommendation:** Follow existing codebase patterns exactly - use ChangeNotifier for the AfterHoursService state machine, reuse discovery screen swipe patterns for match cards, and fork the existing chat screen for ephemeral chat.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in pubspec.yaml)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| provider | ^6.1.2 | State management | Already used throughout app |
| socket_io_client | ^3.1.3 | Real-time events | Already integrated, After Hours events wired |
| cached_network_image | ^3.3.1 | Photo display | Already used in discovery/chat |
| geolocator | ^14.0.1 | Location services | Already used for main app location |
| permission_handler | ^12.0.1 | Permissions | Already configured |

### New Dependencies Required
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| flutter_foreground_task | ^9.2.0 | Background location | Android 14+ foreground service for location updates |

### No New Dependencies Needed
| Feature | Use Instead |
|---------|-------------|
| State machine library | ChangeNotifier with enum states (existing pattern) |
| Countdown timer package | Custom widget with Timer + AnimatedBuilder (more control) |
| Swipe card package | Existing discovery_screen.dart patterns (GestureDetector) |
| Modal bottom sheet package | Flutter's showModalBottomSheet (sufficient) |

**Installation:**
```bash
cd frontend
flutter pub add flutter_foreground_task:^9.2.0
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── services/
│   └── after_hours_service.dart       # State machine (AfterHoursState enum + ChangeNotifier)
├── screens/
│   ├── after_hours_tab_screen.dart    # Main entry point in tab bar
│   ├── after_hours_profile_screen.dart # Profile creation/edit
│   ├── after_hours_preferences_screen.dart # Preferences settings
│   ├── after_hours_session_screen.dart # Active session (searching + matched states)
│   └── after_hours_chat_screen.dart   # Ephemeral chat (fork of chat_screen.dart)
├── widgets/
│   └── after_hours/
│       ├── session_timer.dart         # Countdown timer for session
│       ├── match_card_overlay.dart    # Modal match card with swipe
│       ├── searching_animation.dart   # "Searching nearby" animation
│       └── session_expiry_banner.dart # Warning banner at 2 min left
└── models/
    └── after_hours_match.dart         # Match model for After Hours
```

### Pattern 1: State Machine with ChangeNotifier
**What:** Centralized state management for After Hours session lifecycle
**When to use:** Managing complex multi-screen flows with shared state
**Example:**
```dart
// Source: Based on existing socket_service.dart and subscription_service.dart patterns

enum AfterHoursState {
  /// User has not started session, show profile/preferences setup if needed
  inactive,
  /// Checking profile/preferences, preparing to start session
  activating,
  /// Session active, searching for matches
  searching,
  /// Match found, showing match card
  matched,
  /// User accepted match, in ephemeral chat
  chatting,
  /// Session expiring soon (2 min warning)
  expiring,
  /// Session ended
  expired,
}

class AfterHoursService extends ChangeNotifier {
  final AuthService _authService;
  final SocketService _socketService;

  AfterHoursState _state = AfterHoursState.inactive;
  AfterHoursMatch? _currentMatch;
  String? _sessionId;
  DateTime? _expiresAt;
  int _nearbyCount = 0;

  // Subscriptions for socket events
  StreamSubscription? _matchSubscription;
  StreamSubscription? _expiringSubscription;
  StreamSubscription? _expiredSubscription;

  AfterHoursState get state => _state;
  AfterHoursMatch? get currentMatch => _currentMatch;
  int get remainingSeconds => _expiresAt != null
      ? _expiresAt!.difference(DateTime.now()).inSeconds.clamp(0, 999999)
      : 0;
  int get nearbyCount => _nearbyCount;

  void _setState(AfterHoursState newState) {
    if (_state != newState) {
      _state = newState;
      notifyListeners();
    }
  }

  Future<void> startSession({
    required int durationMinutes,
    required double latitude,
    required double longitude,
  }) async {
    _setState(AfterHoursState.activating);
    // API call, then transition to searching
    _setState(AfterHoursState.searching);
    _subscribeToEvents();
  }

  void _subscribeToEvents() {
    _matchSubscription = _socketService.onAfterHoursMatch.listen((data) {
      _currentMatch = AfterHoursMatch.fromJson(data);
      _setState(AfterHoursState.matched);
    });
    // ... other subscriptions
  }
}
```

### Pattern 2: Swipe Gesture for Match Cards
**What:** Reuse discovery screen's drag-to-swipe pattern for match acceptance
**When to use:** Match card accept/decline interactions
**Example:**
```dart
// Source: Existing discovery_screen.dart lines 448-544

GestureDetector(
  onPanStart: _onPanStart,
  onPanUpdate: (details) {
    setState(() {
      _cardPosition += details.delta;
      _cardRotation = (_cardPosition.dx / 1000).clamp(-0.35, 0.35);
    });
  },
  onPanEnd: (details) {
    final threshold = MediaQuery.of(context).size.width * 0.3;
    if (_cardPosition.dx.abs() > threshold) {
      // Animate off screen, then call accept or decline
      final swipeRight = _cardPosition.dx > 0;
      if (swipeRight) {
        _acceptMatch();
      } else {
        _declineMatch();
      }
    } else {
      // Snap back to center
      _animateBackToCenter();
    }
  },
  child: Transform.translate(
    offset: _cardPosition,
    child: Transform.rotate(
      angle: _cardRotation,
      child: MatchCardWidget(match: match),
    ),
  ),
)
```

### Pattern 3: Session Timer Widget
**What:** Custom countdown timer with visual urgency states
**When to use:** Session expiry display
**Example:**
```dart
// Source: Custom pattern based on existing timer patterns in chat_screen.dart

class SessionTimer extends StatefulWidget {
  final DateTime expiresAt;
  final VoidCallback? onExpired;
  final VoidCallback? onWarning; // Called at 2 min remaining

  @override
  State<SessionTimer> createState() => _SessionTimerState();
}

class _SessionTimerState extends State<SessionTimer> {
  Timer? _timer;
  Duration _remaining = Duration.zero;
  bool _warningShown = false;

  @override
  void initState() {
    super.initState();
    _updateRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _updateRemaining());
  }

  void _updateRemaining() {
    final now = DateTime.now();
    final remaining = widget.expiresAt.difference(now);

    if (remaining.inSeconds <= 0) {
      widget.onExpired?.call();
      _timer?.cancel();
    } else if (remaining.inSeconds <= 120 && !_warningShown) {
      _warningShown = true;
      widget.onWarning?.call();
    }

    setState(() => _remaining = remaining);
  }

  @override
  Widget build(BuildContext context) {
    final isUrgent = _remaining.inSeconds <= 120;
    final minutes = _remaining.inMinutes;
    final seconds = _remaining.inSeconds % 60;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isUrgent ? VlvtColors.crimson : VlvtColors.gold,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.timer,
            color: isUrgent ? Colors.white : VlvtColors.textOnGold,
            size: 16,
          ),
          const SizedBox(width: 4),
          Text(
            '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}',
            style: TextStyle(
              color: isUrgent ? Colors.white : VlvtColors.textOnGold,
              fontWeight: FontWeight.bold,
              fontFamily: 'Montserrat',
            ),
          ),
        ],
      ),
    );
  }
}
```

### Anti-Patterns to Avoid
- **Separate service per screen:** Don't create multiple services. One AfterHoursService manages all state.
- **Passing state via constructor:** Use Provider context.watch() to access state, not constructor injection.
- **Multiple socket subscriptions:** Subscribe once in service, not in each widget.
- **Timer in widget without cleanup:** Always cancel timers in dispose().

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swipe gestures | Custom touch math | Copy discovery_screen.dart pattern | Already tested, handles edge cases |
| Real-time events | New socket handlers | Existing socket_service.dart streams | Already has all After Hours events |
| Photo display | Raw Image widget | CachedNetworkImage | Handles loading, caching, errors |
| Form validation | Custom logic | Existing validators.dart | Consistent with app patterns |
| Location | Custom permissions | Existing location_service.dart | Already handles all edge cases |
| Modal overlays | Custom route | showModalBottomSheet | Built-in animations, backdrop |

**Key insight:** The existing codebase has solved most of these problems. The After Hours frontend is primarily about composing existing patterns into new screens.

## Common Pitfalls

### Pitfall 1: Socket Subscription Leaks
**What goes wrong:** Subscribing to socket events in widgets without cleanup causes memory leaks and duplicate handlers
**Why it happens:** Each widget instance creates new subscription
**How to avoid:** Subscribe in AfterHoursService, widgets listen to service's ChangeNotifier
**Warning signs:** Duplicate event handling, memory growth, stale data

### Pitfall 2: Timer Drift Between Server and Client
**What goes wrong:** Client timer shows different time than server thinks
**Why it happens:** Relying on client-side duration calculation
**How to avoid:** Use server's `expiresAt` timestamp, calculate remaining from `DateTime.now()`
**Warning signs:** Session ends before timer shows 0, or timer shows 0 but session continues

### Pitfall 3: State Desync After Background/Resume
**What goes wrong:** App returns from background showing stale state
**Why it happens:** Not refreshing state on app lifecycle resume
**How to avoid:** Implement WidgetsBindingObserver, call refreshSessionStatus() on resume
**Warning signs:** Match card still visible after partner declined, wrong timer value

### Pitfall 4: Missing Loading States During API Calls
**What goes wrong:** UI appears frozen, double-taps trigger duplicate actions
**Why it happens:** Not disabling buttons during async operations
**How to avoid:** Use `_isLoading` state, disable buttons with `onPressed: _isLoading ? null : _action`
**Warning signs:** Double submissions, race conditions

### Pitfall 5: Background Location Permission on Android 14+
**What goes wrong:** App crashes when trying to start foreground service for location
**Why it happens:** Missing FOREGROUND_SERVICE_LOCATION permission, wrong foregroundServiceType
**How to avoid:** Declare android:foregroundServiceType="location" in manifest, request ACCESS_BACKGROUND_LOCATION
**Warning signs:** SecurityException on session start, location updates stop in background

## Code Examples

Verified patterns from official sources and existing codebase:

### Provider Registration for AfterHoursService
```dart
// Source: Existing provider_tree.dart patterns

// Add to ProviderTree.chat() or create new ProviderTree.afterHours()
static List<SingleChildWidget> afterHours() => [
  ChangeNotifierProxyProvider2<AuthService, SocketService, AfterHoursService>(
    create: (context) => AfterHoursService(
      context.read<AuthService>(),
      context.read<SocketService>(),
    ),
    update: (context, auth, socket, previous) =>
        previous ?? AfterHoursService(auth, socket),
  ),
  ChangeNotifierProxyProvider2<AuthService, SocketService, AfterHoursChatService>(
    create: (context) => AfterHoursChatService(
      context.read<AuthService>(),
      context.read<SocketService>(),
    ),
    update: (context, auth, socket, previous) =>
        previous ?? AfterHoursChatService(auth, socket),
  ),
];
```

### Tab Bar Integration
```dart
// Source: Existing main_screen.dart pattern

// In MainScreen build, add After Hours tab to premium users
if (hasPremium) {
  screens = const [
    DiscoveryScreen(),
    AfterHoursTabScreen(), // NEW: Insert between Discovery and Matches
    MatchesScreen(),
    ChatsScreen(),
    ProfileScreen(),
  ];
  navItems = const [
    BottomNavigationBarItem(icon: Icon(Icons.explore), label: 'Discovery'),
    BottomNavigationBarItem(icon: Icon(Icons.nightlife), label: 'After Hours'), // NEW
    BottomNavigationBarItem(icon: Icon(Icons.favorite), label: 'Matches'),
    BottomNavigationBarItem(icon: Icon(Icons.chat_bubble), label: 'Chats'),
    BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
  ];
}
```

### Match Card Modal Overlay
```dart
// Source: Flutter showModalBottomSheet documentation + existing patterns

void _showMatchCard(AfterHoursMatch match) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    isDismissible: false, // Require explicit accept/decline
    builder: (context) => DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => MatchCardOverlay(
        match: match,
        onAccept: () {
          Navigator.pop(context);
          _acceptMatch(match);
        },
        onDecline: () {
          Navigator.pop(context);
          _declineMatch(match);
        },
      ),
    ),
  );
}
```

### Background Location Foreground Service
```dart
// Source: flutter_foreground_task documentation

// AndroidManifest.xml additions needed:
// <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
// <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
// <service android:name="com.pravera.flutter_foreground_task.service.ForegroundService"
//          android:foregroundServiceType="location" />

Future<void> _initForegroundTask() async {
  FlutterForegroundTask.init(
    androidNotificationOptions: AndroidNotificationOptions(
      channelId: 'after_hours_location',
      channelName: 'After Hours Location',
      channelDescription: 'Keeps location active during After Hours session',
      channelImportance: NotificationChannelImportance.LOW,
      priority: NotificationPriority.LOW,
    ),
    iosNotificationOptions: const IOSNotificationOptions(
      showNotification: true,
      playSound: false,
    ),
    foregroundTaskOptions: const ForegroundTaskOptions(
      interval: 60000, // 1 minute
      isOnceEvent: false,
      autoRunOnBoot: false,
    ),
  );
}
```

### Lifecycle-Aware State Refresh
```dart
// Source: Existing chat_screen.dart WidgetsBindingObserver pattern

class _AfterHoursSessionScreenState extends State<AfterHoursSessionScreen>
    with WidgetsBindingObserver {

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Refresh session status when app returns to foreground
      context.read<AfterHoursService>().refreshSessionStatus();
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| setState for complex flows | ChangeNotifier + Provider | 2019+ | Existing pattern in codebase |
| showDialog for match cards | showModalBottomSheet with DraggableScrollableSheet | 2020+ | Better UX, more familiar pattern |
| Timer.periodic only | Timer.periodic + DateTime comparison | Always | Prevents drift, handles background |
| Background service workarounds | flutter_foreground_task 9.x | Android 14 (2023) | Required for Android 14+ compliance |

**Deprecated/outdated:**
- `background_fetch`: Not suitable for continuous location, iOS limitations
- `workmanager`: Wrong tool for real-time location, batch oriented
- Raw isolate management: flutter_foreground_task handles this

## Open Questions

Things that couldn't be fully resolved:

1. **iOS Background Location Behavior**
   - What we know: iOS restricts background location to ~15 second updates
   - What's unclear: Whether flutter_foreground_task's iOS implementation is sufficient for After Hours
   - Recommendation: Implement push notification fallback for iOS; when location stale >30s, rely on socket events only. Test thoroughly on physical device.

2. **Match Card Auto-Decline Timer Sync**
   - What we know: Backend sends `autoDeclineAt` timestamp in match payload
   - What's unclear: Best UX for showing countdown - within card or separate?
   - Recommendation: Show countdown within match card, but also trigger local notification if app backgrounded

## Sources

### Primary (HIGH confidence)
- Existing codebase: `socket_service.dart` (lines 52-82, 242-348) - After Hours event streams
- Existing codebase: `discovery_screen.dart` (lines 448-544) - Swipe gesture implementation
- Existing codebase: `chat_screen.dart` (lines 39-213) - Real-time messaging patterns
- Existing codebase: `provider_tree.dart` - Provider registration patterns
- Existing codebase: `main_screen.dart` - Tab navigation structure
- Backend API: `backend/profile-service/src/routes/after-hours.ts` - All endpoints documented
- Backend API: `backend/chat-service/src/routes/after-hours-chat.ts` - Chat/save endpoints

### Secondary (MEDIUM confidence)
- [flutter_foreground_task pub.dev](https://pub.dev/packages/flutter_foreground_task) - Version 9.2.0, Android 14 requirements
- [Flutter State Management Docs](https://docs.flutter.dev/data-and-backend/state-mgmt/simple) - ChangeNotifier patterns
- [showModalBottomSheet API](https://api.flutter.dev/flutter/material/showModalBottomSheet.html) - Modal options

### Tertiary (LOW confidence)
- [Medium: Handling Background Services Flutter](https://medium.com/@shubhampawar99/handling-background-services-in-flutter-the-right-way-across-android-14-ios-17-b735f3b48af5) - Android 14/iOS 17 patterns
- [Flutter Gems: Tinder Swipe Cards](https://fluttergems.dev/tinder-swipe-cards/) - Package alternatives (not needed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All patterns exist in codebase
- Architecture: HIGH - Direct reuse of existing patterns
- Pitfalls: HIGH - Common Flutter patterns, well-documented
- Background location: MEDIUM - Android 14 tested, iOS needs validation

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable Flutter patterns)
