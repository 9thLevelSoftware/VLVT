import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config/app_config.dart';
import 'auth_service.dart';
import 'analytics_service.dart';

/// Safety service for After Hours mode - block and report endpoints
///
/// Provides dedicated safety functions for After Hours matches.
/// Report auto-blocks the user and declines the match.
/// Block permanently blocks the user (same as main app).
class AfterHoursSafetyService extends ChangeNotifier {
  final AuthService _authService;

  AfterHoursSafetyService(this._authService);

  String get baseUrl => AppConfig.chatServiceUrl;

  Map<String, String> _getAuthHeaders() {
    final token = _authService.token;
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  /// Block user from After Hours match (permanent block)
  /// Returns true on success, throws on error
  Future<bool> blockUser(String matchId, {String? reason}) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/after-hours/matches/$matchId/block'),
        headers: _getAuthHeaders(),
        body: json.encode({
          if (reason != null) 'reason': reason,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          await AnalyticsService.logUserBlocked(matchId);
          return true;
        }
      }
      throw Exception('Failed to block user: ${response.statusCode}');
    } catch (e) {
      // debugPrint('Error blocking After Hours user: $e');
      rethrow;
    }
  }

  /// Report user from After Hours match (auto-blocks and declines)
  /// Returns true on success, throws on error
  ///
  /// Valid reasons: 'inappropriate', 'harassment', 'spam', 'underage', 'other'
  Future<bool> reportUser({
    required String matchId,
    required String reason,
    String? details,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/after-hours/matches/$matchId/report'),
        headers: _getAuthHeaders(),
        body: json.encode({
          'reason': reason,
          if (details != null && details.isNotEmpty) 'details': details,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          await AnalyticsService.logUserReported(matchId, reason);
          return true;
        }
      }
      throw Exception('Failed to report user: ${response.statusCode}');
    } catch (e) {
      // debugPrint('Error reporting After Hours user: $e');
      rethrow;
    }
  }
}
