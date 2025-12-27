import 'package:flutter_test/flutter_test.dart';
import 'package:vlvt/services/pinned_http_client.dart';

void main() {
  group('CertificatePinningConfig', () {
    group('hasPinForHost', () {
      test('should return true for vlvtauth.up.railway.app', () {
        expect(
          CertificatePinningConfig.hasPinForHost('vlvtauth.up.railway.app'),
          isTrue,
        );
      });

      test('should return true for vlvtprofiles.up.railway.app', () {
        expect(
          CertificatePinningConfig.hasPinForHost('vlvtprofiles.up.railway.app'),
          isTrue,
        );
      });

      test('should return true for vlvtchat.up.railway.app', () {
        expect(
          CertificatePinningConfig.hasPinForHost('vlvtchat.up.railway.app'),
          isTrue,
        );
      });

      test('should return false for unknown production hosts', () {
        expect(
          CertificatePinningConfig.hasPinForHost('unknown.railway.app'),
          isFalse,
        );
      });

      test('should return false for arbitrary domains', () {
        expect(
          CertificatePinningConfig.hasPinForHost('example.com'),
          isFalse,
        );
      });

      test('should return false for localhost', () {
        expect(
          CertificatePinningConfig.hasPinForHost('localhost'),
          isFalse,
        );
      });

      test('should return false for Android emulator localhost', () {
        expect(
          CertificatePinningConfig.hasPinForHost('10.0.2.2'),
          isFalse,
        );
      });
    });

    group('getPinsForHost', () {
      test('should return pins for vlvtauth.up.railway.app', () {
        final pins = CertificatePinningConfig.getPinsForHost(
          'vlvtauth.up.railway.app',
        );
        expect(pins, isNotNull);
        expect(pins, isNotEmpty);
        expect(pins!.length, greaterThanOrEqualTo(1));
      });

      test('should return pins for vlvtprofiles.up.railway.app', () {
        final pins = CertificatePinningConfig.getPinsForHost(
          'vlvtprofiles.up.railway.app',
        );
        expect(pins, isNotNull);
        expect(pins, isNotEmpty);
      });

      test('should return pins for vlvtchat.up.railway.app', () {
        final pins = CertificatePinningConfig.getPinsForHost(
          'vlvtchat.up.railway.app',
        );
        expect(pins, isNotNull);
        expect(pins, isNotEmpty);
      });

      test('should return null for unknown hosts', () {
        final pins = CertificatePinningConfig.getPinsForHost('unknown.com');
        expect(pins, isNull);
      });

      test('pins should be valid SHA-256 format (64 hex characters)', () {
        for (final host in CertificatePinningConfig.pinnedHosts) {
          final pins = CertificatePinningConfig.getPinsForHost(host);
          expect(pins, isNotNull, reason: 'Pins should exist for $host');

          for (final pin in pins!) {
            // SHA-256 fingerprints are 64 hex characters
            // (or placeholder text for development)
            if (!pin.startsWith('PLACEHOLDER')) {
              expect(
                pin.length,
                equals(64),
                reason: 'Pin for $host should be 64 characters: $pin',
              );
              expect(
                RegExp(r'^[A-F0-9]+$').hasMatch(pin),
                isTrue,
                reason: 'Pin for $host should be uppercase hex: $pin',
              );
            }
          }
        }
      });
    });

    group('shouldBypassPinning', () {
      // Note: These tests run in debug mode, so bypass should be enabled
      // for development hosts

      test('should bypass localhost in debug mode', () {
        // In debug mode (which these tests run in), localhost should be bypassed
        expect(
          CertificatePinningConfig.shouldBypassPinning('localhost'),
          isTrue,
        );
      });

      test('should bypass 127.0.0.1 in debug mode', () {
        expect(
          CertificatePinningConfig.shouldBypassPinning('127.0.0.1'),
          isTrue,
        );
      });

      test('should bypass 10.0.2.2 (Android emulator) in debug mode', () {
        expect(
          CertificatePinningConfig.shouldBypassPinning('10.0.2.2'),
          isTrue,
        );
      });

      test('should bypass localhost with port in debug mode', () {
        expect(
          CertificatePinningConfig.shouldBypassPinning('localhost:3001'),
          isTrue,
        );
      });

      test('should not bypass production hosts', () {
        expect(
          CertificatePinningConfig.shouldBypassPinning(
            'vlvtauth.up.railway.app',
          ),
          isFalse,
        );
      });

      test('should not bypass arbitrary external hosts', () {
        expect(
          CertificatePinningConfig.shouldBypassPinning('example.com'),
          isFalse,
        );
      });
    });

    group('pinnedHosts constant', () {
      test('should contain all three Railway production hosts', () {
        expect(CertificatePinningConfig.pinnedHosts, contains('vlvtauth.up.railway.app'));
        expect(CertificatePinningConfig.pinnedHosts, contains('vlvtprofiles.up.railway.app'));
        expect(CertificatePinningConfig.pinnedHosts, contains('vlvtchat.up.railway.app'));
      });

      test('should have exactly 3 pinned hosts', () {
        expect(CertificatePinningConfig.pinnedHosts.length, equals(3));
      });
    });

    group('developmentBypassHosts constant', () {
      test('should contain localhost variants', () {
        expect(
          CertificatePinningConfig.developmentBypassHosts,
          contains('localhost'),
        );
        expect(
          CertificatePinningConfig.developmentBypassHosts,
          contains('127.0.0.1'),
        );
        expect(
          CertificatePinningConfig.developmentBypassHosts,
          contains('10.0.2.2'),
        );
      });
    });
  });

  group('CertificatePinningException', () {
    test('should create exception with message and host', () {
      final exception = CertificatePinningException(
        message: 'Certificate mismatch',
        host: 'vlvtauth.up.railway.app',
      );

      expect(exception.message, equals('Certificate mismatch'));
      expect(exception.host, equals('vlvtauth.up.railway.app'));
      expect(exception.actualFingerprint, isNull);
    });

    test('should create exception with fingerprint', () {
      final exception = CertificatePinningException(
        message: 'Certificate mismatch',
        host: 'vlvtauth.up.railway.app',
        actualFingerprint: 'ABC123',
      );

      expect(exception.actualFingerprint, equals('ABC123'));
    });

    test('toString should include message and host', () {
      final exception = CertificatePinningException(
        message: 'Certificate mismatch',
        host: 'vlvtauth.up.railway.app',
      );

      final str = exception.toString();
      expect(str, contains('Certificate mismatch'));
      expect(str, contains('vlvtauth.up.railway.app'));
    });

    test('toString should include fingerprint when present', () {
      final exception = CertificatePinningException(
        message: 'Certificate mismatch',
        host: 'vlvtauth.up.railway.app',
        actualFingerprint: 'ABC123DEF456',
      );

      final str = exception.toString();
      expect(str, contains('ABC123DEF456'));
    });
  });

  group('PinnedHttpClient', () {
    test('should create client successfully', () {
      final client = PinnedHttpClient.create();
      expect(client, isNotNull);
      expect(client.client, isNotNull);
      client.close();
    });

    test('isPinningEnabled should reflect mode', () {
      final client = PinnedHttpClient.create();
      // In debug mode (tests), pinning is disabled
      // In release mode, pinning would be enabled
      // We can only test the debug mode behavior in tests
      expect(client.isPinningEnabled, isFalse);
      client.close();
    });
  });

  group('createPinnedHttpClient', () {
    test('should return a valid http.Client', () {
      final client = createPinnedHttpClient();
      expect(client, isNotNull);
      client.close();
    });
  });

  group('Integration with production URLs', () {
    test('all production hosts should have corresponding pins', () {
      const productionHosts = [
        'vlvtauth.up.railway.app',
        'vlvtprofiles.up.railway.app',
        'vlvtchat.up.railway.app',
      ];

      for (final host in productionHosts) {
        expect(
          CertificatePinningConfig.hasPinForHost(host),
          isTrue,
          reason: 'Missing pin for production host: $host',
        );

        final pins = CertificatePinningConfig.getPinsForHost(host);
        expect(
          pins,
          isNotNull,
          reason: 'Pins should be configured for: $host',
        );
        expect(
          pins,
          isNotEmpty,
          reason: 'At least one pin should exist for: $host',
        );
      }
    });

    test('each production host should have backup pins configured', () {
      // Good security practice: have at least 2 pins per host
      // (current cert + backup/intermediate CA)
      for (final host in CertificatePinningConfig.pinnedHosts) {
        final pins = CertificatePinningConfig.getPinsForHost(host);
        expect(
          pins!.length,
          greaterThanOrEqualTo(2),
          reason: 'Host $host should have at least 2 pins (current + backup)',
        );
      }
    });
  });
}
