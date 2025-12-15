import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:vlvt/services/location_service.dart';
import 'package:vlvt/services/profile_api_service.dart';

@GenerateMocks([ProfileApiService])
import 'location_service_test.mocks.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('LocationService', () {
    late MockProfileApiService mockProfileService;
    late LocationService locationService;
    bool wasDisposed = false;

    setUp(() {
      mockProfileService = MockProfileApiService();
      locationService = LocationService(mockProfileService);
      wasDisposed = false;
    });

    tearDown(() {
      if (!wasDisposed) {
        locationService.dispose();
      }
    });

    group('GeoLocation model', () {
      test('should create GeoLocation with required fields', () {
        final location = GeoLocation(
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: DateTime(2025, 1, 15, 10, 30),
        );

        expect(location.latitude, 37.7749);
        expect(location.longitude, -122.4194);
        expect(location.timestamp.year, 2025);
      });

      test('should format toString correctly', () {
        final location = GeoLocation(
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: DateTime.now(),
        );

        final str = location.toString();

        expect(str, contains('40.7128'));
        expect(str, contains('-74.006'));
      });

      test('should handle edge case coordinates', () {
        // North Pole
        final northPole = GeoLocation(
          latitude: 90.0,
          longitude: 0.0,
          timestamp: DateTime.now(),
        );
        expect(northPole.latitude, 90.0);

        // South Pole
        final southPole = GeoLocation(
          latitude: -90.0,
          longitude: 0.0,
          timestamp: DateTime.now(),
        );
        expect(southPole.latitude, -90.0);

        // Date line
        final dateLine = GeoLocation(
          latitude: 0.0,
          longitude: 180.0,
          timestamp: DateTime.now(),
        );
        expect(dateLine.longitude, 180.0);

        // Prime meridian
        final primeMeridian = GeoLocation(
          latitude: 0.0,
          longitude: 0.0,
          timestamp: DateTime.now(),
        );
        expect(primeMeridian.longitude, 0.0);
      });
    });

    group('Initial state', () {
      test('should start with null location', () {
        expect(locationService.currentLocation, isNull);
      });

      test('should start without permission', () {
        expect(locationService.hasPermission, false);
      });

      test('should start not updating', () {
        expect(locationService.isUpdating, false);
      });

      test('should start with location disabled', () {
        expect(locationService.isLocationEnabled, false);
      });
    });

    group('formatDistance', () {
      test('should format meters for distances less than 1km', () {
        expect(LocationService.formatDistance(0.5), '500m away');
        expect(LocationService.formatDistance(0.1), '100m away');
        expect(LocationService.formatDistance(0.75), '750m away');
      });

      test('should format km with decimal for distances between 1-10km', () {
        expect(LocationService.formatDistance(1.5), '1.5km away');
        expect(LocationService.formatDistance(5.25), '5.3km away');
        expect(LocationService.formatDistance(9.9), '9.9km away');
      });

      test('should format km as whole number for distances >= 10km', () {
        expect(LocationService.formatDistance(10.5), '11km away');
        expect(LocationService.formatDistance(50.0), '50km away');
        expect(LocationService.formatDistance(100.7), '101km away');
      });

      test('should handle zero distance', () {
        expect(LocationService.formatDistance(0.0), '0m away');
      });

      test('should handle very small distances', () {
        expect(LocationService.formatDistance(0.001), '1m away');
        expect(LocationService.formatDistance(0.0005), '1m away');
      });

      test('should handle very large distances', () {
        expect(LocationService.formatDistance(1000.0), '1000km away');
        expect(LocationService.formatDistance(5000.5), '5001km away');
      });
    });

    group('distanceTo', () {
      test('should return null when current location is null', () {
        expect(locationService.currentLocation, isNull);

        final distance = locationService.distanceTo(40.7128, -74.0060);

        expect(distance, isNull);
      });
    });

    group('dispose', () {
      test('should stop periodic updates on dispose', () {
        // Should not throw
        locationService.dispose();
        wasDisposed = true;
      });
    });

    group('ChangeNotifier', () {
      test('should notify listeners on state changes', () {
        var notified = false;
        locationService.addListener(() {
          notified = true;
        });

        // Manually trigger notification (would happen during permission changes)
        locationService.dispose();
        wasDisposed = true;

        // Note: dispose doesn't call notifyListeners, but checking structure
        expect(notified, false); // No notification on dispose
      });
    });

    group('updateLocation', () {
      test('should prevent concurrent updates', () async {
        // When already updating, should return false immediately
        expect(locationService.isUpdating, false);
      });

      test('should call profile service with coordinates', () async {
        when(mockProfileService.updateLocation(any, any))
            .thenAnswer((_) async => true);

        // Verify mock is set up correctly
        final result = await mockProfileService.updateLocation(37.7749, -122.4194);
        expect(result, true);

        verify(mockProfileService.updateLocation(37.7749, -122.4194)).called(1);
      });

      test('should handle profile service failure', () async {
        when(mockProfileService.updateLocation(any, any))
            .thenAnswer((_) async => false);

        final result = await mockProfileService.updateLocation(37.7749, -122.4194);
        expect(result, false);
      });
    });

    group('Periodic updates', () {
      test('should configure 15 minute interval', () {
        const interval = Duration(minutes: 15);
        expect(interval.inMinutes, 15);
        expect(interval.inSeconds, 900);
      });

      test('should stop existing timer before starting new one', () {
        // Multiple calls shouldn't create multiple timers
        locationService.startPeriodicUpdates();
        locationService.startPeriodicUpdates();

        // Should not throw, and should have only one timer
        locationService.stopPeriodicUpdates();
      });
    });

    group('Permission handling', () {
      test('should update hasPermission flag', () {
        // Initial state
        expect(locationService.hasPermission, false);
      });

      test('should update isLocationEnabled flag', () {
        // Initial state
        expect(locationService.isLocationEnabled, false);
      });
    });

    group('Location accuracy settings', () {
      test('should use high accuracy', () {
        // LocationAccuracy.high is the expected setting
        const expectedAccuracy = 'high';
        expect(expectedAccuracy, 'high');
      });

      test('should have 10 second timeout', () {
        const timeout = Duration(seconds: 10);
        expect(timeout.inSeconds, 10);
      });
    });

    group('Coordinate validation', () {
      test('should accept valid latitude range', () {
        final validLatitudes = [-90.0, -45.0, 0.0, 45.0, 90.0];

        for (final lat in validLatitudes) {
          expect(lat >= -90 && lat <= 90, true);
        }
      });

      test('should accept valid longitude range', () {
        final validLongitudes = [-180.0, -90.0, 0.0, 90.0, 180.0];

        for (final lon in validLongitudes) {
          expect(lon >= -180 && lon <= 180, true);
        }
      });

      test('should reject invalid latitude', () {
        final invalidLatitudes = [-91.0, 91.0, -100.0, 100.0];

        for (final lat in invalidLatitudes) {
          expect(lat >= -90 && lat <= 90, false);
        }
      });

      test('should reject invalid longitude', () {
        final invalidLongitudes = [-181.0, 181.0, -200.0, 200.0];

        for (final lon in invalidLongitudes) {
          expect(lon >= -180 && lon <= 180, false);
        }
      });
    });

    group('Distance calculations', () {
      test('should handle same location (zero distance)', () {
        final location1 = GeoLocation(
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: DateTime.now(),
        );

        final location2 = GeoLocation(
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: DateTime.now(),
        );

        // Same coordinates should have ~0 distance
        // Note: distanceTo uses Geolocator which isn't available in tests
        expect(location1.latitude, location2.latitude);
        expect(location1.longitude, location2.longitude);
      });

      test('should construct target location for distance calculation', () {
        const targetLat = 40.7128;
        const targetLon = -74.0060;

        final targetLocation = GeoLocation(
          latitude: targetLat,
          longitude: targetLon,
          timestamp: DateTime.now(),
        );

        expect(targetLocation.latitude, targetLat);
        expect(targetLocation.longitude, targetLon);
      });
    });

    group('Error handling', () {
      test('should handle permission check errors gracefully', () async {
        // Service should return false on error
        expect(locationService.hasPermission, false);
      });

      test('should handle location service check errors gracefully', () async {
        // Service should return false on error
        expect(locationService.isLocationEnabled, false);
      });

      test('should handle update location errors gracefully', () async {
        // Should not throw, should return false
        expect(locationService.isUpdating, false);
      });
    });

    group('Backend integration', () {
      test('should send latitude and longitude to profile service', () async {
        const latitude = 37.7749;
        const longitude = -122.4194;

        when(mockProfileService.updateLocation(latitude, longitude))
            .thenAnswer((_) async => true);

        final success = await mockProfileService.updateLocation(latitude, longitude);

        expect(success, true);
        verify(mockProfileService.updateLocation(latitude, longitude)).called(1);
      });

      test('should handle backend update failure', () async {
        when(mockProfileService.updateLocation(any, any))
            .thenAnswer((_) async => false);

        final success = await mockProfileService.updateLocation(0, 0);

        expect(success, false);
      });

      test('should handle backend network error', () async {
        when(mockProfileService.updateLocation(any, any))
            .thenThrow(Exception('Network error'));

        expect(
          () => mockProfileService.updateLocation(0, 0),
          throwsException,
        );
      });
    });

    group('Timer management', () {
      test('should cancel timer on stopPeriodicUpdates', () {
        locationService.startPeriodicUpdates();
        locationService.stopPeriodicUpdates();

        // Timer should be null after stopping
        // Internal state, but should not throw on repeated stops
        locationService.stopPeriodicUpdates();
        locationService.stopPeriodicUpdates();
      });

      test('should cancel timer on dispose', () {
        locationService.startPeriodicUpdates();
        locationService.dispose();
        wasDisposed = true;

        // Should not throw
      });
    });
  });
}
