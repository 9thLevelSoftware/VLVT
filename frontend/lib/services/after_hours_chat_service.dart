/// After Hours Chat Service
/// Handles After Hours chat operations including message history retrieval
/// and message sending with auto-retry
library;

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config/app_config.dart';
import '../models/message.dart';
import 'auth_service.dart';
import 'socket_service.dart';

/// Result of a save match attempt
class SaveResult {
  final bool success;
  final bool mutualSave;
  final String? permanentMatchId;
  final String? error;

  SaveResult({
    required this.success,
    this.mutualSave = false,
    this.permanentMatchId,
    this.error,
  });
}

class AfterHoursChatService extends ChangeNotifier {
  final AuthService _authService;
  final SocketService _socketService;

  // Auto-retry configuration
  static const _maxRetries = 3;
  static const List<int> _retryDelaysMs = [1000, 2000, 4000];

  AfterHoursChatService(this._authService, this._socketService);

  /// Get message history for an After Hours match
  /// Used when user reopens app mid-session
  Future<List<Message>> getMessageHistory({
    required String matchId,
    DateTime? before,
  }) async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        // debugPrint('AfterHoursChatService: No auth token');
        return [];
      }

      final queryParams = <String, String>{};
      if (before != null) {
        queryParams['before'] = before.toIso8601String();
      }

      final uri = Uri.parse(
        '${AppConfig.chatServiceUrl}/api/after-hours/messages/$matchId',
      ).replace(queryParameters: queryParams.isNotEmpty ? queryParams : null);

      final response = await http.get(
        uri,
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          final messagesJson = data['messages'] as List<dynamic>;
          return messagesJson
              .map((m) => Message.fromJson(m as Map<String, dynamic>))
              .toList();
        }
      }

      // debugPrint('AfterHoursChatService: Failed to get history: ${response.statusCode}');
      return [];
    } catch (e) {
      // debugPrint('AfterHoursChatService: Error getting history: $e');
      return [];
    }
  }

  /// Send message with auto-retry on failure
  /// Returns the sent Message on success, null after all retries fail
  Future<Message?> sendMessageWithRetry({
    required String matchId,
    required String text,
    required String tempId,
  }) async {
    int attempts = 0;

    while (attempts < _maxRetries) {
      try {
        // Wait for connection if disconnected
        if (!_socketService.isConnected) {
          final connected = await _waitForConnection(
            timeout: const Duration(seconds: 5),
          );
          if (!connected) {
            attempts++;
            if (attempts < _maxRetries) {
              await Future.delayed(Duration(milliseconds: _retryDelaysMs[attempts - 1]));
            }
            continue;
          }
        }

        final message = await _socketService.sendAfterHoursMessage(
          matchId: matchId,
          text: text,
          tempId: tempId,
        );

        if (message != null) {
          return message; // Success
        }

        // Null response = soft failure, retry
        attempts++;
        if (attempts < _maxRetries) {
          await Future.delayed(Duration(milliseconds: _retryDelaysMs[attempts - 1]));
        }
      } catch (e) {
        // debugPrint('AfterHoursChatService: Send attempt $attempts failed: $e');
        attempts++;
        if (attempts < _maxRetries) {
          await Future.delayed(Duration(milliseconds: _retryDelaysMs[attempts - 1]));
        }
      }
    }

    // All retries failed
    // debugPrint('AfterHoursChatService: All send retries failed');
    return null;
  }

  /// Wait for socket connection with timeout
  Future<bool> _waitForConnection({required Duration timeout}) async {
    final deadline = DateTime.now().add(timeout);

    while (DateTime.now().isBefore(deadline)) {
      if (_socketService.isConnected) return true;
      await Future.delayed(const Duration(milliseconds: 100));
    }

    return false;
  }

  /// Check if currently connected
  bool get isConnected => _socketService.isConnected;

  /// Save an After Hours match
  /// Returns SaveResult with success, mutualSave flag, and optional permanentMatchId
  Future<SaveResult> saveMatch({required String matchId}) async {
    try {
      final token = await _authService.getToken();
      if (token == null) {
        // debugPrint('AfterHoursChatService: No auth token for save');
        return SaveResult(success: false, error: 'Not authenticated');
      }

      final uri = Uri.parse(
        '${AppConfig.chatServiceUrl}/api/after-hours/matches/$matchId/save',
      );

      final response = await http.post(
        uri,
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return SaveResult(
          success: data['success'] == true,
          mutualSave: data['mutualSave'] == true,
          permanentMatchId: data['permanentMatchId'] as String?,
        );
      }

      if (response.statusCode == 404) {
        return SaveResult(success: false, error: 'Match not found');
      }
      if (response.statusCode == 403) {
        return SaveResult(success: false, error: 'Unauthorized');
      }

      return SaveResult(success: false, error: 'Failed to save match');
    } catch (e) {
      // debugPrint('AfterHoursChatService: Error saving match: $e');
      return SaveResult(success: false, error: e.toString());
    }
  }
}
