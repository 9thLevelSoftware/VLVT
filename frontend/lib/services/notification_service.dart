import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vlvt/services/auth_service.dart';
import 'package:vlvt/config/app_config.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

/// Background message handler (must be top-level function)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Keep handler minimal to avoid isolate crashes
}

/// Service for handling push notifications
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  String? _fcmToken;
  bool _initialized = false;
  AuthService? _authService;

  /// Callback for when user taps a notification
  Function(Map<String, dynamic> data)? onNotificationTap;

  /// Initialize the notification service with an AuthService instance
  /// The AuthService should be the one from the Provider tree
  Future<void> initialize({AuthService? authService}) async {
    _authService = authService;
    if (_initialized) {
      return;
    }

    try {
      // Set up background message handler
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

      // Initialize local notifications
      await _initializeLocalNotifications();

      // Request permission
      final permission = await _requestPermission();
      if (!permission) {
        _initialized = true;
        return;
      }

      // Get FCM token
      _fcmToken = await _firebaseMessaging.getToken();

      // Register token with backend
      if (_fcmToken != null) {
        await _registerToken(_fcmToken!);
      }

      // Listen for token refresh
      _firebaseMessaging.onTokenRefresh.listen((newToken) {
        _fcmToken = newToken;
        _registerToken(newToken);
      });

      // Handle foreground messages
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

      // Handle notification taps when app is in background
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

      // Check if app was opened from a terminated state via notification
      final initialMessage = await _firebaseMessaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage);
      }

      _initialized = true;
    } catch (_) {
      _initialized = true; // Mark as initialized even on error to prevent retry loops
    }
  }

  /// Initialize local notifications (for displaying notifications while app is in foreground)
  Future<void> _initializeLocalNotifications() async {
    // Android settings
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');

    // iOS settings
    final iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    final initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (details) {
        // Handle notification tap
        if (details.payload != null) {
          try {
            final data = jsonDecode(details.payload!);
            onNotificationTap?.call(data);
          } catch (_) {}
        }
      },
    );

    // Create notification channels for Android
    if (Platform.isAndroid) {
      await _createNotificationChannels();
    }
  }

  /// Create Android notification channels
  Future<void> _createNotificationChannels() async {
    // Messages channel
    const messagesChannel = AndroidNotificationChannel(
      'messages',
      'Messages',
      description: 'Notifications for new messages',
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
    );

    // Matches channel
    const matchesChannel = AndroidNotificationChannel(
      'matches',
      'Matches',
      description: 'Notifications for new matches',
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(messagesChannel);

    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(matchesChannel);
  }

  /// Request notification permission
  Future<bool> _requestPermission() async {
    final settings = await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    return settings.authorizationStatus == AuthorizationStatus.authorized ||
           settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  /// Register FCM token with backend
  Future<void> _registerToken(String token) async {
    try {
      final authService = _authService;
      if (authService == null) {
        return;
      }

      final user = await authService.getCurrentUser();

      if (user == null) {
        return;
      }

      final jwtToken = await authService.getToken();
      if (jwtToken == null) {
        return;
      }

      final deviceType = Platform.isIOS ? 'ios' : 'android';

      await http.post(
        Uri.parse(AppConfig.chatUrl('/fcm/register')),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwtToken',
        },
        body: jsonEncode({
          'token': token,
          'deviceType': deviceType,
        }),
      );
    } catch (_) {}
  }

  /// Unregister FCM token from backend
  Future<void> unregisterToken() async {
    if (_fcmToken == null) return;

    try {
      final authService = _authService;
      if (authService == null) return;

      final jwtToken = await authService.getToken();
      if (jwtToken == null) return;

      await http.post(
        Uri.parse(AppConfig.chatUrl('/fcm/unregister')),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwtToken',
        },
        body: jsonEncode({
          'token': _fcmToken,
        }),
      );
    } catch (_) {}
  }

  /// Handle foreground messages (app is open)
  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    // Show local notification
    final notification = message.notification;

    if (notification != null) {
      final channelId = message.data['type'] == 'match' ? 'matches' : 'messages';

      await _localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            channelId,
            channelId == 'matches' ? 'Matches' : 'Messages',
            channelDescription: channelId == 'matches'
                ? 'Notifications for new matches'
                : 'Notifications for new messages',
            icon: '@mipmap/ic_launcher',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        payload: jsonEncode(message.data),
      );
    }
  }

  /// Handle notification tap (app opened from notification)
  void _handleNotificationTap(RemoteMessage message) {
    onNotificationTap?.call(message.data);
  }

  /// Get current FCM token
  String? get fcmToken => _fcmToken;

  /// Check if notifications are enabled
  Future<bool> areNotificationsEnabled() async {
    final settings = await _firebaseMessaging.getNotificationSettings();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
           settings.authorizationStatus == AuthorizationStatus.provisional;
  }
}
