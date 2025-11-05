import 'dart:io';
import 'package:http/http.dart' as http;

/// Error types for categorization
enum ErrorType {
  network,
  authentication,
  validation,
  server,
  rateLimit,
  notFound,
  unknown,
}

/// User-friendly error message with type and guidance
class UserFriendlyError {
  final String message;
  final String guidance;
  final ErrorType type;
  final String? technicalDetails;

  UserFriendlyError({
    required this.message,
    required this.guidance,
    required this.type,
    this.technicalDetails,
  });
}

/// Error handler to map exceptions to user-friendly messages
class ErrorHandler {
  /// Convert any exception to a user-friendly error
  static UserFriendlyError handleError(dynamic error) {
    // Network errors
    if (error is SocketException) {
      return UserFriendlyError(
        message: 'No internet connection',
        guidance: 'Check your connection and try again',
        type: ErrorType.network,
        technicalDetails: error.toString(),
      );
    }

    if (error is HttpException) {
      return UserFriendlyError(
        message: 'Connection problem',
        guidance: 'Please check your internet connection',
        type: ErrorType.network,
        technicalDetails: error.toString(),
      );
    }

    if (error is TimeoutException) {
      return UserFriendlyError(
        message: 'Request timed out',
        guidance: 'The server is taking too long to respond. Try again',
        type: ErrorType.network,
        technicalDetails: error.toString(),
      );
    }

    // HTTP errors
    if (error is http.Response) {
      return _handleHttpResponse(error);
    }

    // String errors (often from API responses)
    if (error is String) {
      return _handleStringError(error);
    }

    // FormatException (JSON parsing errors, etc.)
    if (error is FormatException) {
      return UserFriendlyError(
        message: 'Unexpected response',
        guidance: 'Something went wrong. Please try again',
        type: ErrorType.server,
        technicalDetails: error.toString(),
      );
    }

    // StateError
    if (error is StateError) {
      return UserFriendlyError(
        message: 'Invalid state',
        guidance: 'Please refresh and try again',
        type: ErrorType.validation,
        technicalDetails: error.toString(),
      );
    }

    // Generic error
    return UserFriendlyError(
      message: 'Something went wrong',
      guidance: 'Please try again. If the problem persists, contact support',
      type: ErrorType.unknown,
      technicalDetails: error.toString(),
    );
  }

  static UserFriendlyError _handleHttpResponse(http.Response response) {
    switch (response.statusCode) {
      case 400:
        return UserFriendlyError(
          message: 'Invalid request',
          guidance: 'Please check your input and try again',
          type: ErrorType.validation,
          technicalDetails: 'HTTP 400: ${response.body}',
        );
      case 401:
        return UserFriendlyError(
          message: 'Not authenticated',
          guidance: 'Please sign in again',
          type: ErrorType.authentication,
          technicalDetails: 'HTTP 401: ${response.body}',
        );
      case 403:
        return UserFriendlyError(
          message: 'Access denied',
          guidance: 'You don\'t have permission to do this',
          type: ErrorType.authentication,
          technicalDetails: 'HTTP 403: ${response.body}',
        );
      case 404:
        return UserFriendlyError(
          message: 'Not found',
          guidance: 'The requested resource could not be found',
          type: ErrorType.notFound,
          technicalDetails: 'HTTP 404: ${response.body}',
        );
      case 409:
        return UserFriendlyError(
          message: 'Conflict',
          guidance: 'This action conflicts with existing data',
          type: ErrorType.validation,
          technicalDetails: 'HTTP 409: ${response.body}',
        );
      case 429:
        return UserFriendlyError(
          message: 'Too many requests',
          guidance: 'Please wait a moment before trying again',
          type: ErrorType.rateLimit,
          technicalDetails: 'HTTP 429: ${response.body}',
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return UserFriendlyError(
          message: 'Server error',
          guidance: 'Our servers are having issues. Try again in a few minutes',
          type: ErrorType.server,
          technicalDetails: 'HTTP ${response.statusCode}: ${response.body}',
        );
      default:
        return UserFriendlyError(
          message: 'Unexpected error',
          guidance: 'Something went wrong. Please try again',
          type: ErrorType.unknown,
          technicalDetails: 'HTTP ${response.statusCode}: ${response.body}',
        );
    }
  }

  static UserFriendlyError _handleStringError(String error) {
    final lowerError = error.toLowerCase();

    // Authentication errors
    if (lowerError.contains('auth') ||
        lowerError.contains('token') ||
        lowerError.contains('unauthorized')) {
      return UserFriendlyError(
        message: 'Authentication error',
        guidance: 'Please sign in again',
        type: ErrorType.authentication,
        technicalDetails: error,
      );
    }

    // Network errors
    if (lowerError.contains('network') ||
        lowerError.contains('connection') ||
        lowerError.contains('timeout')) {
      return UserFriendlyError(
        message: 'Connection error',
        guidance: 'Check your internet connection and try again',
        type: ErrorType.network,
        technicalDetails: error,
      );
    }

    // Validation errors
    if (lowerError.contains('invalid') ||
        lowerError.contains('validation') ||
        lowerError.contains('required')) {
      return UserFriendlyError(
        message: 'Invalid input',
        guidance: 'Please check your input and try again',
        type: ErrorType.validation,
        technicalDetails: error,
      );
    }

    // Rate limit errors
    if (lowerError.contains('rate limit') || lowerError.contains('too many')) {
      return UserFriendlyError(
        message: 'Too many requests',
        guidance: 'Please wait a moment before trying again',
        type: ErrorType.rateLimit,
        technicalDetails: error,
      );
    }

    // Not found errors
    if (lowerError.contains('not found') || lowerError.contains('404')) {
      return UserFriendlyError(
        message: 'Not found',
        guidance: 'The requested resource could not be found',
        type: ErrorType.notFound,
        technicalDetails: error,
      );
    }

    // Server errors
    if (lowerError.contains('server') ||
        lowerError.contains('500') ||
        lowerError.contains('502') ||
        lowerError.contains('503')) {
      return UserFriendlyError(
        message: 'Server error',
        guidance: 'Our servers are having issues. Try again in a few minutes',
        type: ErrorType.server,
        technicalDetails: error,
      );
    }

    // Generic error
    return UserFriendlyError(
      message: error,
      guidance: 'Please try again',
      type: ErrorType.unknown,
      technicalDetails: error,
    );
  }

  /// Get a short error message for display in snackbars
  static String getShortMessage(dynamic error) {
    final friendlyError = handleError(error);
    return friendlyError.message;
  }

  /// Get a full error message with guidance
  static String getFullMessage(dynamic error) {
    final friendlyError = handleError(error);
    return '${friendlyError.message}\n${friendlyError.guidance}';
  }
}
