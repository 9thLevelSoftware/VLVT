/// Result of deep link validation
class DeepLinkValidationResult {
  final bool isValid;
  final String? error;
  final DeepLinkType? type;
  final Map<String, String>? sanitizedParameters;

  const DeepLinkValidationResult({
    required this.isValid,
    this.error,
    this.type,
    this.sanitizedParameters,
  });

  factory DeepLinkValidationResult.valid({
    required DeepLinkType type,
    Map<String, String>? sanitizedParameters,
  }) {
    return DeepLinkValidationResult(
      isValid: true,
      type: type,
      sanitizedParameters: sanitizedParameters,
    );
  }

  factory DeepLinkValidationResult.invalid(String error) {
    return DeepLinkValidationResult(
      isValid: false,
      error: error,
    );
  }
}

/// Types of deep links supported by the app
enum DeepLinkType {
  emailVerification,
  passwordReset,
  viewMatch,
  openChat,
  invite,
}

/// Validates deep links to prevent phishing attacks and malicious links.
///
/// This validator ensures that deep links:
/// - Come from trusted schemes (vlvt://, https://getvlvt.vip, https://api.getvlvt.vip)
/// - Have valid host/domain for https links
/// - Match expected path patterns
/// - Have safe query parameters (no script injection)
/// - Do not use dangerous schemes (javascript:, data:, etc.)
class DeepLinkValidator {
  /// Allowed custom schemes
  static const Set<String> _allowedSchemes = {'vlvt', 'https'};

  /// Dangerous schemes that should always be rejected
  static const Set<String> _dangerousSchemes = {
    'javascript',
    'data',
    'vbscript',
    'file',
    'ftp',
    'blob',
  };

  /// Allowed hosts for https links
  static const Set<String> _allowedHttpsHosts = {
    'getvlvt.vip',
    'www.getvlvt.vip',
    'api.getvlvt.vip',
  };

  /// Allowed hosts for vlvt:// scheme
  static const Set<String> _allowedVlvtHosts = {
    'auth',     // vlvt://auth/verify, vlvt://auth/reset-password
    'match',    // vlvt://match/{id}
    'chat',     // vlvt://chat/{id}
    'invite',   // vlvt://invite/{code}
    '',         // Allow host-less paths like vlvt:///verify
  };

  /// Valid path patterns for each deep link type
  static final Map<DeepLinkType, List<RegExp>> _validPathPatterns = {
    DeepLinkType.emailVerification: [
      RegExp(r'^/?verify$'),
      RegExp(r'^/?auth/verify$'),
    ],
    DeepLinkType.passwordReset: [
      RegExp(r'^/?reset-password$'),
      RegExp(r'^/?auth/reset-password$'),
    ],
    DeepLinkType.viewMatch: [
      RegExp(r'^/?match/[a-zA-Z0-9_-]+$'),
    ],
    DeepLinkType.openChat: [
      RegExp(r'^/?chat/[a-zA-Z0-9_-]+$'),
    ],
    DeepLinkType.invite: [
      RegExp(r'^/?invite/?$'),
      RegExp(r'^/?invite/[a-zA-Z0-9_-]+$'),
    ],
  };

  /// Pattern for valid token parameters (alphanumeric with common safe characters)
  static final RegExp _validTokenPattern = RegExp(r'^[a-zA-Z0-9_.\-]+$');

  /// Pattern for valid ID parameters
  static final RegExp _validIdPattern = RegExp(r'^[a-zA-Z0-9_-]+$');

  /// Pattern for valid invite codes (format: VLVT-XXXX or alphanumeric)
  static final RegExp _validInviteCodePattern = RegExp(r'^[a-zA-Z0-9_-]+$');

  /// Characters that indicate potential encoding bypass attempts
  static final RegExp _suspiciousEncodingPattern = RegExp(
    r'%(?:00|0[aAdD]|22|27|3[cCeE]|60)',  // Null, newlines, quotes, angle brackets, backtick
    caseSensitive: false,
  );

  /// Pattern for script injection attempts in parameters
  static final RegExp _scriptInjectionPattern = RegExp(
    r'<\s*script|javascript\s*:|on\w+\s*=|eval\s*\(|document\.|window\.',
    caseSensitive: false,
  );

  /// Pattern for dangerous event handler parameter keys
  static final RegExp _eventHandlerKeyPattern = RegExp(
    r'^on(click|load|error|mouseover|mouseout|focus|blur|change|submit|keydown|keyup|keypress)$',
    caseSensitive: false,
  );

  /// Callback for logging rejected links (for security monitoring)
  static void Function(String link, String reason)? onLinkRejected;

  /// Validates a deep link and returns the result.
  ///
  /// Returns a [DeepLinkValidationResult] indicating whether the link is valid,
  /// and if valid, the type of link and sanitized parameters.
  static DeepLinkValidationResult validate(String link) {
    if (link.isEmpty) {
      return _rejectLink(link, 'Empty link');
    }

    // Check for suspicious URL encoding before parsing
    if (_hasSuspiciousEncoding(link)) {
      return _rejectLink(link, 'Suspicious URL encoding detected');
    }

    // Try to parse the URI
    Uri uri;
    try {
      uri = Uri.parse(link);
    } catch (e) {
      return _rejectLink(link, 'Invalid URI format: $e');
    }

    // Validate scheme
    final schemeResult = _validateScheme(uri.scheme.toLowerCase());
    if (!schemeResult.isValid) {
      return _rejectLink(link, schemeResult.error!);
    }

    // Validate host based on scheme
    final hostResult = _validateHost(uri);
    if (!hostResult.isValid) {
      return _rejectLink(link, hostResult.error!);
    }

    // Determine deep link type and validate path
    final typeResult = _determineTypeAndValidatePath(uri);
    if (!typeResult.isValid) {
      return _rejectLink(link, typeResult.error!);
    }

    // Validate and sanitize query parameters
    final paramsResult = _validateAndSanitizeParameters(uri, typeResult.type!);
    if (!paramsResult.isValid) {
      return _rejectLink(link, paramsResult.error!);
    }

    return DeepLinkValidationResult.valid(
      type: typeResult.type!,
      sanitizedParameters: paramsResult.sanitizedParameters,
    );
  }

  /// Quick check if a link is valid (without full validation details)
  static bool isValid(String link) {
    return validate(link).isValid;
  }

  /// Check for suspicious URL encoding that could bypass validation
  static bool _hasSuspiciousEncoding(String link) {
    return _suspiciousEncodingPattern.hasMatch(link);
  }

  /// Validate the URL scheme
  static DeepLinkValidationResult _validateScheme(String scheme) {
    if (scheme.isEmpty) {
      return DeepLinkValidationResult.invalid('Missing URL scheme');
    }

    if (_dangerousSchemes.contains(scheme)) {
      return DeepLinkValidationResult.invalid(
        'Dangerous scheme rejected: $scheme',
      );
    }

    if (!_allowedSchemes.contains(scheme)) {
      return DeepLinkValidationResult.invalid(
        'Unsupported scheme: $scheme. Allowed schemes: ${_allowedSchemes.join(", ")}',
      );
    }

    return const DeepLinkValidationResult(isValid: true);
  }

  /// Validate the host based on the scheme
  static DeepLinkValidationResult _validateHost(Uri uri) {
    final scheme = uri.scheme.toLowerCase();
    final host = uri.host.toLowerCase();

    if (scheme == 'https') {
      if (!_allowedHttpsHosts.contains(host)) {
        return DeepLinkValidationResult.invalid(
          'Untrusted host for HTTPS: $host. Allowed hosts: ${_allowedHttpsHosts.join(", ")}',
        );
      }
    } else if (scheme == 'vlvt') {
      // For vlvt:// scheme, validate against allowed hosts
      // The host can be empty for paths like vlvt:///verify
      if (host.isNotEmpty && !_allowedVlvtHosts.contains(host)) {
        return DeepLinkValidationResult.invalid(
          'Invalid host for vlvt scheme: $host',
        );
      }
    }

    return const DeepLinkValidationResult(isValid: true);
  }

  /// Determine the deep link type from the path and validate path structure
  static DeepLinkValidationResult _determineTypeAndValidatePath(Uri uri) {
    // For vlvt:// scheme, the host is often part of the logical path
    // e.g., vlvt://match/id123 parses as host=match, path=/id123
    // We need to combine them to get the effective path
    String effectivePath;
    if (uri.scheme.toLowerCase() == 'vlvt' && uri.host.isNotEmpty) {
      // Combine host and path: vlvt://match/id123 -> /match/id123
      effectivePath = '/${uri.host}${uri.path}';
    } else {
      effectivePath = uri.path;
    }

    // Check each deep link type's patterns
    for (final entry in _validPathPatterns.entries) {
      final type = entry.key;
      final patterns = entry.value;

      for (final pattern in patterns) {
        if (pattern.hasMatch(effectivePath)) {
          return DeepLinkValidationResult.valid(type: type);
        }
      }
    }

    return DeepLinkValidationResult.invalid(
      'Unknown or invalid path: $effectivePath',
    );
  }

  /// Get effective path segments, combining host and path for vlvt:// scheme
  static List<String> _getEffectivePathSegments(Uri uri) {
    if (uri.scheme.toLowerCase() == 'vlvt' && uri.host.isNotEmpty) {
      // For vlvt://match/id123, combine host and path segments
      return [uri.host, ...uri.pathSegments];
    }
    return uri.pathSegments;
  }

  /// Validate and sanitize query parameters based on deep link type
  static DeepLinkValidationResult _validateAndSanitizeParameters(
    Uri uri,
    DeepLinkType type,
  ) {
    final params = uri.queryParameters;
    final sanitized = <String, String>{};

    // Check all parameters for script injection attempts
    for (final entry in params.entries) {
      final key = entry.key;
      final value = entry.value;

      // Check for event handler parameter keys (onclick, onload, etc.)
      if (_eventHandlerKeyPattern.hasMatch(key)) {
        return DeepLinkValidationResult.invalid(
          'Script injection attempt detected in parameter: $key',
        );
      }

      if (_hasScriptInjection(key) || _hasScriptInjection(value)) {
        return DeepLinkValidationResult.invalid(
          'Script injection attempt detected in parameter: $key',
        );
      }

      // Check for suspicious encoding in parameter values
      if (_hasSuspiciousEncoding(value)) {
        return DeepLinkValidationResult.invalid(
          'Suspicious encoding in parameter: $key',
        );
      }
    }

    // Get effective path segments (handles vlvt:// scheme correctly)
    final pathSegments = _getEffectivePathSegments(uri);

    // Type-specific parameter validation
    switch (type) {
      case DeepLinkType.emailVerification:
      case DeepLinkType.passwordReset:
        // These require a token parameter
        final token = params['token'];
        if (token == null || token.isEmpty) {
          return DeepLinkValidationResult.invalid(
            'Missing required token parameter',
          );
        }
        if (!_validTokenPattern.hasMatch(token)) {
          return DeepLinkValidationResult.invalid(
            'Invalid token format',
          );
        }
        sanitized['token'] = token;
        break;

      case DeepLinkType.viewMatch:
      case DeepLinkType.openChat:
        // ID is in the path, not query params - extract it
        if (pathSegments.length >= 2) {
          final id = pathSegments.last;
          if (!_validIdPattern.hasMatch(id)) {
            return DeepLinkValidationResult.invalid(
              'Invalid ID format in path',
            );
          }
          sanitized['id'] = id;
        }
        break;

      case DeepLinkType.invite:
        // Code can be in path or query parameter
        String? code = params['code'];

        // Check if code is in the path
        if (code == null && pathSegments.length >= 2) {
          final inviteIndex = pathSegments.indexOf('invite');
          if (inviteIndex >= 0 && inviteIndex + 1 < pathSegments.length) {
            code = pathSegments[inviteIndex + 1];
          }
        }

        if (code != null && code.isNotEmpty) {
          if (!_validInviteCodePattern.hasMatch(code)) {
            return DeepLinkValidationResult.invalid(
              'Invalid invite code format',
            );
          }
          sanitized['code'] = code;
        }
        break;
    }

    return DeepLinkValidationResult.valid(
      type: type,
      sanitizedParameters: sanitized,
    );
  }

  /// Check for script injection patterns
  static bool _hasScriptInjection(String value) {
    return _scriptInjectionPattern.hasMatch(value);
  }

  /// Log and return a rejection result
  static DeepLinkValidationResult _rejectLink(String link, String reason) {
    // Log the rejection for security monitoring
    // debugPrint('[DeepLinkValidator] Rejected link: $reason');
    // debugPrint('[DeepLinkValidator] Link: $link');

    // Call the optional callback for external logging
    onLinkRejected?.call(link, reason);

    return DeepLinkValidationResult.invalid(reason);
  }

  /// Extracts the ID from a match or chat deep link path
  static String? extractIdFromPath(Uri uri) {
    final pathSegments = _getEffectivePathSegments(uri);
    if (pathSegments.length >= 2) {
      final id = pathSegments.last;
      if (_validIdPattern.hasMatch(id)) {
        return id;
      }
    }
    return null;
  }

  /// Extracts the invite code from an invite deep link
  static String? extractInviteCode(Uri uri) {
    // Try query parameter first
    final code = uri.queryParameters['code'];
    if (code != null && _validInviteCodePattern.hasMatch(code)) {
      return code;
    }

    // Try path segment
    final pathSegments = _getEffectivePathSegments(uri);
    final inviteIndex = pathSegments.indexOf('invite');
    if (inviteIndex >= 0 && inviteIndex + 1 < pathSegments.length) {
      final pathCode = pathSegments[inviteIndex + 1];
      if (_validInviteCodePattern.hasMatch(pathCode)) {
        return pathCode;
      }
    }

    return null;
  }
}
