import 'dart:io';
import 'package:flutter/foundation.dart';

/// Application configuration
class AppConfig {
  /// Google Sign-In Client ID
  /// Get this from Firebase Console > Authentication > Sign-in method > Google
  /// IMPORTANT: This is required for Google Sign-In to work in production
  static const String googleClientId = String.fromEnvironment(
    'GOOGLE_CLIENT_ID',
    defaultValue: '', // Empty in development, must be set in production
  );

  /// Validate that Google Client ID is configured (required in production)
  static bool get isGoogleClientIdConfigured {
    return googleClientId.isNotEmpty;
  }

  /// RevenueCat API key
  /// Get your key from: https://app.revenuecat.com/
  ///
  /// TODO: Configure separate API keys for iOS and Android
  /// - iOS: Get from App Store Connect integration
  /// - Android: Get from Google Play Console integration
  /// - Both platforms need separate keys from RevenueCat dashboard
  static const String revenueCatApiKey = String.fromEnvironment(
    'REVENUECAT_API_KEY',
    defaultValue: 'YOUR_REVENUECAT_API_KEY', // Replace with actual key
  );

  /// Backend service URLs
  ///
  /// IMPORTANT: For production deployment:
  /// 1. Deploy services to Railway: `railway up`
  /// 2. Link project: `railway link`
  /// 3. Get service URLs from Railway dashboard:
  ///    - Go to project settings
  ///    - Select each service
  ///    - Copy the domain (e.g., auth-service-production-abc123.up.railway.app)
  /// 4. Replace the placeholder URLs below with your actual Railway URLs
  ///
  /// For local development, the app automatically uses localhost URLs when
  /// running in debug mode (see getters below).

  // Production URLs - Railway deployment (configured 2025-11-13)
  static const String _prodAuthServiceUrl = 'https://nobsdatingauth.up.railway.app';
  static const String _prodProfileServiceUrl = 'https://nobsdatingprofiles.up.railway.app';
  static const String _prodChatServiceUrl = 'https://nobsdatingchat.up.railway.app';

  /// Auth Service URL with local development fallback
  static String get authServiceUrl {
    // TEMPORARY: Always use Railway for testing on real devices
    return _prodAuthServiceUrl;

    // Uncomment below for local development:
    // if (kDebugMode) {
    //   return Platform.isAndroid
    //     ? 'http://10.0.2.2:3001'
    //     : 'http://localhost:3001';
    // }
    // return _prodAuthServiceUrl;
  }

  /// Profile Service URL with local development fallback
  static String get profileServiceUrl {
    // TEMPORARY: Always use Railway for testing on real devices
    return _prodProfileServiceUrl;

    // Uncomment below for local development:
    // if (kDebugMode) {
    //   return Platform.isAndroid
    //     ? 'http://10.0.2.2:3002'
    //     : 'http://localhost:3002';
    // }
    // return _prodProfileServiceUrl;
  }

  /// Chat Service URL with local development fallback
  static String get chatServiceUrl {
    // TEMPORARY: Always use Railway for testing on real devices
    return _prodChatServiceUrl;

    // Uncomment below for local development:
    // if (kDebugMode) {
    //   return Platform.isAndroid
    //     ? 'http://10.0.2.2:3003'
    //     : 'http://localhost:3003';
    // }
    // return _prodChatServiceUrl;
  }
}
