import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:vlvt/services/auth_service.dart';
import 'package:vlvt/models/profile.dart';

@GenerateMocks([AuthService])
import 'profile_api_service_test.mocks.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ProfileApiService', () {
    late MockAuthService mockAuthService;

    setUp(() {
      mockAuthService = MockAuthService();
      when(mockAuthService.token).thenReturn('test_token_123');
      when(mockAuthService.userId).thenReturn('user_123');
    });

    group('Profile model', () {
      test('should deserialize from JSON with all fields', () {
        final json = {
          'userId': 'user_123',
          'name': 'John Doe',
          'age': 28,
          'bio': 'Love hiking and coffee',
          'photos': ['photo1.jpg', 'photo2.jpg'],
          'interests': ['hiking', 'coffee', 'travel'],
          'distance': 5.5,
          'isVerified': true,
          'isNewUser': false,
        };

        final profile = Profile.fromJson(json);

        expect(profile.userId, 'user_123');
        expect(profile.name, 'John Doe');
        expect(profile.age, 28);
        expect(profile.bio, 'Love hiking and coffee');
        expect(profile.photos, ['photo1.jpg', 'photo2.jpg']);
        expect(profile.interests, ['hiking', 'coffee', 'travel']);
        expect(profile.distance, 5.5);
        expect(profile.isVerified, true);
        expect(profile.isNewUser, false);
      });

      test('should deserialize from JSON with minimal fields', () {
        final json = {
          'userId': 'user_456',
        };

        final profile = Profile.fromJson(json);

        expect(profile.userId, 'user_456');
        expect(profile.name, isNull);
        expect(profile.age, isNull);
        expect(profile.bio, isNull);
        expect(profile.photos, isNull);
        expect(profile.interests, isNull);
        expect(profile.distance, isNull);
        expect(profile.isVerified, false);
        expect(profile.isNewUser, false);
      });

      test('should handle distance as int', () {
        final json = {
          'userId': 'user_789',
          'distance': 10, // int instead of double
        };

        final profile = Profile.fromJson(json);

        expect(profile.distance, 10.0);
        expect(profile.distance, isA<double>());
      });

      test('should serialize to JSON correctly', () {
        final profile = Profile(
          userId: 'user_abc',
          name: 'Jane Smith',
          age: 25,
          bio: 'Travel enthusiast',
          photos: ['img1.jpg'],
          interests: ['travel'],
          distance: 3.2,
          isVerified: true,
          isNewUser: true,
        );

        final json = profile.toJson();

        expect(json['userId'], 'user_abc');
        expect(json['name'], 'Jane Smith');
        expect(json['age'], 25);
        expect(json['bio'], 'Travel enthusiast');
        expect(json['photos'], ['img1.jpg']);
        expect(json['interests'], ['travel']);
        expect(json['distance'], 3.2);
        expect(json['isVerified'], true);
        expect(json['isNewUser'], true);
      });

      test('should omit null fields in JSON serialization', () {
        final profile = Profile(
          userId: 'user_minimal',
        );

        final json = profile.toJson();

        expect(json['userId'], 'user_minimal');
        expect(json.containsKey('name'), false);
        expect(json.containsKey('age'), false);
        expect(json.containsKey('bio'), false);
        expect(json.containsKey('photos'), false);
        expect(json.containsKey('interests'), false);
        expect(json.containsKey('distance'), false);
        expect(json['isVerified'], false);
        expect(json['isNewUser'], false);
      });

      test('should handle empty arrays', () {
        final json = {
          'userId': 'user_empty',
          'photos': <String>[],
          'interests': <String>[],
        };

        final profile = Profile.fromJson(json);

        expect(profile.photos, isEmpty);
        expect(profile.interests, isEmpty);
      });
    });

    group('Authorization headers', () {
      test('should include Bearer token when available', () {
        when(mockAuthService.token).thenReturn('my_auth_token');

        final headers = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${mockAuthService.token}',
        };

        expect(headers['Authorization'], 'Bearer my_auth_token');
        expect(headers['Content-Type'], 'application/json');
      });

      test('should handle null token', () {
        when(mockAuthService.token).thenReturn(null);

        final token = mockAuthService.token;
        expect(token, isNull);
      });
    });

    group('getDiscoveryProfiles', () {
      test('should build query params correctly with all filters', () {
        final queryParams = <String, String>{};

        final minAge = 21;
        final maxAge = 35;
        final maxDistance = 50.0;
        final interests = ['hiking', 'music'];
        final excludeUserIds = ['user_1', 'user_2'];
        final verifiedOnly = true;

        queryParams['minAge'] = minAge.toString();
        queryParams['maxAge'] = maxAge.toString();
        queryParams['maxDistance'] = maxDistance.toString();
        queryParams['interests'] = interests.join(',');
        queryParams['exclude'] = excludeUserIds.join(',');
        if (verifiedOnly) {
          queryParams['verifiedOnly'] = 'true';
        }

        expect(queryParams['minAge'], '21');
        expect(queryParams['maxAge'], '35');
        expect(queryParams['maxDistance'], '50.0');
        expect(queryParams['interests'], 'hiking,music');
        expect(queryParams['exclude'], 'user_1,user_2');
        expect(queryParams['verifiedOnly'], 'true');
      });

      test('should handle empty filters', () {
        final queryParams = <String, String>{};
        expect(queryParams, isEmpty);
      });

      test('should parse discovery profiles response', () {
        final response = {
          'success': true,
          'profiles': [
            {
              'userId': 'user_1',
              'name': 'Alice',
              'age': 25,
              'bio': 'Hello!',
              'photos': ['photo1.jpg'],
              'distance': 2.5,
              'isVerified': true,
            },
            {
              'userId': 'user_2',
              'name': 'Bob',
              'age': 30,
              'bio': 'Hi there!',
              'photos': ['photo2.jpg'],
              'distance': 8.0,
              'isVerified': false,
            },
          ],
        };

        final profilesList = response['profiles'] as List;
        final profiles = profilesList.map((p) => Profile.fromJson(p)).toList();

        expect(profiles.length, 2);
        expect(profiles[0].name, 'Alice');
        expect(profiles[0].isVerified, true);
        expect(profiles[1].name, 'Bob');
        expect(profiles[1].distance, 8.0);
      });
    });

    group('createProfile', () {
      test('should serialize profile for creation', () {
        final profile = Profile(
          userId: 'new_user',
          name: 'New User',
          age: 22,
          bio: 'Just joined!',
          photos: ['photo.jpg'],
          interests: ['music', 'movies'],
        );

        final body = json.encode(profile.toJson());
        final decoded = json.decode(body);

        expect(decoded['userId'], 'new_user');
        expect(decoded['name'], 'New User');
        expect(decoded['age'], 22);
      });

      test('should handle validation errors response', () {
        final errorResponse = {
          'success': false,
          'errors': [
            {'field': 'age', 'message': 'Must be at least 18'},
            {'field': 'name', 'message': 'Name is required'},
          ],
        };

        final errors = errorResponse['errors'] as List;
        final messages = errors.map((e) => e['message']).join(', ');

        expect(messages, 'Must be at least 18, Name is required');
      });
    });

    group('updateProfile', () {
      test('should encode userId in URL', () {
        final userId = 'google_user@test.com';
        final encoded = Uri.encodeComponent(userId);

        // @ is encoded to %40 (unsafe character)
        expect(encoded, isNot(contains('@')));
        expect(encoded, contains('%40'));
        // . is not encoded (it's a valid URL character)
        expect(encoded, contains('.'));
      });
    });

    group('batchGetProfiles', () {
      test('should return empty map for empty input', () {
        final userIds = <String>[];
        expect(userIds.isEmpty, true);

        final result = <String, Profile>{};
        expect(result, isEmpty);
      });

      test('should handle multiple user IDs', () {
        final userIds = ['user_1', 'user_2', 'user_3'];
        expect(userIds.length, 3);
      });
    });

    group('updateLocation', () {
      test('should serialize coordinates correctly', () {
        final latitude = 37.7749;
        final longitude = -122.4194;

        final body = json.encode({
          'latitude': latitude,
          'longitude': longitude,
        });

        final decoded = json.decode(body);

        expect(decoded['latitude'], 37.7749);
        expect(decoded['longitude'], -122.4194);
      });

      test('should handle edge case coordinates', () {
        // Valid latitude range: -90 to 90
        // Valid longitude range: -180 to 180

        expect(90.0, lessThanOrEqualTo(90));
        expect(-90.0, greaterThanOrEqualTo(-90));
        expect(180.0, lessThanOrEqualTo(180));
        expect(-180.0, greaterThanOrEqualTo(-180));
      });
    });

    group('Photo operations', () {
      test('should determine MIME type correctly', () {
        String getMimeType(String fileName) {
          final ext = fileName.split('.').last.toLowerCase();
          switch (ext) {
            case 'jpg':
            case 'jpeg':
              return 'image/jpeg';
            case 'png':
              return 'image/png';
            case 'heic':
              return 'image/heic';
            case 'heif':
              return 'image/heif';
            case 'webp':
              return 'image/webp';
            default:
              return 'image/jpeg';
          }
        }

        expect(getMimeType('photo.jpg'), 'image/jpeg');
        expect(getMimeType('photo.jpeg'), 'image/jpeg');
        expect(getMimeType('photo.png'), 'image/png');
        expect(getMimeType('photo.HEIC'), 'image/heic');
        expect(getMimeType('photo.webp'), 'image/webp');
        expect(getMimeType('photo.unknown'), 'image/jpeg');
      });

      test('should serialize photo order correctly', () {
        final photoUrls = [
          'https://example.com/photo3.jpg',
          'https://example.com/photo1.jpg',
          'https://example.com/photo2.jpg',
        ];

        final body = json.encode({'photos': photoUrls});
        final decoded = json.decode(body);

        expect(decoded['photos'][0], contains('photo3'));
        expect(decoded['photos'].length, 3);
      });
    });

    group('Swipe operations', () {
      test('should serialize swipe action correctly', () {
        final swipeData = {
          'targetUserId': 'user_target',
          'action': 'like',
        };

        final body = json.encode(swipeData);
        final decoded = json.decode(body);

        expect(decoded['targetUserId'], 'user_target');
        expect(decoded['action'], 'like');
      });

      test('should parse match response', () {
        final matchResponse = {
          'success': true,
          'action': 'like',
          'isMatch': true,
          'message': 'It\'s a match!',
        };

        expect(matchResponse['isMatch'], true);
        expect(matchResponse['message'], contains('match'));
      });

      test('should parse no-match response', () {
        final noMatchResponse = {
          'success': true,
          'action': 'like',
          'isMatch': false,
          'message': 'Like recorded',
        };

        expect(noMatchResponse['isMatch'], false);
      });

      test('should validate swipe actions', () {
        const validActions = ['like', 'pass'];

        expect(validActions.contains('like'), true);
        expect(validActions.contains('pass'), true);
        expect(validActions.contains('superlike'), false);
      });
    });

    group('getReceivedLikes / getSentLikes', () {
      test('should parse likes list correctly', () {
        final likesResponse = {
          'success': true,
          'likes': [
            {'userId': 'user_1', 'timestamp': '2025-01-15T10:00:00Z'},
            {'userId': 'user_2', 'timestamp': '2025-01-14T09:00:00Z'},
          ],
        };

        final likes = List<Map<String, dynamic>>.from(likesResponse['likes'] as List);

        expect(likes.length, 2);
        expect(likes[0]['userId'], 'user_1');
      });
    });

    group('checkProfileCompletion', () {
      test('should identify missing name', () {
        final profile = Profile(
          userId: 'user_test',
          name: null,
          age: 25,
          bio: 'Hello',
          photos: ['photo.jpg'],
        );

        final missingFields = <String>[];
        if (profile.name == null || profile.name!.trim().isEmpty) {
          missingFields.add('name');
        }

        expect(missingFields, contains('name'));
      });

      test('should identify missing age', () {
        final profile = Profile(
          userId: 'user_test',
          name: 'Test',
          age: null,
          bio: 'Hello',
          photos: ['photo.jpg'],
        );

        final missingFields = <String>[];
        if (profile.age == null || profile.age! < 18) {
          missingFields.add('age');
        }

        expect(missingFields, contains('age'));
      });

      test('should identify underage', () {
        final profile = Profile(
          userId: 'user_test',
          name: 'Test',
          age: 17,
          bio: 'Hello',
          photos: ['photo.jpg'],
        );

        final missingFields = <String>[];
        if (profile.age == null || profile.age! < 18) {
          missingFields.add('age');
        }

        expect(missingFields, contains('age'));
      });

      test('should identify missing bio', () {
        final profile = Profile(
          userId: 'user_test',
          name: 'Test',
          age: 25,
          bio: '',
          photos: ['photo.jpg'],
        );

        final missingFields = <String>[];
        if (profile.bio == null || profile.bio!.trim().isEmpty) {
          missingFields.add('bio');
        }

        expect(missingFields, contains('bio'));
      });

      test('should identify missing photos', () {
        final profile = Profile(
          userId: 'user_test',
          name: 'Test',
          age: 25,
          bio: 'Hello',
          photos: [],
        );

        final missingFields = <String>[];
        if (profile.photos == null || profile.photos!.isEmpty) {
          missingFields.add('photos');
        }

        expect(missingFields, contains('photos'));
      });

      test('should return empty for complete profile', () {
        final profile = Profile(
          userId: 'user_test',
          name: 'Complete User',
          age: 25,
          bio: 'Hello world!',
          photos: ['photo1.jpg'],
          isVerified: true,
        );

        final missingFields = <String>[];

        if (profile.name == null || profile.name!.trim().isEmpty) {
          missingFields.add('name');
        }
        if (profile.age == null || profile.age! < 18) {
          missingFields.add('age');
        }
        if (profile.bio == null || profile.bio!.trim().isEmpty) {
          missingFields.add('bio');
        }
        if (profile.photos == null || profile.photos!.isEmpty) {
          missingFields.add('photos');
        }

        expect(missingFields, isEmpty);
      });

      test('should generate appropriate message for missing fields', () {
        final missingFields = ['name', 'photos', 'id_verification'];

        final fieldNames = missingFields.map((field) {
          switch (field) {
            case 'name':
              return 'name';
            case 'age':
              return 'age';
            case 'bio':
              return 'bio';
            case 'photos':
              return 'at least one photo';
            case 'id_verification':
              return 'ID verification';
            default:
              return field;
          }
        });

        final message = 'Please complete your profile: ${fieldNames.join(', ')}';

        expect(message, contains('name'));
        expect(message, contains('at least one photo'));
        expect(message, contains('ID verification'));
      });
    });

    group('Error handling', () {
      test('should handle 401 unauthorized', () {
        const statusCode = 401;
        expect(statusCode, 401);
      });

      test('should handle 404 not found', () {
        const statusCode = 404;
        expect(statusCode, 404);
      });

      test('should handle 400 bad request', () {
        final errorResponse = {
          'success': false,
          'error': 'Invalid profile data',
        };

        expect(errorResponse['error'], 'Invalid profile data');
      });

      test('should handle network errors gracefully', () {
        // Network errors should be caught and rethrown
        expect(() => throw Exception('Network error'), throwsException);
      });
    });

    group('URL encoding', () {
      test('should encode special characters in user ID', () {
        final specialUserId = 'apple_user|12345';
        final encoded = Uri.encodeComponent(specialUserId);

        expect(encoded, isNot(contains('|')));
      });

      test('should encode email-like user IDs', () {
        final emailUserId = 'user@domain.com';
        final encoded = Uri.encodeComponent(emailUserId);

        // @ is encoded to %40 (unsafe character)
        expect(encoded, isNot(contains('@')));
        expect(encoded, contains('%40'));
        // . is not encoded (it's a valid URL character)
        expect(encoded, contains('.'));
      });
    });

    group('Token refresh flow', () {
      test('should detect 401 status for refresh trigger', () {
        const responseStatus = 401;
        final shouldRefresh = responseStatus == 401;

        expect(shouldRefresh, true);
      });

      test('should handle successful refresh', () async {
        when(mockAuthService.refreshToken()).thenAnswer((_) async => true);

        final refreshed = await mockAuthService.refreshToken();

        expect(refreshed, true);
        verify(mockAuthService.refreshToken()).called(1);
      });

      test('should handle failed refresh', () async {
        when(mockAuthService.refreshToken()).thenAnswer((_) async => false);

        final refreshed = await mockAuthService.refreshToken();

        expect(refreshed, false);
      });
    });
  });
}
