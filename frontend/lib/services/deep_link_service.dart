import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uni_links/uni_links.dart';
import '../screens/reset_password_screen.dart';
import 'auth_service.dart';

class DeepLinkService {
  static StreamSubscription? _sub;

  static Future<void> init(BuildContext context, AuthService authService) async {
    // Handle initial link (app opened via link)
    try {
      final initialLink = await getInitialLink();
      if (initialLink != null) {
        _handleDeepLink(context, authService, initialLink);
      }
    } catch (e) {
      debugPrint('Error getting initial deep link: $e');
    }

    // Handle links while app is running
    _sub = linkStream.listen((String? link) {
      if (link != null) {
        _handleDeepLink(context, authService, link);
      }
    }, onError: (err) {
      debugPrint('Error handling deep link stream: $err');
    });
  }

  static void dispose() {
    _sub?.cancel();
  }

  static void _handleDeepLink(BuildContext context, AuthService authService, String link) {
    final uri = Uri.parse(link);

    // Handle email verification: vlvt.app/verify?token=xxx or vlvt://auth/verify?token=xxx
    if (uri.path.contains('verify') || uri.path == '/verify') {
      final token = uri.queryParameters['token'];
      if (token != null) {
        _handleEmailVerification(context, authService, token);
      }
    }

    // Handle password reset: vlvt.app/reset-password?token=xxx
    if (uri.path.contains('reset-password') || uri.path == '/reset-password') {
      final token = uri.queryParameters['token'];
      if (token != null) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => ResetPasswordScreen(token: token),
          ),
        );
      }
    }
  }

  static Future<void> _handleEmailVerification(
    BuildContext context,
    AuthService authService,
    String token
  ) async {
    // Show loading indicator
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    final success = await authService.verifyEmail(token);

    // Dismiss loading
    Navigator.of(context).pop();

    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Email verified successfully!'),
          backgroundColor: Colors.green,
        ),
      );
      // Auth state change will trigger navigation to main screen
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to verify email. The link may have expired.'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
