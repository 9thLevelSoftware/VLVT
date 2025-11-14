import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config/app_config.dart';
import '../models/profile.dart';
import 'auth_service.dart';
import 'analytics_service.dart';

class ProfileApiService extends ChangeNotifier {
  final AuthService _authService;

  ProfileApiService(this._authService);

  String get baseUrl => AppConfig.profileServiceUrl;

  Map<String, String> _getAuthHeaders() {
    final token = _authService.token;
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  Future<Profile> getProfile(String userId) async {
    try {
      final encodedUserId = Uri.encodeComponent(userId);
      final response = await http.get(
        Uri.parse('$baseUrl/profile/$encodedUserId'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['profile'] != null) {
          return Profile.fromJson(data['profile']);
        } else {
          throw Exception('Invalid response format');
        }
      } else if (response.statusCode == 404) {
        throw Exception('Profile not found');
      } else {
        throw Exception('Failed to load profile: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error getting profile: $e');
      rethrow;
    }
  }

  Future<List<Profile>> getDiscoveryProfiles({
    int? minAge,
    int? maxAge,
    double? maxDistance,
    List<String>? interests,
    List<String>? excludeUserIds,
  }) async {
    try {
      // Build query parameters
      final Map<String, String> queryParams = {};

      if (minAge != null) queryParams['minAge'] = minAge.toString();
      if (maxAge != null) queryParams['maxAge'] = maxAge.toString();
      if (maxDistance != null) queryParams['maxDistance'] = maxDistance.toString();
      if (interests != null && interests.isNotEmpty) {
        queryParams['interests'] = interests.join(',');
      }
      if (excludeUserIds != null && excludeUserIds.isNotEmpty) {
        queryParams['exclude'] = excludeUserIds.join(',');
      }

      final uri = Uri.parse('$baseUrl/profiles/discover').replace(
        queryParameters: queryParams.isNotEmpty ? queryParams : null,
      );

      final response = await http.get(
        uri,
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['profiles'] != null) {
          final profilesList = data['profiles'] as List;
          return profilesList.map((p) => Profile.fromJson(p)).toList();
        } else {
          throw Exception('Invalid response format');
        }
      } else {
        throw Exception('Failed to load discovery profiles: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error getting discovery profiles: $e');
      rethrow;
    }
  }

  Future<Profile> createProfile(Profile profile) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/profile'),
        headers: _getAuthHeaders(),
        body: json.encode(profile.toJson()),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['profile'] != null) {
          final createdProfile = Profile.fromJson(data['profile']);

          // Track profile creation
          await AnalyticsService.logProfileCreated();

          // Set user properties (using age instead of dateOfBirth)
          if (createdProfile.age != null) {
            final ageGroup = AnalyticsService.calculateAgeGroupFromAge(createdProfile.age!);
            await AnalyticsService.setUserProperties(
              ageGroup: ageGroup,
              signupDate: DateTime.now(),
            );
          }

          notifyListeners();
          return createdProfile;
        } else {
          throw Exception('Invalid response format');
        }
      } else if (response.statusCode == 400) {
        final data = json.decode(response.body);
        throw Exception(data['error'] ?? 'Invalid profile data');
      } else {
        throw Exception('Failed to create profile: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error creating profile: $e');
      rethrow;
    }
  }

  Future<Profile> updateProfile(Profile profile) async {
    try {
      final encodedUserId = Uri.encodeComponent(profile.userId);
      final response = await http.put(
        Uri.parse('$baseUrl/profile/$encodedUserId'),
        headers: _getAuthHeaders(),
        body: json.encode(profile.toJson()),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['profile'] != null) {
          // Track profile update
          await AnalyticsService.logProfileUpdated();

          notifyListeners();
          return Profile.fromJson(data['profile']);
        } else {
          throw Exception('Invalid response format');
        }
      } else if (response.statusCode == 404) {
        throw Exception('Profile not found');
      } else {
        final data = json.decode(response.body);
        throw Exception(data['error'] ?? 'Failed to update profile: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error updating profile: $e');
      rethrow;
    }
  }

  /// Batch fetch multiple profiles at once
  /// Returns a map of userId -> Profile
  Future<Map<String, Profile>> batchGetProfiles(List<String> userIds) async {
    if (userIds.isEmpty) {
      return {};
    }

    try {
      // For now, fetch profiles in parallel
      // In a real app, you'd want a dedicated batch endpoint on the backend
      final futures = userIds.map((userId) => getProfile(userId));
      final profiles = await Future.wait(
        futures,
        eagerError: false, // Continue even if some fail
      );

      final profileMap = <String, Profile>{};
      for (var i = 0; i < userIds.length; i++) {
        profileMap[userIds[i]] = profiles[i];
      }

      return profileMap;
    } catch (e) {
      debugPrint('Error batch getting profiles: $e');
      rethrow;
    }
  }
}
