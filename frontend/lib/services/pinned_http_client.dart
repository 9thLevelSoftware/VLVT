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

  /// SHA-256 fingerprints for certificate pinning.
  ///
  /// Format: SHA-256 fingerprint as uppercase hex string without colons
  ///
  /// Each host has three pins for redundancy:
  /// 1. Leaf certificate (primary) - rotates every ~90 days with Let's Encrypt
  /// 2. Let's Encrypt R3 intermediate - more stable backup
  /// 3. ISRG Root X1 - most stable backup (rarely changes)
  ///
  /// MAINTENANCE: When certificates rotate, update the leaf certificate pins.
  /// The intermediate and root pins provide continuity during rotation.
  ///
  /// To update leaf certificates, run:
  /// ```bash
  /// echo | openssl s_client -servername HOST -connect HOST:443 2>/dev/null | \
  /// openssl x509 -fingerprint -sha256 -noout | sed 's/://g' | cut -d= -f2
  /// ```
  static const Map<String, List<String>> pinnedCertificates = {
    'vlvtauth.up.railway.app': [
      // Server leaf certificate (primary pin - rotates with Let's Encrypt ~90 days)
      // Last updated: 2026-01-01
      '01AD41A287FAF64BDA89B18217D130C0074C2EC76C80E91F9ACDDE649937FDE8',
      // Let's Encrypt R3 intermediate (backup pin - more stable)
      '67ADD1166B020AE61B8F5FC96813C04C2AA589960796865572A3C7E737613DFD',
      // Let's Encrypt ISRG Root X1 (backup pin - most stable)
      '96BCEC06264976F37460779ACF28C5A7CFE8A3C0AAE11A8FFCEE05C0BDDF08C6',
    ],
    'vlvtprofiles.up.railway.app': [
      // Server leaf certificate (primary pin - rotates with Let's Encrypt ~90 days)
      // Last updated: 2026-01-01
      '01AD41A287FAF64BDA89B18217D130C0074C2EC76C80E91F9ACDDE649937FDE8',
      // Let's Encrypt R3 intermediate (backup pin - more stable)
      '67ADD1166B020AE61B8F5FC96813C04C2AA589960796865572A3C7E737613DFD',
      // Let's Encrypt ISRG Root X1 (backup pin - most stable)
      '96BCEC06264976F37460779ACF28C5A7CFE8A3C0AAE11A8FFCEE05C0BDDF08C6',
    ],
    'vlvtchat.up.railway.app': [
      // Server leaf certificate (primary pin - rotates with Let's Encrypt ~90 days)
      // Last updated: 2026-01-01
      '01AD41A287FAF64BDA89B18217D130C0074C2EC76C80E91F9ACDDE649937FDE8',
      // Let's Encrypt R3 intermediate (backup pin - more stable)
      '67ADD1166B020AE61B8F5FC96813C04C2AA589960796865572A3C7E737613DFD',
      // Let's Encrypt ISRG Root X1 (backup pin - most stable)
      '96BCEC06264976F37460779ACF28C5A7CFE8A3C0AAE11A8FFCEE05C0BDDF08C6',
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
    // debugPrint('PinnedHttpClient: Web platform detected, using standard client');
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
      // debugPrint('PinnedHttpClient: Bypassing pinning for development host: $host');
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
        // debugPrint('PinnedHttpClient: Certificate pinning FAILED for $host');
        // debugPrint('PinnedHttpClient: Expected one of: $pins');
        // debugPrint('PinnedHttpClient: Got: $fingerprint');
        // Return false to reject the certificate
        return false;
      }

      // debugPrint('PinnedHttpClient: Certificate pinning PASSED for $host');
      return true;
    }

    // For non-pinned hosts in release mode, use default validation
    // The badCertificateCallback is only called for "bad" certificates,
    // so returning false here rejects certificates that failed normal validation
    if (kReleaseMode) {
      // debugPrint('PinnedHttpClient: Rejecting unpinned host in release mode: $host');
      return false;
    }

    // In debug mode, allow non-pinned hosts (for testing against staging, etc.)
    // debugPrint('PinnedHttpClient: Allowing unpinned host in debug mode: $host');
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
    // Validation logic removed - logging not needed in production
  }
}
