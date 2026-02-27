import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'providers/provider_tree.dart';
import 'services/auth_service.dart';
import 'services/socket_service.dart';
import 'services/analytics_service.dart';
import 'services/notification_service.dart';
import 'services/subscription_service.dart';
import 'services/theme_service.dart';
import 'services/deep_link_service.dart';
import 'services/message_queue_service.dart';
import 'services/after_hours_service.dart';
import 'screens/auth_screen.dart';
import 'screens/main_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/splash_screen.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

// Global navigator key for navigation from notification callbacks
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase (will fail gracefully if not configured)
  try {
    await Firebase.initializeApp();

    // Initialize Crashlytics
    if (!kDebugMode) {
      // Only enable crash reporting in release mode
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;

      // Catch errors from the platform
      PlatformDispatcher.instance.onError = (error, stack) {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
        return true;
      };
    } else {
      // In debug mode, still initialize but don't send crashes
      // // debugPrint('Firebase Crashlytics initialized in debug mode (not sending crashes)');
    }

    // Initialize Analytics
    // Analytics works in both debug and release mode
    // // debugPrint('Firebase Analytics initialized');

    // Note: Notification service initialization moved to AuthWrapper
    // to ensure AuthService is available from Provider tree

    // // debugPrint('Firebase initialized successfully');
  } catch (e) {
    // // debugPrint('Firebase initialization failed: $e');
    // // debugPrint('App will continue without crash reporting and analytics.');
    // // debugPrint('To enable Firebase, follow instructions in FIREBASE_SETUP.md');
  }

  // Initialize Theme Service
  final themeService = ThemeService();
  await themeService.initialize();

  // Initialize After Hours foreground task (Android background location)
  await AfterHoursService.initForegroundTask();

  await SentryFlutter.init(
    (options) {
      options.dsn = 'https://3fd85155f27724779673da44461792d1@o4510959233073152.ingest.us.sentry.io/4510959234646016';
      // Adds request headers and IP for users, for more info visit:
      // https://docs.sentry.io/platforms/dart/guides/flutter/data-management/data-collected/
      options.sendDefaultPii = true;
      options.enableLogs = true;
      // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
      // We recommend adjusting this value in production.
      options.tracesSampleRate = 1.0;
      // The sampling rate for profiling is relative to tracesSampleRate
      // Setting to 1.0 will profile 100% of sampled transactions:
      options.profilesSampleRate = 1.0;
      // Configure Session Replay
      options.replay.sessionSampleRate = 0.1;
      options.replay.onErrorSampleRate = 1.0;
    },
    appRunner: () => runApp(SentryWidget(child: MyApp(themeService: themeService))),
  );
  // TODO: Remove this line after sending the first sample event to sentry.
  await Sentry.captureException(StateError('This is a sample exception.'));
}

/// Handle notification tap - navigate to appropriate screen
void _handleNotificationTap(Map<String, dynamic> data) {
  // // debugPrint('Handling notification tap: $data');

  final navigatorState = navigatorKey.currentState;
  if (navigatorState == null) {
    // // debugPrint('Navigator not ready - cannot handle notification tap');
    return;
  }

  final type = data['type'];

  if (type == 'message') {
    // Navigate to chat screen for the specific match
    final matchId = data['matchId'];
    if (matchId == null || matchId.toString().isEmpty) {
      // // debugPrint('Invalid matchId in notification data');
      return;
    }

    // Use pushReplacement to avoid stacking multiple chat screens
    navigatorState.push(
      MaterialPageRoute(
        builder: (context) => ChatScreen(match: null, matchId: matchId.toString()),
      ),
    );
    // // debugPrint('Navigating to chat screen for match: $matchId');

  } else if (type == 'match') {
    // Navigate to matches screen
    // Determine correct tab based on subscription status
    // Free users: 0=Search, 1=Profile
    // Premium users: 0=Discovery, 1=After Hours, 2=Matches, 3=Chats, 4=Profile
    final subscriptionService = Provider.of<SubscriptionService>(
      navigatorState.context,
      listen: false,
    );
    final hasPremiumAccess = subscriptionService.hasPremiumAccess;

    navigatorState.pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (context) {
          // For match notifications, navigate to matches tab (2 for premium, 0 for free)
          final targetTab = hasPremiumAccess ? 2 : 0;
          return MainScreen(initialTab: targetTab);
        },
      ),
      (route) => false,
    );
    // // debugPrint('Navigating to MainScreen for new match notification (hasPremiumAccess: $hasPremiumAccess)');
  } else {
    // // debugPrint('Unknown notification type: $type');
  }
}

class MyApp extends StatelessWidget {
  final ThemeService themeService;

  const MyApp({super.key, required this.themeService});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: ProviderTree.all(themeService),
      child: Consumer<ThemeService>(
        builder: (context, themeService, _) {
          return MaterialApp(
            title: 'VLVT',
            navigatorKey: navigatorKey,
            theme: AppThemes.lightTheme,
            darkTheme: AppThemes.darkTheme,
            themeMode: themeService.themeMode,
            navigatorObservers: [
              AnalyticsService.getObserver(),
            ],
            builder: (context, child) {
              return GestureDetector(
                onTap: () => FocusScope.of(context).unfocus(),
                child: child,
              );
            },
            home: const AuthWrapper(),
          );
        },
      ),
    );
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _showSplash = true;
  bool _notificationServiceInitialized = false;

  @override
  void initState() {
    super.initState();
    // Initialize deep link handling after the widget is built
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final authService = context.read<AuthService>();
      DeepLinkService.init(context, authService);

      // FIX: Wire up MessageQueueService to SocketService for auto-processing on reconnection
      final socketService = context.read<SocketService>();
      final messageQueueService = context.read<MessageQueueService>();
      socketService.setMessageQueueService(messageQueueService);

      // Initialize notification service with AuthService from Provider
      _initNotificationService(authService);
    });
  }

  Future<void> _initNotificationService(AuthService authService) async {
    if (_notificationServiceInitialized) return;
    _notificationServiceInitialized = true;

    try {
      final notificationService = NotificationService();
      await notificationService.initialize(authService: authService);

      // Set up notification tap handler
      notificationService.onNotificationTap = (data) {
        _handleNotificationTap(data);
      };
      // // debugPrint('Notification service initialized successfully');
    } catch (e) {
      // // debugPrint('Notification service initialization failed: $e');
    }
  }

  @override
  void dispose() {
    DeepLinkService.dispose();
    super.dispose();
  }

  void _onSplashComplete() {
    if (mounted) {
      setState(() => _showSplash = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Show splash screen on first launch
    if (_showSplash) {
      return SplashScreen(onComplete: _onSplashComplete);
    }

    final authService = context.watch<AuthService>();

    if (authService.isAuthenticated) {
      return const MainScreen();
    } else {
      return const AuthScreen();
    }
  }
}
