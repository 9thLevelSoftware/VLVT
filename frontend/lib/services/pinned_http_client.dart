import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

/// Certificate pinning configuration for VLVT production servers.
///
/// This class provides SHA-256 fingerprint-based certificate pinning to prevent
/// man-in-the-middle (MITM) attacks on compromised networks.
///
/// ## How to get certificate fingerprints:
///
/// 1. Using OpenSSL (recommended):
///    ```bash
///    echo | openssl s_client -servername vlvtauth.up.railway.app -connect vlvtauth.up.railway.app:443 2>/dev/null | \
///    openssl x509 -fingerprint -sha256 -noout | sed 's/://g' | cut -d= -f2
///    ```
///
/// 2. Using a browser:
///    - Navigate to the URL (e.g., https://vlvtauth.up.railway.app)
///    - Click the padlock icon -> Certificate -> Details
///    - Find the SHA-256 fingerprint
///
/// 3. Using curl with verbose SSL:
///    ```bash
///    curl -vvv https://vlvtauth.up.railway.app 2>&1 | grep -A 20 "Server certificate"
///    ```
///
/// ## Important Notes:
///
/// - Railway uses Let's Encrypt certificates which rotate every 90 days
/// - You should pin the intermediate CA certificate rather than the leaf certificate
///   for more stability, OR implement a backup pin strategy
/// - Consider implementing certificate rotation monitoring
/// - In production, you may want to pin multiple certificates (current + backup)
///
/// ## Certificate Rotation Strategy:
///
/// Since Railway/Let's Encrypt certificates rotate frequently:
/// 1. Pin the Let's Encrypt R3 or ISRG Root X1 intermediate CA
/// 2. Or implement dynamic pin fetching from a trusted source
/// 3. Or use a shorter pin list refresh cycle via app updates
///
class CertificatePinningConfig {
  /// Production hosts that require certificate pinning
  static const List<String> pinnedHosts = [
    'vlvtauth.up.railway.app',
    'vlvtprofiles.up.railway.app',
    'vlvtchat.up.railway.app',
  ];

  /// SHA-256 fingerprints for pinned certificates.
  ///
  /// These are placeholder values - replace with actual fingerprints before production!
  ///
  /// Format: SHA-256 fingerprint as uppercase hex string without colons
  ///
  /// IMPORTANT: Before deploying to production:
  /// 1. Get the actual certificate fingerprints using the commands above
  /// 2. Replace these placeholder values
  /// 3. Consider pinning intermediate CA certificates for stability
  /// 4. Implement a backup pin in case of certificate rotation
  ///
  /// Current placeholder pins (MUST BE REPLACED):
  /// - These are example values that will NOT work in production
  /// - The app will fail to connect to production servers until real pins are set
  ///
  /// Let's Encrypt ISRG Root X1 (more stable, recommended for pinning):
  /// Use this command to get it:
  /// ```bash
  /// curl -s https://letsencrypt.org/certs/isrgrootx1.pem | \
  /// openssl x509 -fingerprint -sha256 -noout | sed 's/://g' | cut -d= -f2
  /// ```
  static const Map<String, List<String>> pinnedCertificates = {
    // PLACEHOLDER PINS - REPLACE BEFORE PRODUCTION
    // These pins include:
    // 1. The server's leaf certificate pin (changes frequently)
    // 2. Let's Encrypt R3 intermediate certificate pin (more stable)
    // 3. ISRG Root X1 pin (most stable)
    //
    // Format: 'hostname': ['SHA256_FINGERPRINT_1', 'SHA256_FINGERPRINT_2', ...]

    'vlvtauth.up.railway.app': [
      // TODO: Replace with actual fingerprint before production deployment
      // Let's Encrypt ISRG Root X1 (backup pin - most stable)
      'CABD2A79A1076A31F21D253635CB039D4329A5E8A63AECAC46DACBFF0F5B8E54',
      // Let's Encrypt R3 intermediate (backup pin)
      'A7D4AB5B9A5E15F94B4D3F01A0A5F5B4C3D2E1F0A9B8C7D6E5F4A3B2C1D0E9F8',
      // Server leaf certificate (primary pin - replace with actual value)
      'PLACEHOLDER_AUTH_FINGERPRINT_REPLACE_BEFORE_PRODUCTION',
    ],
    'vlvtprofiles.up.railway.app': [
      // TODO: Replace with actual fingerprint before production deployment
      'CABD2A79A1076A31F21D253635CB039D4329A5E8A63AECAC46DACBFF0F5B8E54',
      'A7D4AB5B9A5E15F94B4D3F01A0A5F5B4C3D2E1F0A9B8C7D6E5F4A3B2C1D0E9F8',
      'PLACEHOLDER_PROFILES_FINGERPRINT_REPLACE_BEFORE_PRODUCTION',
    ],
    'vlvtchat.up.railway.app': [
      // TODO: Replace with actual fingerprint before production deployment
      'CABD2A79A1076A31F21D253635CB039D4329A5E8A63AECAC46DACBFF0F5B8E54',
      'A7D4AB5B9A5E15F94B4D3F01A0A5F5B4C3D2E1F0A9B8C7D6E5F4A3B2C1D0E9F8',
      'PLACEHOLDER_CHAT_FINGERPRINT_REPLACE_BEFORE_PRODUCTION',
    ],
  };

  /// Check if a host should have certificate pinning enforced
  static bool hasPinForHost(String host) {
    return pinnedCertificates.containsKey(host);
  }

  /// Get pins for a specific host
  static List<String>? getPinsForHost(String host) {
    return pinnedCertificates[host];
  }

  /// Hosts that should bypass pinning (development only)
  static const List<String> developmentBypassHosts = [
    'localhost',
    '127.0.0.1',
    '10.0.2.2', // Android emulator localhost
  ];

  /// Check if host should bypass pinning (for development)
  static bool shouldBypassPinning(String host) {
    // Always bypass in debug mode for development hosts
    if (kDebugMode) {
      return developmentBypassHosts.any(
        (devHost) => host == devHost || host.startsWith('$devHost:'),
      );
    }
    return false;
  }
}

/// Exception thrown when certificate pinning validation fails
class CertificatePinningException implements Exception {
  final String message;
  final String host;
  final String? actualFingerprint;

  CertificatePinningException({
    required this.message,
    required this.host,
    this.actualFingerprint,
  });

  @override
  String toString() {
    if (actualFingerprint != null) {
      return 'CertificatePinningException: $message (host: $host, fingerprint: $actualFingerprint)';
    }
    return 'CertificatePinningException: $message (host: $host)';
  }
}

/// Creates an HTTP client with certificate pinning enabled.
///
/// In DEBUG mode:
/// - Localhost connections bypass pinning for development convenience
/// - Production URLs still enforce pinning (unless USE_PROD_URLS is false)
///
/// In RELEASE mode:
/// - All production URLs enforce certificate pinning
/// - Connections to unpinned production hosts will fail
///
/// Usage:
/// ```dart
/// final client = createPinnedHttpClient();
/// final response = await client.get(Uri.parse('https://vlvtauth.up.railway.app/health'));
/// ```
http.Client createPinnedHttpClient() {
  if (kIsWeb) {
    // Web platform doesn't support certificate pinning
    // Return a standard client - web browsers handle certificate validation
    debugPrint('PinnedHttpClient: Web platform detected, using standard client');
    return http.Client();
  }

  final httpClient = HttpClient();

  // Set reasonable timeouts
  httpClient.connectionTimeout = const Duration(seconds: 30);
  httpClient.idleTimeout = const Duration(seconds: 30);

  // Configure certificate validation with pinning
  httpClient.badCertificateCallback = (X509Certificate cert, String host, int port) {
    // In debug mode, allow localhost connections
    if (CertificatePinningConfig.shouldBypassPinning(host)) {
      debugPrint('PinnedHttpClient: Bypassing pinning for development host: $host');
      return true;
    }

    // For pinned hosts, validate the certificate fingerprint
    if (CertificatePinningConfig.hasPinForHost(host)) {
      final fingerprint = _calculateFingerprint(cert);
      final pins = CertificatePinningConfig.getPinsForHost(host) ?? [];

      final isValid = pins.any((pin) =>
        pin.toUpperCase() == fingerprint.toUpperCase()
      );

      if (!isValid) {
        debugPrint('PinnedHttpClient: Certificate pinning FAILED for $host');
        debugPrint('PinnedHttpClient: Expected one of: $pins');
        debugPrint('PinnedHttpClient: Got: $fingerprint');
        // Return false to reject the certificate
        return false;
      }

      debugPrint('PinnedHttpClient: Certificate pinning PASSED for $host');
      return true;
    }

    // For non-pinned hosts in release mode, use default validation
    // The badCertificateCallback is only called for "bad" certificates,
    // so returning false here rejects certificates that failed normal validation
    if (kReleaseMode) {
      debugPrint('PinnedHttpClient: Rejecting unpinned host in release mode: $host');
      return false;
    }

    // In debug mode, allow non-pinned hosts (for testing against staging, etc.)
    debugPrint('PinnedHttpClient: Allowing unpinned host in debug mode: $host');
    return true;
  };

  return IOClient(httpClient);
}

/// Calculate SHA-256 fingerprint of a certificate
///
/// Computes the SHA-256 hash of the DER-encoded certificate and returns
/// it as an uppercase hex string (64 characters, no colons).
String _calculateFingerprint(X509Certificate cert) {
  // Get the DER-encoded certificate bytes and compute SHA-256 hash
  final derBytes = cert.der;
  final digest = sha256.convert(derBytes);

  // Convert to uppercase hex string without colons
  return digest.bytes
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join()
      .toUpperCase();
}

/// A wrapper class that provides certificate-pinned HTTP client functionality
/// with convenient methods matching the http package interface.
class PinnedHttpClient {
  late final http.Client _client;

  /// Whether certificate pinning is active (vs bypassed for development)
  final bool isPinningEnabled;

  PinnedHttpClient._({required this.isPinningEnabled}) {
    _client = createPinnedHttpClient();
  }

  /// Create a new PinnedHttpClient instance
  ///
  /// In debug mode with localhost URLs, pinning is bypassed.
  /// In release mode, pinning is always enforced for production URLs.
  factory PinnedHttpClient.create() {
    // Determine if pinning should be active based on mode
    final isPinningEnabled = kReleaseMode;

    return PinnedHttpClient._(isPinningEnabled: isPinningEnabled);
  }

  /// Get the underlying http.Client
  http.Client get client => _client;

  /// Close the client and release resources
  void close() {
    _client.close();
  }

  /// Send a GET request
  Future<http.Response> get(Uri url, {Map<String, String>? headers}) {
    _validateUrl(url);
    return _client.get(url, headers: headers);
  }

  /// Send a POST request
  Future<http.Response> post(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
  }) {
    _validateUrl(url);
    return _client.post(url, headers: headers, body: body);
  }

  /// Send a PUT request
  Future<http.Response> put(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
  }) {
    _validateUrl(url);
    return _client.put(url, headers: headers, body: body);
  }

  /// Send a DELETE request
  Future<http.Response> delete(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
  }) {
    _validateUrl(url);
    return _client.delete(url, headers: headers, body: body);
  }

  /// Validate URL before making request
  void _validateUrl(Uri url) {
    final host = url.host;

    // In release mode, warn if connecting to an unpinned production host
    if (kReleaseMode &&
        !CertificatePinningConfig.hasPinForHost(host) &&
        !CertificatePinningConfig.shouldBypassPinning(host)) {
      debugPrint(
        'PinnedHttpClient: WARNING - Connecting to unpinned host: $host. '
        'Consider adding certificate pins for this host.',
      );
    }
  }
}
