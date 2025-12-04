import 'dart:async';
import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';
import '../screens/reset_password_screen.dart';
import 'auth_service.dart';

class DeepLinkService {
  static AppLinks? _appLinks;
  static StreamSubscription? _sub;

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
