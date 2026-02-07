import 'dart:async';
import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';
import '../screens/reset_password_screen.dart';
import '../screens/main_screen.dart';
import '../screens/chat_screen.dart';
import 'auth_service.dart';
import 'deep_link_validator.dart';

class DeepLinkService {
  static AppLinks? _appLinks;
  static StreamSubscription? _sub;

  /// Pending invite code from deep link (used during signup)
  static String? pendingInviteCode;

  /// Counter for rejected links (for monitoring)
  static int _rejectedLinkCount = 0;

  /// Get the count of rejected links for monitoring
  static int get rejectedLinkCount => _rejectedLinkCount;

  /// Reset the rejected link counter
  static void resetRejectedLinkCount() {
    _rejectedLinkCount = 0;
  }

  static Future<void> init(BuildContext context, AuthService authService) async {
    _appLinks = AppLinks();

    // Store navigator state before async gap
    final navigatorState = Navigator.of(context);

    // Set up security monitoring callback
    DeepLinkValidator.onLinkRejected = (link, reason) {
      _rejectedLinkCount++;
      // debugPrint('[DeepLinkService] Security: Rejected malicious link. Total rejected: $_rejectedLinkCount');
      // In production, this could send to analytics/security monitoring
    };

    // Handle initial link (app opened via link)
    try {
      final initialLink = await _appLinks!.getInitialLink();
      if (initialLink != null) {
        _handleDeepLink(navigatorState, authService, initialLink.toString());
      }
    } catch (e) {
      // debugPrint('Error getting initial deep link: $e');
    }

    // Handle links while app is running
    _sub = _appLinks!.uriLinkStream.listen((Uri uri) {
      _handleDeepLink(navigatorState, authService, uri.toString());
    }, onError: (err) {
      // debugPrint('Error handling deep link stream: $err');
    });
  }

  static void dispose() {
    _sub?.cancel();
  }

  /// Clear the pending invite code after it's been used
  static void clearPendingInviteCode() {
    pendingInviteCode = null;
  }

  static void _handleDeepLink(NavigatorState navigator, AuthService authService, String link) {
    // Validate the deep link before processing
    final validationResult = DeepLinkValidator.validate(link);

    if (!validationResult.isValid) {
      // debugPrint('[DeepLinkService] Rejected invalid deep link: ${validationResult.error}');
      // Show a user-friendly error for rejected links
      if (navigator.mounted) {
        ScaffoldMessenger.of(navigator.context).showSnackBar(
          const SnackBar(
            content: Text('Invalid link. Please try again.'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    // Use validated and sanitized parameters
    final sanitizedParams = validationResult.sanitizedParameters ?? {};

    switch (validationResult.type) {
      case DeepLinkType.emailVerification:
        final token = sanitizedParams['token'];
        if (token != null) {
          _handleEmailVerification(navigator, authService, token);
        }
        break;

      case DeepLinkType.passwordReset:
        final token = sanitizedParams['token'];
        if (token != null) {
          navigator.push(
            MaterialPageRoute(
              builder: (context) => ResetPasswordScreen(token: token),
            ),
          );
        }
        break;

      case DeepLinkType.viewMatch:
        final matchId = sanitizedParams['id'];
        if (matchId != null && navigator.mounted) {
          // Check authentication before navigating
          if (!authService.isAuthenticated) {
            ScaffoldMessenger.of(navigator.context).showSnackBar(
              const SnackBar(
                content: Text('Please log in to view this content.'),
                backgroundColor: Colors.orange,
              ),
            );
            return;
          }
          // debugPrint('Deep link to match: $matchId');
          // Currently navigates to Matches tab. The matchId is extracted but not
          // used to scroll to the specific match - this could be a future enhancement
          // to highlight or scroll to the specific match in the list.
          navigator.push(
            MaterialPageRoute(
              builder: (context) => const MainScreen(initialTab: 1),
            ),
          );
        }
        break;

      case DeepLinkType.openChat:
        final chatId = sanitizedParams['id'];
        if (chatId != null && navigator.mounted) {
          // Check authentication before navigating
          if (!authService.isAuthenticated) {
            ScaffoldMessenger.of(navigator.context).showSnackBar(
              const SnackBar(
                content: Text('Please log in to view this content.'),
                backgroundColor: Colors.orange,
              ),
            );
            return;
          }
          // debugPrint('Deep link to chat: $chatId');
          navigator.push(
            MaterialPageRoute(
              builder: (context) => ChatScreen(matchId: chatId),
            ),
          );
        }
        break;

      case DeepLinkType.invite:
        final code = sanitizedParams['code'];
        if (code != null && code.isNotEmpty) {
          // Store the invite code for use during signup
          pendingInviteCode = code;
          // debugPrint('Stored pending invite code: $code');

          // If user is already authenticated, show a message
          if (authService.isAuthenticated && navigator.mounted) {
            ScaffoldMessenger.of(navigator.context).showSnackBar(
              SnackBar(
                content: Text('Welcome! Invited by code: $code'),
                backgroundColor: Colors.amber,
              ),
            );
          }
        }
        break;

      case null:
        // This shouldn't happen since we check isValid above
        // debugPrint('[DeepLinkService] Warning: Valid link but no type detected');
        break;
    }
  }

  static Future<void> _handleEmailVerification(
    NavigatorState navigator,
    AuthService authService,
    String token
  ) async {
    // Store references before async gap
    final scaffoldMessenger = ScaffoldMessenger.of(navigator.context);

    // Show loading indicator
    showDialog(
      context: navigator.context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    final success = await authService.verifyEmail(token);

    // Dismiss loading - check if navigator is still mounted
    if (navigator.mounted) {
      navigator.pop();

      if (success) {
        scaffoldMessenger.showSnackBar(
          const SnackBar(
            content: Text('Email verified successfully!'),
            backgroundColor: Colors.green,
          ),
        );
        // Auth state change will trigger navigation to main screen
      } else {
        scaffoldMessenger.showSnackBar(
          const SnackBar(
            content: Text('Failed to verify email. The link may have expired.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
