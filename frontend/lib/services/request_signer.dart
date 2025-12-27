import 'dart:convert';
import 'package:crypto/crypto.dart';

/// Request Signer for HMAC-SHA256 request signing.
///
/// This service provides request integrity verification by signing API requests
/// with HMAC-SHA256. It ensures requests haven't been tampered with in transit.
///
/// Signature format:
///   signature = HMAC-SHA256(secret, method + path + timestamp + bodyHash)
///   bodyHash = SHA256(requestBody) or empty body hash for no body
///
/// Headers added:
///   X-Signature: The HMAC-SHA256 signature (hex-encoded)
///   X-Timestamp: Unix timestamp in milliseconds
///
/// Usage:
/// ```dart
/// final signer = RequestSigner('your-secret-key');
/// final headers = signer.sign('POST', '/api/users', body: '{"name": "John"}');
/// // headers contains X-Signature and X-Timestamp
/// ```
class RequestSigner {
  final String _secret;

  /// Empty body SHA256 hash (for GET requests or empty POST body)
  /// This is the SHA256 hash of an empty string
  static const String emptyBodyHash =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  /// Header name for the signature
  static const String signatureHeader = 'X-Signature';

  /// Header name for the timestamp
  static const String timestampHeader = 'X-Timestamp';

  /// Creates a new RequestSigner with the given secret key.
  ///
  /// The secret should match the server's REQUEST_SIGNING_SECRET.
  RequestSigner(this._secret);

  /// Compute SHA256 hash of data.
  ///
  /// Returns the hash as a lowercase hex string.
  static String computeHash(String data) {
    final bytes = utf8.encode(data);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Compute HMAC-SHA256 signature.
  ///
  /// The signature is computed as:
  ///   HMAC-SHA256(secret, method + path + timestamp + bodyHash)
  ///
  /// Returns the signature as a lowercase hex string.
  String computeSignature(
    String method,
    String path,
    String timestamp,
    String bodyHash,
  ) {
    final payload = '${method.toUpperCase()}$path$timestamp$bodyHash';
    final key = utf8.encode(_secret);
    final bytes = utf8.encode(payload);
    final hmacSha256 = Hmac(sha256, key);
    final digest = hmacSha256.convert(bytes);
    return digest.toString();
  }

  /// Sign a request and return the headers to add.
  ///
  /// [method] - HTTP method (GET, POST, PUT, DELETE, etc.)
  /// [path] - URL path (e.g., '/api/users' - without query string for consistency)
  /// [body] - Optional request body as string (for POST/PUT/PATCH)
  ///
  /// Returns a map containing X-Signature and X-Timestamp headers.
  ///
  /// Example:
  /// ```dart
  /// final headers = signer.sign('POST', '/api/users', body: jsonEncode({'name': 'John'}));
  /// // Add headers to your HTTP request
  /// ```
  Map<String, String> sign(String method, String path, {String? body}) {
    final timestamp = DateTime.now().millisecondsSinceEpoch.toString();
    final bodyHash = (body != null && body.isNotEmpty)
        ? computeHash(body)
        : emptyBodyHash;
    final signature = computeSignature(method, path, timestamp, bodyHash);

    return {
      signatureHeader: signature,
      timestampHeader: timestamp,
    };
  }

  /// Sign a request with a specific timestamp (useful for testing).
  ///
  /// Same as [sign] but allows specifying the timestamp.
  Map<String, String> signWithTimestamp(
    String method,
    String path,
    int timestampMs, {
    String? body,
  }) {
    final timestamp = timestampMs.toString();
    final bodyHash = (body != null && body.isNotEmpty)
        ? computeHash(body)
        : emptyBodyHash;
    final signature = computeSignature(method, path, timestamp, bodyHash);

    return {
      signatureHeader: signature,
      timestampHeader: timestamp,
    };
  }

  /// Create signing headers for a request with a JSON body.
  ///
  /// Convenience method that JSON-encodes the body before signing.
  ///
  /// [method] - HTTP method
  /// [path] - URL path
  /// [jsonBody] - Body object to JSON-encode and sign
  ///
  /// Returns a map containing X-Signature and X-Timestamp headers.
  Map<String, String> signJson(
    String method,
    String path, {
    Object? jsonBody,
  }) {
    final body = jsonBody != null ? jsonEncode(jsonBody) : null;
    return sign(method, path, body: body);
  }
}

/// Extension to easily add signing headers to existing headers map.
extension SignedHeaders on Map<String, String> {
  /// Add signing headers to this map.
  ///
  /// Example:
  /// ```dart
  /// final headers = {
  ///   'Content-Type': 'application/json',
  ///   'Authorization': 'Bearer $token',
  /// }.withSignature(signer, 'POST', '/api/users', body: jsonBody);
  /// ```
  Map<String, String> withSignature(
    RequestSigner signer,
    String method,
    String path, {
    String? body,
  }) {
    final signatureHeaders = signer.sign(method, path, body: body);
    return {...this, ...signatureHeaders};
  }
}
