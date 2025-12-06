import 'dart:async';
import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';
import '../screens/reset_password_screen.dart';
import 'auth_service.dart';

class DeepLinkService {
  static AppLinks? _appLinks;
  static StreamSubscription? _sub;

  /// Pending invite code from deep link (used during signup)
  static String? pendingInviteCode;

  static Future<void> init(BuildContext context, AuthService authService) async {
    _appLinks = AppLinks();

    // Store navigator state before async gap
    final navigatorState = Navigator.of(context);

    // Handle initial link (app opened via link)
    try {
      final initialLink = await _appLinks!.getInitialLink();
      if (initialLink != null) {
        _handleDeepLink(navigatorState, authService, initialLink.toString());
      }
    } catch (e) {
      debugPrint('Error getting initial deep link: $e');
    }

    // Handle links while app is running
    _sub = _appLinks!.uriLinkStream.listen((Uri uri) {
      _handleDeepLink(navigatorState, authService, uri.toString());
    }, onError: (err) {
      debugPrint('Error handling deep link stream: $err');
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
    final uri = Uri.parse(link);

    // Handle email verification: getvlvt.vip/verify?token=xxx or vlvt://auth/verify?token=xxx
    if (uri.path.contains('verify') || uri.path == '/verify') {
      final token = uri.queryParameters['token'];
      if (token != null) {
        _handleEmailVerification(navigator, authService, token);
      }
    }

    // Handle password reset: getvlvt.vip/reset-password?token=xxx
    if (uri.path.contains('reset-password') || uri.path == '/reset-password') {
      final token = uri.queryParameters['token'];
      if (token != null) {
        navigator.push(
          MaterialPageRoute(
            builder: (context) => ResetPasswordScreen(token: token),
          ),
        );
      }
    }

    // Handle invite codes: getvlvt.vip/invite/CODE or getvlvt.vip/invite?code=CODE
    if (uri.path.contains('invite')) {
      String? code = uri.queryParameters['code'];

      // Check if code is in the path: /invite/VLVT-XXXX
      if (code == null && uri.pathSegments.length >= 2) {
        final inviteIndex = uri.pathSegments.indexOf('invite');
        if (inviteIndex >= 0 && inviteIndex + 1 < uri.pathSegments.length) {
          code = uri.pathSegments[inviteIndex + 1];
        }
      }

      if (code != null && code.isNotEmpty) {
        // Store the invite code for use during signup
        pendingInviteCode = code;
        debugPrint('Stored pending invite code: $code');

        // If user is already authenticated, show a message
        if (authService.isAuthenticated) {
          ScaffoldMessenger.of(navigator.context).showSnackBar(
            SnackBar(
              content: Text('Welcome! Invited by code: $code'),
              backgroundColor: Colors.amber,
            ),
          );
        }
      }
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
