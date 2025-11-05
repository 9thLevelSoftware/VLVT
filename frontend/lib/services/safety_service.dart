import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config/app_config.dart';
import 'auth_service.dart';

class SafetyService extends ChangeNotifier {
  final AuthService _authService;
  Set<String> _blockedUserIds = {};
  bool _isLoaded = false;

  SafetyService(this._authService);

  String get baseUrl => AppConfig.chatServiceUrl;

  Map<String, String> _getAuthHeaders() {
    final token = _authService.token;
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Get blocked user IDs (cached)
  Set<String> get blockedUserIds => _blockedUserIds;

  // Check if a user is blocked
  bool isUserBlocked(String userId) {
    return _blockedUserIds.contains(userId);
  }

  // Load blocked users from backend
  Future<void> loadBlockedUsers() async {
    if (_isLoaded) return; // Already loaded

    try {
      final userId = _authService.userId;
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final encodedUserId = Uri.encodeComponent(userId);
      final response = await http.get(
        Uri.parse('$baseUrl/blocks/$encodedUserId'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['blockedUsers'] != null) {
          final blockedList = data['blockedUsers'] as List;
          _blockedUserIds = blockedList.map((b) => b['blockedUserId'] as String).toSet();
          _isLoaded = true;
          notifyListeners();
        }
      } else if (response.statusCode == 404) {
        // No blocks yet, that's fine
        _blockedUserIds = {};
        _isLoaded = true;
        notifyListeners();
      } else {
        throw Exception('Failed to load blocked users: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error loading blocked users: $e');
      // Don't rethrow - we can continue with empty blocked list
      _blockedUserIds = {};
      _isLoaded = true;
    }
  }

  // Refresh blocked users from backend
  Future<void> refreshBlockedUsers() async {
    _isLoaded = false;
    await loadBlockedUsers();
  }

  // Block a user
  Future<void> blockUser(String blockedUserId, {String? reason}) async {
    try {
      final userId = _authService.userId;
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final response = await http.post(
        Uri.parse('$baseUrl/blocks'),
        headers: _getAuthHeaders(),
        body: json.encode({
          'userId': userId,
          'blockedUserId': blockedUserId,
          'reason': reason,
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          _blockedUserIds.add(blockedUserId);
          notifyListeners();
        } else {
          throw Exception('Invalid response format');
        }
      } else {
        throw Exception('Failed to block user: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error blocking user: $e');
      rethrow;
    }
  }

  // Unblock a user
  Future<void> unblockUser(String blockedUserId) async {
    try {
      final userId = _authService.userId;
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final encodedUserId = Uri.encodeComponent(userId);
      final encodedBlockedUserId = Uri.encodeComponent(blockedUserId);
      final response = await http.delete(
        Uri.parse('$baseUrl/blocks/$encodedUserId/$encodedBlockedUserId'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          _blockedUserIds.remove(blockedUserId);
          notifyListeners();
        } else {
          throw Exception('Invalid response format');
        }
      } else {
        throw Exception('Failed to unblock user: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error unblocking user: $e');
      rethrow;
    }
  }

  // Report a user
  Future<void> reportUser({
    required String reportedUserId,
    required String reason,
    String? details,
  }) async {
    try {
      final userId = _authService.userId;
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final response = await http.post(
        Uri.parse('$baseUrl/reports'),
        headers: _getAuthHeaders(),
        body: json.encode({
          'reporterId': userId,
          'reportedUserId': reportedUserId,
          'reason': reason,
          'details': details,
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = json.decode(response.body);
        if (data['success'] != true) {
          throw Exception('Invalid response format');
        }
      } else {
        throw Exception('Failed to report user: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error reporting user: $e');
      rethrow;
    }
  }

  // Unmatch (delete a match)
  Future<void> unmatch(String matchId) async {
    try {
      final encodedMatchId = Uri.encodeComponent(matchId);
      final response = await http.delete(
        Uri.parse('$baseUrl/matches/$encodedMatchId'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] != true) {
          throw Exception('Invalid response format');
        }
      } else {
        throw Exception('Failed to unmatch: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error unmatching: $e');
      rethrow;
    }
  }

  // Get all blocked users with their profile info
  Future<List<Map<String, dynamic>>> getBlockedUsersWithProfiles() async {
    try {
      final userId = _authService.userId;
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final encodedUserId = Uri.encodeComponent(userId);
      final response = await http.get(
        Uri.parse('$baseUrl/blocks/$encodedUserId'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['blockedUsers'] != null) {
          return List<Map<String, dynamic>>.from(data['blockedUsers']);
        } else {
          throw Exception('Invalid response format');
        }
      } else if (response.statusCode == 404) {
        return [];
      } else {
        throw Exception('Failed to load blocked users: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error getting blocked users with profiles: $e');
      rethrow;
    }
  }
}
