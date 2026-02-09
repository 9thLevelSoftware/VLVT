import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:path_provider/path_provider.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import 'analytics_service.dart';

/// Consent status data model for GDPR compliance
class ConsentStatus {
  final String purpose;
  final bool granted;
  final DateTime? grantedAt;
  final DateTime? withdrawnAt;
  final String? consentVersion;
  final bool needsRenewal;

  ConsentStatus({
    required this.purpose,
    required this.granted,
    this.grantedAt,
    this.withdrawnAt,
    this.consentVersion,
    this.needsRenewal = false,
  });

  factory ConsentStatus.fromJson(Map<String, dynamic> json) {
    return ConsentStatus(
      purpose: json['purpose'] as String,
      granted: json['granted'] as bool,
      grantedAt: json['grantedAt'] != null ? DateTime.parse(json['grantedAt']) : null,
      withdrawnAt: json['withdrawnAt'] != null ? DateTime.parse(json['withdrawnAt']) : null,
      consentVersion: json['consentVersion'] as String?,
      needsRenewal: json['needsRenewal'] as bool? ?? false,
    );
  }

  String get displayName {
    switch (purpose) {
      case 'location_discovery':
        return 'Location-Based Discovery';
      case 'marketing':
        return 'Marketing Communications';
      case 'analytics':
        return 'Analytics & Improvements';
      case 'after_hours':
        return 'After Hours Mode';
      default:
        return purpose;
    }
  }

  String get description {
    switch (purpose) {
      case 'location_discovery':
        return 'Allow VLVT to use your location to show you nearby profiles.';
      case 'marketing':
        return 'Receive promotional emails and notifications about new features.';
      case 'analytics':
        return 'Help us improve VLVT by sharing anonymous usage data.';
      case 'after_hours':
        return 'Enable After Hours mode for late-night matching. This may reveal information about your dating preferences.';
      default:
        return '';
    }
  }
}

class AuthService extends ChangeNotifier {
  final _storage = const FlutterSecureStorage();
  final _googleSignIn = GoogleSignIn.instance;
  bool _googleSignInInitialized = false;

  String? _token;
  String? _refreshToken;
  String? _userId;
  bool _isAuthenticated = false;
  bool _isRefreshing = false;

  bool get isAuthenticated => _isAuthenticated;
  String? get userId => _userId;
  String? get token => _token;

  // Base URL for backend - uses AppConfig
  // For iOS simulator: http://localhost:3001
  // For Android emulator: http://10.0.2.2:3001
  // For real device: http://YOUR_COMPUTER_IP:3001
  String get baseUrl => AppConfig.authServiceUrl;

  AuthService() {
    _loadToken();
  }
  
  Future<void> _loadToken() async {
    _token = await _storage.read(key: 'auth_token');
    _refreshToken = await _storage.read(key: 'refresh_token');
    _userId = await _storage.read(key: 'user_id');
    if (_token != null && _userId != null) {
      _isAuthenticated = true;
      notifyListeners();
    }
  }

  /// Attempt to refresh the access token using the refresh token
  /// Returns true if successful, false otherwise
  Future<bool> refreshToken() async {
    if (_refreshToken == null || _isRefreshing) {
      return false;
    }

    _isRefreshing = true;

    try {
      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/refresh')),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'refreshToken': _refreshToken}),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _token = data['accessToken'];

        // Use returned refreshToken if provided, otherwise keep existing
        // This maintains backwards compatibility with older backend versions
        final newRefreshToken = data['refreshToken'];
        if (newRefreshToken != null) {
          _refreshToken = newRefreshToken;
          await _storage.write(key: 'refresh_token', value: _refreshToken);
        }
        // If refreshToken not in response, keep existing _refreshToken

        await _storage.write(key: 'auth_token', value: _token);

        // // debugPrint('Token refresh successful');
        notifyListeners();
        return true;
      } else {
        // // debugPrint('Token refresh failed: ${response.statusCode}');
        return false;
      }
    } catch (e) {
      // // debugPrint('Token refresh error: $e');
      return false;
    } finally {
      _isRefreshing = false;
    }
  }
  
  /// Generate a cryptographically random nonce for Apple Sign-In CSRF protection
  String _generateNonce([int length = 32]) {
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(length, (_) => charset[random.nextInt(charset.length)]).join();
  }

  /// SHA-256 hash the nonce for Apple Sign-In
  String _sha256ofString(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  Future<bool> signInWithApple() async {
    try {
      // Generate a random nonce for CSRF protection
      final rawNonce = _generateNonce();
      final hashedNonce = _sha256ofString(rawNonce);

      final isAndroid = Platform.isAndroid;

      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: hashedNonce,
        webAuthenticationOptions: isAndroid
            ? WebAuthenticationOptions(
                clientId: AppConfig.appleServicesId,
                redirectUri: Uri.parse(
                  '${AppConfig.authServiceUrl}/auth/apple/callback',
                ),
              )
            : null,
      );

      // Android uses web flow (authorization code → /auth/apple/web)
      // iOS uses native flow (identity token → /auth/apple)
      final http.Response response;
      if (isAndroid) {
        response = await http.post(
          Uri.parse(AppConfig.authUrl('/auth/apple/web')),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({
            'code': credential.authorizationCode,
          }),
        );
      } else {
        response = await http.post(
          Uri.parse(AppConfig.authUrl('/auth/apple')),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({
            'identityToken': credential.identityToken,
            'nonce': rawNonce,
          }),
        );
      }

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _token = data['accessToken'] ?? data['token'];
        _refreshToken = data['refreshToken'];
        _userId = data['userId'];

        await _storage.write(key: 'auth_token', value: _token);
        if (_refreshToken != null) {
          await _storage.write(key: 'refresh_token', value: _refreshToken);
        }
        await _storage.write(key: 'user_id', value: _userId);

        _isAuthenticated = true;

        // Track successful login
        await AnalyticsService.logLogin('apple');
        await AnalyticsService.setUserId(_userId!);

        notifyListeners();
        return true;
      }

      // Track failed login
      await AnalyticsService.logLoginFailed('apple', 'backend_error_${response.statusCode}');
      return false;
    } catch (e) {
      // // debugPrint('Error signing in with Apple: $e');

      // Track failed login
      await AnalyticsService.logLoginFailed('apple', e.toString());
      return false;
    }
  }
  
  /// Initialize Google Sign-In (must be called before signInWithGoogle)
  Future<void> _ensureGoogleSignInInitialized() async {
    if (_googleSignInInitialized) return;

    try {
      await _googleSignIn.initialize(
        clientId: AppConfig.googleClientId,
        serverClientId: AppConfig.googleServerClientId,
      );
      _googleSignInInitialized = true;
    } catch (e) {
      // // debugPrint('Error initializing Google Sign-In: $e');
      rethrow;
    }
  }

  Future<bool> signInWithGoogle() async {
    try {
      // Validate Google Client ID is configured in production
      if (!kDebugMode && !AppConfig.isGoogleClientIdConfigured) {
        // // debugPrint('ERROR: Google Client ID is not configured for production!');
        // // debugPrint('Please set GOOGLE_CLIENT_ID environment variable.');
        await AnalyticsService.logLoginFailed('google', 'missing_client_id');
        return false;
      }

      // Initialize Google Sign-In if not already done
      await _ensureGoogleSignInInitialized();

      // Use the new v7 API - authenticate and get account via event stream
      final completer = Completer<GoogleSignInAccount?>();
      StreamSubscription<GoogleSignInAuthenticationEvent>? subscription;

      subscription = _googleSignIn.authenticationEvents.listen(
        (event) {
          subscription?.cancel();
          // Extract account from the authentication event
          final GoogleSignInAccount? account = switch (event) {
            GoogleSignInAuthenticationEventSignIn() => event.user,
            GoogleSignInAuthenticationEventSignOut() => null,
          };
          completer.complete(account);
        },
        onError: (error) {
          subscription?.cancel();
          completer.completeError(error);
        },
      );

      // Check if authentication is supported
      if (_googleSignIn.supportsAuthenticate()) {
        await _googleSignIn.authenticate();
      } else {
        // Fallback for platforms without authentication support
        await _googleSignIn.attemptLightweightAuthentication();
      }

      final account = await completer.future.timeout(
        const Duration(seconds: 60),
        onTimeout: () => null,
      );

      if (account == null) {
        await AnalyticsService.logLoginFailed('google', 'user_cancelled');
        return false;
      }

      // Get the ID token from the authenticated account's authentication property
      final auth = account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        await AnalyticsService.logLoginFailed('google', 'no_id_token');
        return false;
      }

      // Send to backend
      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/google')),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'idToken': idToken,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _token = data['accessToken'] ?? data['token'];
        _refreshToken = data['refreshToken'];
        _userId = data['userId'];

        await _storage.write(key: 'auth_token', value: _token);
        if (_refreshToken != null) {
          await _storage.write(key: 'refresh_token', value: _refreshToken);
        }
        await _storage.write(key: 'user_id', value: _userId);

        _isAuthenticated = true;

        // Track successful login
        await AnalyticsService.logLogin('google');
        await AnalyticsService.setUserId(_userId!);

        notifyListeners();
        return true;
      }

      // Track failed login
      await AnalyticsService.logLoginFailed('google', 'backend_error_${response.statusCode}');
      return false;
    } catch (e) {
      // // debugPrint('Error signing in with Google: $e');

      // Track failed login
      await AnalyticsService.logLoginFailed('google', e.toString());
      return false;
    }
  }

  /// Register with email and password
  Future<Map<String, dynamic>> registerWithEmail(String email, String password, {String? inviteCode}) async {
    try {
      final body = {
        'email': email,
        'password': password,
      };
      if (inviteCode != null && inviteCode.isNotEmpty) {
        body['inviteCode'] = inviteCode;
      }

      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/email/register')),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200) {
        await AnalyticsService.logSignupCompleted('email');
        return {'success': true, 'message': data['message']};
      }

      return {
        'success': false,
        'error': data['error'] ?? 'Registration failed',
        'details': data['details'],
      };
    } catch (e) {
      // // debugPrint('Error registering with email: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Sign in with email and password
  Future<Map<String, dynamic>> signInWithEmail(String email, String password) async {
    try {
      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/email/login')),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'email': email,
          'password': password,
        }),
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200) {
        _token = data['accessToken'] ?? data['token'];
        _refreshToken = data['refreshToken'];
        _userId = data['userId'];

        await _storage.write(key: 'auth_token', value: _token);
        if (_refreshToken != null) {
          await _storage.write(key: 'refresh_token', value: _refreshToken);
        }
        await _storage.write(key: 'user_id', value: _userId);

        _isAuthenticated = true;

        await AnalyticsService.logLogin('email');
        await AnalyticsService.setUserId(_userId!);

        notifyListeners();
        return {'success': true};
      }

      if (data['code'] == 'EMAIL_NOT_VERIFIED') {
        return {'success': false, 'error': data['error'], 'code': 'EMAIL_NOT_VERIFIED'};
      }

      await AnalyticsService.logLoginFailed('email', 'backend_error_${response.statusCode}');
      return {'success': false, 'error': data['error'] ?? 'Login failed'};
    } catch (e) {
      // // debugPrint('Error signing in with email: $e');
      await AnalyticsService.logLoginFailed('email', e.toString());
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Request password reset email
  Future<bool> forgotPassword(String email) async {
    try {
      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/email/forgot')),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'email': email}),
      );

      return response.statusCode == 200;
    } catch (e) {
      // // debugPrint('Error requesting password reset: $e');
      return false;
    }
  }

  /// Reset password with token
  Future<Map<String, dynamic>> resetPassword(String token, String newPassword) async {
    try {
      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/email/reset')),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'token': token,
          'newPassword': newPassword,
        }),
      );

      final data = json.decode(response.body);
      return {
        'success': response.statusCode == 200,
        'message': data['message'] ?? data['error'],
        'details': data['details'],
      };
    } catch (e) {
      // // debugPrint('Error resetting password: $e');
      return {'success': false, 'message': e.toString()};
    }
  }

  /// Resend verification email
  Future<bool> resendVerificationEmail(String email) async {
    try {
      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/email/resend-verification')),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'email': email}),
      );

      return response.statusCode == 200;
    } catch (e) {
      // // debugPrint('Error resending verification: $e');
      return false;
    }
  }

  /// Verify email with token (called from deep link)
  Future<bool> verifyEmail(String token) async {
    try {
      final response = await http.get(
        Uri.parse(AppConfig.authUrl('/auth/email/verify?token=$token')),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _token = data['accessToken'] ?? data['token'];
        _refreshToken = data['refreshToken'];
        _userId = data['userId'];

        await _storage.write(key: 'auth_token', value: _token);
        if (_refreshToken != null) {
          await _storage.write(key: 'refresh_token', value: _refreshToken);
        }
        await _storage.write(key: 'user_id', value: _userId);

        _isAuthenticated = true;
        notifyListeners();
        return true;
      }

      return false;
    } catch (e) {
      // // debugPrint('Error verifying email: $e');
      return false;
    }
  }

  Future<void> signOut() async {
    // Revoke refresh token on server (fire-and-forget, don't block logout)
    if (_refreshToken != null) {
      try {
        // ignore: unawaited_futures
        http.post(
          Uri.parse(AppConfig.authUrl('/auth/logout')),
          headers: {'Content-Type': 'application/json'},
          body: json.encode({'refreshToken': _refreshToken}),
        ).timeout(const Duration(seconds: 5)).ignore();
      } catch (e) {
        // // debugPrint('Failed to revoke refresh token: $e');
        // Continue with logout anyway
      }
    }

    await _storage.delete(key: 'auth_token');
    await _storage.delete(key: 'refresh_token');
    await _storage.delete(key: 'user_id');

    try {
      await _googleSignIn.disconnect();
    } catch (e) {
      // // debugPrint('Google Sign-In disconnect failed: $e');
      // Continue with logout anyway
    }

    _token = null;
    _refreshToken = null;
    _userId = null;
    _isAuthenticated = false;
    notifyListeners();
  }

  /// Delete the user's account and all associated data permanently
  /// Returns true if deletion was successful, false otherwise
  Future<bool> deleteAccount() async {
    if (_token == null) {
      // // debugPrint('Cannot delete account: not authenticated');
      return false;
    }

    try {
      final response = await http.delete(
        Uri.parse(AppConfig.authUrl('/auth/account')),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) {
        // Clear local auth state
        await _storage.delete(key: 'auth_token');
        await _storage.delete(key: 'user_id');

        try {
          await _googleSignIn.disconnect();
        } catch (e) {
          // Ignore Google sign-out errors during account deletion
          // // debugPrint('Google disconnect error (ignored): $e');
        }

        _token = null;
        _userId = null;
        _isAuthenticated = false;
        notifyListeners();

        return true;
      }

      json.decode(response.body); // Parse to validate response format
      return false;
    } catch (e) {
      // // debugPrint('Error deleting account: $e');
      return false;
    }
  }

  /// Set auth data directly (used for manual dev/test auth)
  /// This bypasses OAuth and sets authentication state manually
  Future<void> setAuthData({required String token, required String userId}) async {
    _token = token;
    _userId = userId;

    await _storage.write(key: 'auth_token', value: token);
    await _storage.write(key: 'user_id', value: userId);

    _isAuthenticated = true;
    notifyListeners();
  }

  /// Backwards-compatible helper to get the current JWT token.
  /// Falls back to secure storage if the in-memory token is null.
  Future<String?> getToken() async {
    if (_token != null) return _token;
    _token = await _storage.read(key: 'auth_token');
    return _token;
  }

  /// Backwards-compatible helper used by services that only need to know
  /// whether a user is currently logged in.
  /// Returns a minimal user map containing the userId, or null if not logged in.
  Future<Map<String, dynamic>?> getCurrentUser() async {
    var currentUserId = _userId;
    currentUserId ??= await _storage.read(key: 'user_id');
    return {'userId': currentUserId};
  }

  // ========== KYCAID ID Verification Methods ==========

  /// Start ID verification process - returns verification credentials for the SDK/WebView
  Future<Map<String, dynamic>> startIdVerification() async {
    if (_token == null) {
      return {'success': false, 'error': 'Not authenticated'};
    }

    try {
      final response = await http.post(
        Uri.parse(AppConfig.authUrl('/auth/kycaid/start')),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200) {
        if (data['alreadyVerified'] == true) {
          return {
            'success': true,
            'alreadyVerified': true,
            'message': data['message'],
          };
        }

        return {
          'success': true,
          'formUrl': data['formUrl'],
          'applicantId': data['applicantId'],
        };
      }

      debugPrint('KYCAID start failed (${response.statusCode}): ${response.body}');
      return {'success': false, 'error': data['error'] ?? 'Failed to start verification'};
    } catch (e) {
      debugPrint('KYCAID start error: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Check ID verification status
  Future<Map<String, dynamic>> getIdVerificationStatus() async {
    if (_token == null) {
      return {'success': false, 'error': 'Not authenticated'};
    }

    try {
      final response = await http.get(
        Uri.parse(AppConfig.authUrl('/auth/kycaid/status')),
        headers: {
          'Authorization': 'Bearer $_token',
        },
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200) {
        return {
          'success': true,
          'verified': data['verified'] ?? false,
          'verifiedAt': data['verifiedAt'],
          'status': data['status'],
          'verificationStatus': data['verificationStatus'],
          'checks': data['checks'],
          'message': data['message'],
        };
      }

      debugPrint('KYCAID status failed (${response.statusCode}): ${response.body}');
      return {'success': false, 'error': data['error'] ?? 'Failed to check status'};
    } catch (e) {
      debugPrint('KYCAID status error: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Refresh ID verification status from KYCAID (polls the provider directly)
  Future<Map<String, dynamic>> refreshIdVerificationStatus() async {
    if (_token == null) {
      return {'success': false, 'error': 'Not authenticated'};
    }

    try {
      final response = await http.get(
        Uri.parse(AppConfig.authUrl('/auth/kycaid/refresh')),
        headers: {
          'Authorization': 'Bearer $_token',
        },
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200) {
        return {
          'success': true,
          'status': data['status'],
          'verificationStatus': data['verificationStatus'],
        };
      }

      return {'success': false, 'error': data['error'] ?? 'Failed to refresh status'};
    } catch (e) {
      // // debugPrint('Error refreshing ID verification status: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Get the KYCAID verification URL for WebView
  /// This is the URL where users complete their ID verification
  String getKycaidVerificationUrl(String verificationId) {
    // KYCAID uses their hosted verification page
    return 'https://app.kycaid.com/verification/$verificationId';
  }

  // ========== GDPR Consent Management Methods ==========

  /// Get all consent statuses for current user
  Future<List<ConsentStatus>> getConsents() async {
    if (_token == null) return [];

    try {
      final response = await http.get(
        Uri.parse('${AppConfig.authServiceUrl}/auth/consents'),
        headers: {'Authorization': 'Bearer $_token'},
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> consents = data['consents'];
        return consents.map((c) => ConsentStatus.fromJson(c)).toList();
      }
      // // debugPrint('Failed to fetch consents: ${response.statusCode}');
      return [];
    } catch (e) {
      // // debugPrint('Error fetching consents: $e');
      return [];
    }
  }

  /// Grant consent for a specific purpose
  Future<bool> grantConsent(String purpose) async {
    if (_token == null) return false;

    try {
      final response = await http.post(
        Uri.parse('${AppConfig.authServiceUrl}/auth/consents'),
        headers: {
          'Authorization': 'Bearer $_token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'purpose': purpose}),
      );

      return response.statusCode == 200;
    } catch (e) {
      // // debugPrint('Error granting consent: $e');
      return false;
    }
  }

  /// Withdraw consent for a specific purpose
  Future<bool> withdrawConsent(String purpose) async {
    if (_token == null) return false;

    try {
      final response = await http.delete(
        Uri.parse('${AppConfig.authServiceUrl}/auth/consents/$purpose'),
        headers: {'Authorization': 'Bearer $_token'},
      );

      return response.statusCode == 200;
    } catch (e) {
      // // debugPrint('Error withdrawing consent: $e');
      return false;
    }
  }

  // ========== GDPR Data Export Methods ==========

  /// Request data export (GDPR Article 15)
  /// Returns the file path if successful, null if failed
  Future<String?> requestDataExport() async {
    if (_token == null) return null;

    try {
      final response = await http.get(
        Uri.parse('${AppConfig.authServiceUrl}/auth/data-export'),
        headers: {'Authorization': 'Bearer $_token'},
      );

      if (response.statusCode == 200) {
        // Save to documents directory
        final directory = await getApplicationDocumentsDirectory();
        final fileName = 'vlvt-data-export-${DateTime.now().toIso8601String().split('T')[0]}.json';
        final file = File('${directory.path}/$fileName');
        await file.writeAsString(response.body);

        // // debugPrint('Data export saved to: ${file.path}');
        return file.path;
      } else if (response.statusCode == 429) {
        // // debugPrint('Export rate limited');
        return null; // Rate limited
      } else {
        // // debugPrint('Export failed: ${response.statusCode}');
        return null;
      }
    } catch (e) {
      // // debugPrint('Error requesting data export: $e');
      return null;
    }
  }
}
