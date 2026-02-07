import 'dart:io';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config/app_config.dart';
import 'base_api_service.dart';

/// After Hours profile data
///
/// Represents the user's separate identity for After Hours mode.
/// Name and age are inherited from the main profile.
class AfterHoursProfile {
  final String? id;
  final String? photoUrl;
  final String? bio;
  final String? name;  // inherited from main profile
  final int? age;      // inherited from main profile

  AfterHoursProfile({
    this.id,
    this.photoUrl,
    this.bio,
    this.name,
    this.age,
  });

  factory AfterHoursProfile.fromJson(Map<String, dynamic> json) {
    return AfterHoursProfile(
      id: json['id'] as String?,
      photoUrl: json['photo_url'] as String?,
      bio: json['bio'] as String?,
      name: json['name'] as String?,
      age: json['age'] as int?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      if (photoUrl != null) 'photo_url': photoUrl,
      if (bio != null) 'bio': bio,
      if (name != null) 'name': name,
      if (age != null) 'age': age,
    };
  }

  /// Profile is complete when photo and bio are both set
  bool get isComplete =>
      photoUrl != null && photoUrl!.isNotEmpty &&
      bio != null && bio!.isNotEmpty;

  AfterHoursProfile copyWith({
    String? id,
    String? photoUrl,
    String? bio,
    String? name,
    int? age,
  }) {
    return AfterHoursProfile(
      id: id ?? this.id,
      photoUrl: photoUrl ?? this.photoUrl,
      bio: bio ?? this.bio,
      name: name ?? this.name,
      age: age ?? this.age,
    );
  }
}

/// After Hours matching preferences
///
/// Controls who the user is shown during After Hours sessions.
class AfterHoursPreferences {
  final String? id;
  final String? genderSeeking;  // 'male', 'female', 'any'
  final int? minAge;
  final int? maxAge;
  final double? maxDistanceKm;

  AfterHoursPreferences({
    this.id,
    this.genderSeeking,
    this.minAge,
    this.maxAge,
    this.maxDistanceKm,
  });

  factory AfterHoursPreferences.fromJson(Map<String, dynamic> json) {
    return AfterHoursPreferences(
      id: json['id'] as String?,
      genderSeeking: json['gender_seeking'] as String?,
      minAge: json['min_age'] as int?,
      maxAge: json['max_age'] as int?,
      maxDistanceKm: (json['max_distance_km'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      if (genderSeeking != null) 'gender_seeking': genderSeeking,
      if (minAge != null) 'min_age': minAge,
      if (maxAge != null) 'max_age': maxAge,
      if (maxDistanceKm != null) 'max_distance_km': maxDistanceKm,
    };
  }

  /// Preferences are complete when genderSeeking is set
  bool get isComplete => genderSeeking != null;

  AfterHoursPreferences copyWith({
    String? id,
    String? genderSeeking,
    int? minAge,
    int? maxAge,
    double? maxDistanceKm,
  }) {
    return AfterHoursPreferences(
      id: id ?? this.id,
      genderSeeking: genderSeeking ?? this.genderSeeking,
      minAge: minAge ?? this.minAge,
      maxAge: maxAge ?? this.maxAge,
      maxDistanceKm: maxDistanceKm ?? this.maxDistanceKm,
    );
  }
}

/// Service for managing After Hours profile and preferences
///
/// Handles all API calls related to After Hours identity:
/// - Profile creation, retrieval, and updates
/// - Photo upload for After Hours profile
/// - Matching preferences management
class AfterHoursProfileService extends BaseApiService {
  AfterHoursProfile? _profile;
  AfterHoursPreferences? _preferences;
  bool _isLoading = false;

  AfterHoursProfile? get profile => _profile;
  AfterHoursPreferences? get preferences => _preferences;
  bool get isLoading => _isLoading;

  /// Returns true when both profile and preferences are complete
  bool get isSetupComplete =>
      (_profile?.isComplete ?? false) &&
      (_preferences?.isComplete ?? false);

  AfterHoursProfileService(super.authService);

  @override
  String get baseUrl => AppConfig.profileServiceUrl;

  /// Build a versioned profile service URL
  String _url(String path) => AppConfig.profileUrl(path);

  // ===== PROFILE METHODS =====

  /// Get the user's After Hours profile
  ///
  /// Returns null if no profile exists or on error
  Future<AfterHoursProfile?> getProfile() async {
    try {
      final response = await authenticatedGet(
        Uri.parse(_url('/after-hours/profile')),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['profile'] != null) {
          _profile = AfterHoursProfile.fromJson(data['profile']);
          notifyListeners();
          return _profile;
        }
      } else if (response.statusCode == 404) {
        // Profile doesn't exist yet - this is normal
        _profile = null;
        notifyListeners();
        return null;
      }

      // debugPrint('Failed to get After Hours profile: ${response.statusCode}');
      return null;
    } catch (e) {
      // debugPrint('Error getting After Hours profile: $e');
      return null;
    }
  }

  /// Create a new After Hours profile
  ///
  /// Bio is required. Photo should be uploaded separately.
  Future<AfterHoursProfile?> createProfile({required String bio}) async {
    try {
      final response = await authenticatedPost(
        Uri.parse(_url('/after-hours/profile')),
        body: json.encode({'bio': bio}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['profile'] != null) {
          _profile = AfterHoursProfile.fromJson(data['profile']);
          notifyListeners();
          return _profile;
        }
      }

      // debugPrint('Failed to create After Hours profile: ${response.statusCode}');
      // debugPrint('Response: ${response.body}');
      return null;
    } catch (e) {
      // debugPrint('Error creating After Hours profile: $e');
      return null;
    }
  }

  /// Update the After Hours profile
  ///
  /// Only provided fields will be updated
  Future<AfterHoursProfile?> updateProfile({String? bio}) async {
    try {
      final body = <String, dynamic>{};
      if (bio != null) body['bio'] = bio;

      final response = await authenticatedPatch(
        Uri.parse(_url('/after-hours/profile')),
        body: json.encode(body),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['profile'] != null) {
          _profile = AfterHoursProfile.fromJson(data['profile']);
          notifyListeners();
          return _profile;
        }
      }

      // debugPrint('Failed to update After Hours profile: ${response.statusCode}');
      return null;
    } catch (e) {
      // debugPrint('Error updating After Hours profile: $e');
      return null;
    }
  }

  /// Upload a photo for the After Hours profile
  ///
  /// Returns the URL of the uploaded photo, or null on error
  Future<String?> uploadPhoto(File imageFile) async {
    try {
      final uri = Uri.parse(_url('/after-hours/profile/photo'));
      final request = http.MultipartRequest('POST', uri);

      // Add authorization header
      final token = authService.token;
      if (token == null) {
        // debugPrint('Cannot upload photo: no auth token');
        return null;
      }
      request.headers['Authorization'] = 'Bearer $token';

      // Add file
      final fileName = imageFile.path.split('/').last;
      final mimeType = _getMimeType(fileName);

      request.files.add(
        await http.MultipartFile.fromPath(
          'photo',
          imageFile.path,
          contentType: mimeType,
        ),
      );

      // Send request
      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          final photoUrl = data['photo_url'] as String?;
          if (photoUrl != null && _profile != null) {
            _profile = _profile!.copyWith(photoUrl: photoUrl);
            notifyListeners();
          }
          return photoUrl;
        }
      }

      // debugPrint('Failed to upload After Hours photo: ${response.statusCode}');
      // debugPrint('Response: ${response.body}');
      return null;
    } catch (e) {
      // debugPrint('Error uploading After Hours photo: $e');
      return null;
    }
  }

  /// Get MIME type from file extension
  MediaType _getMimeType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return MediaType('image', 'jpeg');
      case 'png':
        return MediaType('image', 'png');
      case 'heic':
        return MediaType('image', 'heic');
      case 'heif':
        return MediaType('image', 'heif');
      case 'webp':
        return MediaType('image', 'webp');
      default:
        return MediaType('image', 'jpeg');
    }
  }

  // ===== PREFERENCES METHODS =====

  /// Get the user's After Hours preferences
  ///
  /// Returns null if no preferences exist or on error
  Future<AfterHoursPreferences?> getPreferences() async {
    try {
      final response = await authenticatedGet(
        Uri.parse(_url('/after-hours/preferences')),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['preferences'] != null) {
          _preferences = AfterHoursPreferences.fromJson(data['preferences']);
          notifyListeners();
          return _preferences;
        }
      } else if (response.statusCode == 404) {
        // Preferences don't exist yet - this is normal
        _preferences = null;
        notifyListeners();
        return null;
      }

      // debugPrint('Failed to get After Hours preferences: ${response.statusCode}');
      return null;
    } catch (e) {
      // debugPrint('Error getting After Hours preferences: $e');
      return null;
    }
  }

  /// Create new After Hours preferences
  ///
  /// All fields are optional - server applies smart defaults from main profile
  Future<AfterHoursPreferences?> createPreferences({
    String? genderSeeking,
    int? minAge,
    int? maxAge,
    double? maxDistanceKm,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (genderSeeking != null) body['gender_seeking'] = genderSeeking;
      if (minAge != null) body['min_age'] = minAge;
      if (maxAge != null) body['max_age'] = maxAge;
      if (maxDistanceKm != null) body['max_distance_km'] = maxDistanceKm;

      final response = await authenticatedPost(
        Uri.parse(_url('/after-hours/preferences')),
        body: json.encode(body),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['preferences'] != null) {
          _preferences = AfterHoursPreferences.fromJson(data['preferences']);
          notifyListeners();
          return _preferences;
        }
      }

      // debugPrint('Failed to create After Hours preferences: ${response.statusCode}');
      // debugPrint('Response: ${response.body}');
      return null;
    } catch (e) {
      // debugPrint('Error creating After Hours preferences: $e');
      return null;
    }
  }

  /// Update After Hours preferences
  ///
  /// Only provided fields will be updated
  Future<AfterHoursPreferences?> updatePreferences({
    String? genderSeeking,
    int? minAge,
    int? maxAge,
    double? maxDistanceKm,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (genderSeeking != null) body['gender_seeking'] = genderSeeking;
      if (minAge != null) body['min_age'] = minAge;
      if (maxAge != null) body['max_age'] = maxAge;
      if (maxDistanceKm != null) body['max_distance_km'] = maxDistanceKm;

      final response = await authenticatedPatch(
        Uri.parse(_url('/after-hours/preferences')),
        body: json.encode(body),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['preferences'] != null) {
          _preferences = AfterHoursPreferences.fromJson(data['preferences']);
          notifyListeners();
          return _preferences;
        }
      }

      // debugPrint('Failed to update After Hours preferences: ${response.statusCode}');
      return null;
    } catch (e) {
      // debugPrint('Error updating After Hours preferences: $e');
      return null;
    }
  }

  // ===== UTILITY METHODS =====

  /// Load both profile and preferences
  ///
  /// Useful for initial setup check on screen load
  Future<void> loadAll() async {
    _isLoading = true;
    notifyListeners();

    try {
      await Future.wait([
        getProfile(),
        getPreferences(),
      ]);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Clear cached profile and preferences
  ///
  /// Called when user logs out or for testing
  void clearCache() {
    _profile = null;
    _preferences = null;
    _isLoading = false;
    notifyListeners();
  }

  /// Make a PATCH request with automatic 401 retry after token refresh
  @protected
  Future<http.Response> authenticatedPatch(Uri uri, {Object? body}) async {
    final encodedBody = body is String ? body : json.encode(body);
    final headers = {
      'Content-Type': 'application/json',
      if (authService.token != null) 'Authorization': 'Bearer ${authService.token}',
    };

    var response = await http.patch(uri, headers: headers, body: encodedBody);

    if (response.statusCode == 401) {
      // debugPrint('Got 401, attempting token refresh...');
      final refreshed = await authService.refreshToken();
      if (refreshed) {
        // debugPrint('Token refreshed, retrying request...');
        final newHeaders = {
          'Content-Type': 'application/json',
          if (authService.token != null) 'Authorization': 'Bearer ${authService.token}',
        };
        response = await http.patch(uri, headers: newHeaders, body: encodedBody);
      }
    }

    return response;
  }
}
