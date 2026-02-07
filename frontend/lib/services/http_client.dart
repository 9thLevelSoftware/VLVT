import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:async';
import 'auth_service.dart';
import 'pinned_http_client.dart';

/// Custom HTTP client with timeout, 401 handling, and certificate pinning.
///
/// This client automatically applies certificate pinning in release mode
/// to protect against man-in-the-middle attacks on compromised networks.
///
/// In debug mode:
/// - Localhost connections bypass pinning for development convenience
/// - Production URLs still enforce pinning for security testing
///
/// In release mode:
/// - All production URLs enforce certificate pinning
/// - See [CertificatePinningConfig] for pinned hosts and fingerprints
class ApiHttpClient {
  final AuthService _authService;
  static const Duration defaultTimeout = Duration(seconds: 30);

  /// The underlying HTTP client with certificate pinning
  late final PinnedHttpClient _pinnedClient;

  /// Whether certificate pinning is active for this client
  bool get isPinningEnabled => _pinnedClient.isPinningEnabled;

  ApiHttpClient(this._authService) {
    _pinnedClient = PinnedHttpClient.create();
  }

  /// Dispose of resources when the client is no longer needed
  void dispose() {
    _pinnedClient.close();
  }

  Map<String, String> _getAuthHeaders() {
    final token = _authService.token;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  /// Handle 401 response - attempt token refresh
  Future<http.Response?> _handle401(
    Future<http.Response> Function() retryRequest,
  ) async {
    // debugPrint('ApiHttpClient: Received 401, attempting token refresh');

    final refreshed = await _authService.refreshToken();
    if (refreshed) {
      // debugPrint('ApiHttpClient: Token refreshed, retrying request');
      return await retryRequest();
    } else {
      // debugPrint('ApiHttpClient: Token refresh failed, signing out');
      await _authService.signOut();
      return null;
    }
  }

  /// GET request with timeout and 401 handling
  Future<http.Response> get(
    Uri url, {
    Map<String, String>? headers,
    Duration? timeout,
  }) async {
    final allHeaders = {..._getAuthHeaders(), ...?headers};

    Future<http.Response> makeRequest() async {
      return await _pinnedClient.get(url, headers: allHeaders)
          .timeout(timeout ?? defaultTimeout);
    }

    try {
      var response = await makeRequest();

      if (response.statusCode == 401) {
        final retryResponse = await _handle401(makeRequest);
        if (retryResponse != null) {
          response = retryResponse;
        }
      }

      return response;
    } on TimeoutException {
      // debugPrint('ApiHttpClient: Request timed out: $url');
      rethrow;
    }
  }

  /// POST request with timeout and 401 handling
  Future<http.Response> post(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
    Duration? timeout,
  }) async {
    final allHeaders = {..._getAuthHeaders(), ...?headers};
    final encodedBody = body is String ? body : (body != null ? json.encode(body) : null);

    Future<http.Response> makeRequest() async {
      return await _pinnedClient.post(url, headers: allHeaders, body: encodedBody)
          .timeout(timeout ?? defaultTimeout);
    }

    try {
      var response = await makeRequest();

      if (response.statusCode == 401) {
        final retryResponse = await _handle401(makeRequest);
        if (retryResponse != null) {
          response = retryResponse;
        }
      }

      return response;
    } on TimeoutException {
      // debugPrint('ApiHttpClient: Request timed out: $url');
      rethrow;
    }
  }

  /// PUT request with timeout and 401 handling
  Future<http.Response> put(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
    Duration? timeout,
  }) async {
    final allHeaders = {..._getAuthHeaders(), ...?headers};
    final encodedBody = body is String ? body : (body != null ? json.encode(body) : null);

    Future<http.Response> makeRequest() async {
      return await _pinnedClient.put(url, headers: allHeaders, body: encodedBody)
          .timeout(timeout ?? defaultTimeout);
    }

    try {
      var response = await makeRequest();

      if (response.statusCode == 401) {
        final retryResponse = await _handle401(makeRequest);
        if (retryResponse != null) {
          response = retryResponse;
        }
      }

      return response;
    } on TimeoutException {
      // debugPrint('ApiHttpClient: Request timed out: $url');
      rethrow;
    }
  }

  /// DELETE request with timeout and 401 handling
  Future<http.Response> delete(
    Uri url, {
    Map<String, String>? headers,
    Object? body,
    Duration? timeout,
  }) async {
    final allHeaders = {..._getAuthHeaders(), ...?headers};
    final encodedBody = body is String ? body : (body != null ? json.encode(body) : null);

    Future<http.Response> makeRequest() async {
      return await _pinnedClient.delete(url, headers: allHeaders, body: encodedBody)
          .timeout(timeout ?? defaultTimeout);
    }

    try {
      var response = await makeRequest();

      if (response.statusCode == 401) {
        final retryResponse = await _handle401(makeRequest);
        if (retryResponse != null) {
          response = retryResponse;
        }
      }

      return response;
    } on TimeoutException {
      // debugPrint('ApiHttpClient: Request timed out: $url');
      rethrow;
    }
  }
}
