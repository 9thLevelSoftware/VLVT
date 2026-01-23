/// After Hours Service
/// Central coordination service for After Hours mode
/// Manages session state machine and socket event subscriptions
library;

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'auth_service.dart';
import 'socket_service.dart';

/// After Hours session states
enum AfterHoursState {
  /// User not in session, show setup/start UI
  inactive,

  /// Checking profile/preferences, preparing session
  activating,

  /// Session active, looking for matches
  searching,

  /// Match found, showing match card
  matched,

  /// User accepted match, in ephemeral chat
  chatting,

  /// 2-minute warning before session ends
  expiring,

  /// Session ended
  expired,
}

/// Represents an After Hours match
class AfterHoursMatch {
  final String id;
  final String oduserId;
  final String name;
  final int age;
  final String? photoUrl;
  final String? bio;
  final double distance;
  final DateTime? autoDeclineAt;

  AfterHoursMatch({
    required this.id,
    required this.oduserId,
    required this.name,
    required this.age,
    this.photoUrl,
    this.bio,
    required this.distance,
    this.autoDeclineAt,
  });

  factory AfterHoursMatch.fromJson(Map<String, dynamic> json) {
    return AfterHoursMatch(
      id: json['id'] as String? ?? json['matchId'] as String,
      oduserId: json['otherUserId'] as String? ?? json['oduserId'] as String? ?? '',
      name: json['name'] as String? ?? 'Unknown',
      age: json['age'] as int? ?? 0,
      photoUrl: json['photoUrl'] as String?,
      bio: json['bio'] as String?,
      distance: (json['distance'] as num?)?.toDouble() ?? 0.0,
      autoDeclineAt: json['autoDeclineAt'] != null
          ? DateTime.parse(json['autoDeclineAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'otherUserId': oduserId,
        'name': name,
        'age': age,
        'photoUrl': photoUrl,
        'bio': bio,
        'distance': distance,
        'autoDeclineAt': autoDeclineAt?.toIso8601String(),
      };
}

/// After Hours session management service
class AfterHoursService extends ChangeNotifier {
  final AuthService _authService;
  final SocketService _socketService;

  // State properties
  AfterHoursState _state = AfterHoursState.inactive;
  String? _sessionId;
  DateTime? _expiresAt;
  AfterHoursMatch? _currentMatch;
  int _nearbyCount = 0;
  bool _partnerSaved = false;

  // Socket subscriptions
  StreamSubscription<Map<String, dynamic>>? _matchSubscription;
  StreamSubscription<dynamic>? _messageSubscription;
  StreamSubscription<Map<String, dynamic>>? _expiringSubscription;
  StreamSubscription<Map<String, dynamic>>? _expiredSubscription;
  StreamSubscription<Map<String, dynamic>>? _noMatchesSubscription;
  StreamSubscription<Map<String, dynamic>>? _matchExpiredSubscription;
  StreamSubscription<Map<String, dynamic>>? _partnerSavedSubscription;
  StreamSubscription<Map<String, dynamic>>? _matchSavedSubscription;

  // Getters
  AfterHoursState get state => _state;
  String? get sessionId => _sessionId;
  DateTime? get expiresAt => _expiresAt;
  AfterHoursMatch? get currentMatch => _currentMatch;
  int get nearbyCount => _nearbyCount;
  bool get partnerSaved => _partnerSaved;

  /// Get remaining seconds until session expires
  int get remainingSeconds {
    if (_expiresAt == null) return 0;
    final remaining = _expiresAt!.difference(DateTime.now()).inSeconds;
    return remaining > 0 ? remaining : 0;
  }

  /// Check if session is currently active
  bool get isSessionActive =>
      _state == AfterHoursState.searching ||
      _state == AfterHoursState.matched ||
      _state == AfterHoursState.chatting ||
      _state == AfterHoursState.expiring;

  AfterHoursService(this._authService, this._socketService) {
    _subscribeToEvents();
  }

  /// Update state and notify listeners
  void _setState(AfterHoursState newState) {
    if (_state != newState) {
      debugPrint('AfterHoursService: State change $_state -> $newState');
      _state = newState;
      notifyListeners();
    }
  }

  /// Subscribe to all After Hours socket events
  void _subscribeToEvents() {
    debugPrint('AfterHoursService: Subscribing to socket events');

    // Match found
    _matchSubscription = _socketService.onAfterHoursMatch.listen((data) {
      debugPrint('AfterHoursService: Match received: $data');
      try {
        _currentMatch = AfterHoursMatch.fromJson(data);
        _partnerSaved = false; // Reset for new match
        _setState(AfterHoursState.matched);
      } catch (e) {
        debugPrint('AfterHoursService: Error parsing match: $e');
      }
    });

    // Message received (for unread count tracking)
    _messageSubscription = _socketService.onAfterHoursMessage.listen((message) {
      debugPrint('AfterHoursService: Message received');
      // Message handling delegated to AfterHoursChatService
      // This subscription is for future unread count tracking
    });

    // Session expiring warning (2 minutes)
    _expiringSubscription = _socketService.onSessionExpiring.listen((data) {
      debugPrint('AfterHoursService: Session expiring warning');
      _setState(AfterHoursState.expiring);
    });

    // Session expired
    _expiredSubscription = _socketService.onSessionExpired.listen((data) {
      debugPrint('AfterHoursService: Session expired');
      resetToInactive();
    });

    // No matches available
    _noMatchesSubscription = _socketService.onNoMatches.listen((data) {
      debugPrint('AfterHoursService: No matches available');
      final count = data['nearbyCount'] as int? ?? 0;
      _nearbyCount = count;
      notifyListeners();
    });

    // Match expired (auto-decline)
    _matchExpiredSubscription = _socketService.onMatchExpired.listen((data) {
      debugPrint('AfterHoursService: Match expired (auto-decline)');
      _currentMatch = null;
      _partnerSaved = false;
      _setState(AfterHoursState.searching);
    });

    // Partner saved the match
    _partnerSavedSubscription = _socketService.onPartnerSaved.listen((data) {
      debugPrint('AfterHoursService: Partner saved match');
      _partnerSaved = true;
      notifyListeners();
    });

    // Match saved (mutual)
    _matchSavedSubscription = _socketService.onMatchSaved.listen((data) {
      debugPrint('AfterHoursService: Match saved (mutual)');
      // The match has been converted to a permanent match
      // UI should show a celebration/notification
      // Then transition back to searching or show permanent match
      notifyListeners();
    });
  }

  /// Unsubscribe from all socket events
  void _unsubscribeFromEvents() {
    debugPrint('AfterHoursService: Unsubscribing from socket events');
    _matchSubscription?.cancel();
    _messageSubscription?.cancel();
    _expiringSubscription?.cancel();
    _expiredSubscription?.cancel();
    _noMatchesSubscription?.cancel();
    _matchExpiredSubscription?.cancel();
    _partnerSavedSubscription?.cancel();
    _matchSavedSubscription?.cancel();

    _matchSubscription = null;
    _messageSubscription = null;
    _expiringSubscription = null;
    _expiredSubscription = null;
    _noMatchesSubscription = null;
    _matchExpiredSubscription = null;
    _partnerSavedSubscription = null;
    _matchSavedSubscription = null;
  }

  /// Start an After Hours session
  Future<bool> startSession({
    required int durationMinutes,
    required double lat,
    required double lng,
  }) async {
    if (isSessionActive) {
      debugPrint('AfterHoursService: Session already active');
      return false;
    }

    _setState(AfterHoursState.activating);

    try {
      final token = await _authService.getToken();
      if (token == null) {
        debugPrint('AfterHoursService: No auth token');
        _setState(AfterHoursState.inactive);
        return false;
      }

      // TODO: Call profile-service API to start session
      // POST /api/after-hours/sessions
      // Body: { durationMinutes, lat, lng }
      // Response: { sessionId, expiresAt }

      // For now, simulate session start
      debugPrint('AfterHoursService: Starting session (API call not yet implemented)');
      _sessionId = 'temp-session-id';
      _expiresAt = DateTime.now().add(Duration(minutes: durationMinutes));
      _setState(AfterHoursState.searching);

      return true;
    } catch (e) {
      debugPrint('AfterHoursService: Error starting session: $e');
      _setState(AfterHoursState.inactive);
      return false;
    }
  }

  /// End the current session early
  Future<bool> endSession() async {
    if (!isSessionActive) {
      debugPrint('AfterHoursService: No active session to end');
      return false;
    }

    try {
      final token = await _authService.getToken();
      if (token == null) {
        debugPrint('AfterHoursService: No auth token');
        return false;
      }

      // TODO: Call profile-service API to end session
      // DELETE /api/after-hours/sessions/:sessionId
      // or POST /api/after-hours/sessions/:sessionId/end

      debugPrint('AfterHoursService: Ending session (API call not yet implemented)');
      resetToInactive();
      return true;
    } catch (e) {
      debugPrint('AfterHoursService: Error ending session: $e');
      return false;
    }
  }

  /// Accept the current match and transition to chatting
  Future<bool> acceptMatch() async {
    if (_currentMatch == null) {
      debugPrint('AfterHoursService: No current match to accept');
      return false;
    }

    try {
      // TODO: Call chat-service API to accept match
      // POST /api/after-hours/matches/:matchId/accept

      // Join the chat room
      _socketService.joinAfterHoursChat(_currentMatch!.id);

      debugPrint('AfterHoursService: Accepted match ${_currentMatch!.id}');
      _setState(AfterHoursState.chatting);
      return true;
    } catch (e) {
      debugPrint('AfterHoursService: Error accepting match: $e');
      return false;
    }
  }

  /// Decline the current match and return to searching
  Future<bool> declineMatch() async {
    if (_currentMatch == null) {
      debugPrint('AfterHoursService: No current match to decline');
      return false;
    }

    try {
      final token = await _authService.getToken();
      if (token == null) {
        debugPrint('AfterHoursService: No auth token');
        return false;
      }

      // TODO: Call chat-service API to decline match
      // POST /api/after-hours/matches/:matchId/decline

      debugPrint('AfterHoursService: Declined match ${_currentMatch!.id}');
      _currentMatch = null;
      _partnerSaved = false;
      _setState(AfterHoursState.searching);
      return true;
    } catch (e) {
      debugPrint('AfterHoursService: Error declining match: $e');
      return false;
    }
  }

  /// Refresh session status from API (for app resume scenarios)
  Future<void> refreshSessionStatus() async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        debugPrint('AfterHoursService: No auth token for refresh');
        return;
      }

      // TODO: Call profile-service API to get current session status
      // GET /api/after-hours/sessions/current
      // Response: { sessionId, expiresAt, state, currentMatch? }

      debugPrint('AfterHoursService: Refreshing session status (API call not yet implemented)');

      // If we had a session but it expired while app was backgrounded,
      // reset to inactive
      if (_expiresAt != null && DateTime.now().isAfter(_expiresAt!)) {
        debugPrint('AfterHoursService: Session expired while backgrounded');
        resetToInactive();
      }
    } catch (e) {
      debugPrint('AfterHoursService: Error refreshing session: $e');
    }
  }

  /// Reset state to inactive, clear all session data
  void resetToInactive() {
    debugPrint('AfterHoursService: Resetting to inactive');

    // Leave chat room if in one
    if (_currentMatch != null) {
      _socketService.leaveAfterHoursChat(_currentMatch!.id);
    }

    _setState(AfterHoursState.inactive);
    _sessionId = null;
    _expiresAt = null;
    _currentMatch = null;
    _nearbyCount = 0;
    _partnerSaved = false;
  }

  @override
  void dispose() {
    debugPrint('AfterHoursService: Disposing');
    _unsubscribeFromEvents();
    super.dispose();
  }
}
