/// Application configuration
class AppConfig {
  /// RevenueCat API key
  /// Get your key from: https://app.revenuecat.com/
  /// Note: Use different keys for iOS and Android
  static const String revenueCatApiKey = String.fromEnvironment(
    'REVENUECAT_API_KEY',
    defaultValue: 'YOUR_REVENUECAT_API_KEY', // Replace with actual key
  );
  
  /// Backend service URLs
  static const String authServiceUrl =
      'https://auth-service-production-XXXX.up.railway.app';
  static const String profileServiceUrl =
      'https://profile-service-production-XXXX.up.railway.app';
  static const String chatServiceUrl =
      'https://chat-service-production-XXXX.up.railway.app';
}
