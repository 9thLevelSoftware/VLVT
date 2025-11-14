import 'package:flutter/foundation.dart';
import 'package:firebase_analytics/firebase_analytics.dart';

/// Analytics Service
///
/// Provides a centralized wrapper around Firebase Analytics for tracking
/// user events, screen views, and user properties throughout the app.
///
/// This service makes it easy to maintain consistent analytics tracking
/// and provides type-safe methods for common events.
class AnalyticsService {
  static final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;
  static FirebaseAnalyticsObserver? _observer;

  /// Get the Firebase Analytics observer for navigation tracking
  static FirebaseAnalyticsObserver getObserver() {
    _observer ??= FirebaseAnalyticsObserver(analytics: _analytics);
    return _observer!;
  }

  // ============================================================
  // AUTHENTICATION EVENTS
  // ============================================================

  /// Log when user successfully logs in
  static Future<void> logLogin(String method) async {
    try {
      await _analytics.logLogin(loginMethod: method);
      debugPrint('Analytics: Login success ($method)');
    } catch (e) {
      debugPrint('Analytics error logging login: $e');
    }
  }

  /// Log when login fails
  static Future<void> logLoginFailed(String method, String reason) async {
    try {
      await _analytics.logEvent(
        name: 'login_failed',
        parameters: {
          'method': method,
          'reason': reason,
        },
      );
      debugPrint('Analytics: Login failed ($method: $reason)');
    } catch (e) {
      debugPrint('Analytics error logging login failure: $e');
    }
  }

  /// Log when user starts signup process
  static Future<void> logSignupStarted() async {
    try {
      await _analytics.logSignUp(signUpMethod: 'started');
      debugPrint('Analytics: Signup started');
    } catch (e) {
      debugPrint('Analytics error logging signup start: $e');
    }
  }

  /// Log when user completes signup
  static Future<void> logSignupCompleted(String method) async {
    try {
      await _analytics.logSignUp(signUpMethod: method);
      debugPrint('Analytics: Signup completed ($method)');
    } catch (e) {
      debugPrint('Analytics error logging signup completion: $e');
    }
  }

  // ============================================================
  // PROFILE EVENTS
  // ============================================================

  /// Log when user creates their profile
  static Future<void> logProfileCreated() async {
    try {
      await _analytics.logEvent(name: 'profile_created');
      debugPrint('Analytics: Profile created');
    } catch (e) {
      debugPrint('Analytics error logging profile creation: $e');
    }
  }

  /// Log when user updates their profile
  static Future<void> logProfileUpdated({Map<String, Object>? fields}) async {
    try {
      await _analytics.logEvent(
        name: 'profile_updated',
        parameters: fields,
      );
      debugPrint('Analytics: Profile updated');
    } catch (e) {
      debugPrint('Analytics error logging profile update: $e');
    }
  }

  /// Log when user views their own profile
  static Future<void> logOwnProfileViewed() async {
    try {
      await _analytics.logEvent(
        name: 'profile_viewed',
        parameters: {'type': 'own'},
      );
      debugPrint('Analytics: Own profile viewed');
    } catch (e) {
      debugPrint('Analytics error logging own profile view: $e');
    }
  }

  // ============================================================
  // DISCOVERY EVENTS
  // ============================================================

  /// Log when user views another user's profile
  static Future<void> logProfileViewed(String profileId) async {
    try {
      await _analytics.logEvent(
        name: 'profile_viewed',
        parameters: {
          'type': 'other',
          'profile_id': profileId,
        },
      );
      debugPrint('Analytics: Profile viewed ($profileId)');
    } catch (e) {
      debugPrint('Analytics error logging profile view: $e');
    }
  }

  /// Log when user likes a profile
  static Future<void> logProfileLiked(String profileId) async {
    try {
      await _analytics.logEvent(
        name: 'profile_liked',
        parameters: {'profile_id': profileId},
      );
      debugPrint('Analytics: Profile liked ($profileId)');
    } catch (e) {
      debugPrint('Analytics error logging profile like: $e');
    }
  }

  /// Log when user passes on a profile
  static Future<void> logProfilePassed(String profileId) async {
    try {
      await _analytics.logEvent(
        name: 'profile_passed',
        parameters: {'profile_id': profileId},
      );
      debugPrint('Analytics: Profile passed ($profileId)');
    } catch (e) {
      debugPrint('Analytics error logging profile pass: $e');
    }
  }

  /// Log when user undoes last action
  static Future<void> logProfileUndo(String action) async {
    try {
      await _analytics.logEvent(
        name: 'profile_undo',
        parameters: {'action': action},
      );
      debugPrint('Analytics: Profile undo ($action)');
    } catch (e) {
      debugPrint('Analytics error logging profile undo: $e');
    }
  }

  /// Log when user applies discovery filters
  static Future<void> logFiltersApplied(Map<String, Object> filters) async {
    try {
      await _analytics.logEvent(
        name: 'filters_applied',
        parameters: filters,
      );
      debugPrint('Analytics: Filters applied');
    } catch (e) {
      debugPrint('Analytics error logging filters: $e');
    }
  }

  // ============================================================
  // MATCH EVENTS
  // ============================================================

  /// Log when a match is created
  static Future<void> logMatchCreated(String matchId) async {
    try {
      await _analytics.logEvent(
        name: 'match_created',
        parameters: {'match_id': matchId},
      );
      debugPrint('Analytics: Match created ($matchId)');
    } catch (e) {
      debugPrint('Analytics error logging match creation: $e');
    }
  }

  /// Log when user opens/views a match
  static Future<void> logMatchOpened(String matchId) async {
    try {
      await _analytics.logEvent(
        name: 'match_opened',
        parameters: {'match_id': matchId},
      );
      debugPrint('Analytics: Match opened ($matchId)');
    } catch (e) {
      debugPrint('Analytics error logging match open: $e');
    }
  }

  /// Log when user unmatches
  static Future<void> logUnmatch(String matchId) async {
    try {
      await _analytics.logEvent(
        name: 'unmatch',
        parameters: {'match_id': matchId},
      );
      debugPrint('Analytics: Unmatch ($matchId)');
    } catch (e) {
      debugPrint('Analytics error logging unmatch: $e');
    }
  }

  // ============================================================
  // MESSAGING EVENTS
  // ============================================================

  /// Log when user sends a message
  static Future<void> logMessageSent(String conversationId) async {
    try {
      await _analytics.logEvent(
        name: 'message_sent',
        parameters: {'conversation_id': conversationId},
      );
      debugPrint('Analytics: Message sent');
    } catch (e) {
      debugPrint('Analytics error logging message sent: $e');
    }
  }

  /// Log when user opens a conversation
  static Future<void> logConversationOpened(String conversationId) async {
    try {
      await _analytics.logEvent(
        name: 'conversation_opened',
        parameters: {'conversation_id': conversationId},
      );
      debugPrint('Analytics: Conversation opened');
    } catch (e) {
      debugPrint('Analytics error logging conversation open: $e');
    }
  }

  // ============================================================
  // SAFETY EVENTS
  // ============================================================

  /// Log when user reports another user
  static Future<void> logUserReported(String reportedUserId, String reason) async {
    try {
      await _analytics.logEvent(
        name: 'user_reported',
        parameters: {
          'reported_user_id': reportedUserId,
          'reason': reason,
        },
      );
      debugPrint('Analytics: User reported ($reason)');
    } catch (e) {
      debugPrint('Analytics error logging user report: $e');
    }
  }

  /// Log when user blocks another user
  static Future<void> logUserBlocked(String blockedUserId) async {
    try {
      await _analytics.logEvent(
        name: 'user_blocked',
        parameters: {'blocked_user_id': blockedUserId},
      );
      debugPrint('Analytics: User blocked');
    } catch (e) {
      debugPrint('Analytics error logging user block: $e');
    }
  }

  // ============================================================
  // SUBSCRIPTION EVENTS
  // ============================================================

  /// Log when user views the paywall
  static Future<void> logPaywallViewed({String? source}) async {
    try {
      await _analytics.logEvent(
        name: 'paywall_viewed',
        parameters: source != null ? {'source': source} : null,
      );
      debugPrint('Analytics: Paywall viewed${source != null ? ' from $source' : ''}');
    } catch (e) {
      debugPrint('Analytics error logging paywall view: $e');
    }
  }

  /// Log when user starts a subscription
  static Future<void> logSubscriptionStarted(String productId, double price) async {
    try {
      await _analytics.logEvent(
        name: 'subscription_started',
        parameters: {
          'product_id': productId,
          'price': price,
        },
      );
      debugPrint('Analytics: Subscription started ($productId)');
    } catch (e) {
      debugPrint('Analytics error logging subscription start: $e');
    }
  }

  /// Log when user cancels subscription
  static Future<void> logSubscriptionCancelled(String productId) async {
    try {
      await _analytics.logEvent(
        name: 'subscription_cancelled',
        parameters: {'product_id': productId},
      );
      debugPrint('Analytics: Subscription cancelled ($productId)');
    } catch (e) {
      debugPrint('Analytics error logging subscription cancel: $e');
    }
  }

  // ============================================================
  // USER PROPERTIES
  // ============================================================

  /// Set user ID for analytics
  static Future<void> setUserId(String userId) async {
    try {
      await _analytics.setUserId(id: userId);
      debugPrint('Analytics: User ID set');
    } catch (e) {
      debugPrint('Analytics error setting user ID: $e');
    }
  }

  /// Set user properties for segmentation
  static Future<void> setUserProperties({
    String? ageGroup,
    String? gender,
    bool? hasPremium,
    DateTime? signupDate,
  }) async {
    try {
      if (ageGroup != null) {
        await _analytics.setUserProperty(name: 'age_group', value: ageGroup);
      }
      if (gender != null) {
        await _analytics.setUserProperty(name: 'gender', value: gender);
      }
      if (hasPremium != null) {
        await _analytics.setUserProperty(
          name: 'has_premium',
          value: hasPremium.toString(),
        );
      }
      if (signupDate != null) {
        await _analytics.setUserProperty(
          name: 'signup_date',
          value: signupDate.toIso8601String().split('T')[0],
        );
      }
      debugPrint('Analytics: User properties set');
    } catch (e) {
      debugPrint('Analytics error setting user properties: $e');
    }
  }

  /// Calculate age group from date of birth
  static String calculateAgeGroup(DateTime dateOfBirth) {
    final now = DateTime.now();
    final age = now.year - dateOfBirth.year;

    if (age < 18) return 'under_18';
    if (age <= 24) return '18_24';
    if (age <= 34) return '25_34';
    if (age <= 44) return '35_44';
    if (age <= 54) return '45_54';
    if (age <= 64) return '55_64';
    return '65_plus';
  }

  /// Calculate age group from integer age
  static String calculateAgeGroupFromAge(int age) {
    if (age < 18) return 'under_18';
    if (age <= 24) return '18_24';
    if (age <= 34) return '25_34';
    if (age <= 44) return '35_44';
    if (age <= 54) return '45_54';
    if (age <= 64) return '55_64';
    return '65_plus';
  }

  // ============================================================
  // SCREEN TRACKING
  // ============================================================

  /// Log screen view manually (for screens not using named routes)
  static Future<void> logScreenView(String screenName) async {
    try {
      await _analytics.logScreenView(screenName: screenName);
      debugPrint('Analytics: Screen view ($screenName)');
    } catch (e) {
      debugPrint('Analytics error logging screen view: $e');
    }
  }

  // ============================================================
  // CUSTOM EVENTS
  // ============================================================

  /// Log a custom event with optional parameters
  static Future<void> logCustomEvent(
    String eventName,
    Map<String, Object>? parameters,
  ) async {
    try {
      await _analytics.logEvent(name: eventName, parameters: parameters);
      debugPrint('Analytics: Custom event ($eventName)');
    } catch (e) {
      debugPrint('Analytics error logging custom event: $e');
    }
  }
}
