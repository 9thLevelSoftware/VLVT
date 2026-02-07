/// Device Fingerprint Service
/// Collects device fingerprint for ban enforcement in After Hours mode.
library;

import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';

/// Collects device fingerprint for ban enforcement
class DeviceFingerprintService {
  static final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();

  /// Collect device fingerprint for session start
  /// Returns map with deviceId, deviceModel, platform
  static Future<Map<String, String?>> collectFingerprint() async {
    try {
      Map<String, String?> fingerprint = {};

      if (Platform.isIOS) {
        final iosInfo = await _deviceInfo.iosInfo;
        fingerprint['deviceId'] = iosInfo.identifierForVendor;
        fingerprint['deviceModel'] = iosInfo.model;
        fingerprint['platform'] = 'ios';
      } else if (Platform.isAndroid) {
        final androidInfo = await _deviceInfo.androidInfo;
        fingerprint['deviceId'] = androidInfo.id;
        fingerprint['deviceModel'] = androidInfo.model;
        fingerprint['platform'] = 'android';
      }

      return fingerprint;
    } catch (e) {
      // debugPrint('Error collecting device fingerprint: $e');
      return {};
    }
  }
}
