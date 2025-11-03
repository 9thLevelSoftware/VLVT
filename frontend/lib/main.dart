import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/auth_service.dart';
import 'services/subscription_service.dart';
import 'services/profile_api_service.dart';
import 'services/chat_api_service.dart';
import 'screens/auth_screen.dart';
import 'screens/main_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthService()),
        ChangeNotifierProvider(create: (_) => SubscriptionService()),
        ChangeNotifierProxyProvider<AuthService, ProfileApiService>(
          create: (context) => ProfileApiService(context.read<AuthService>()),
          update: (context, auth, previous) => ProfileApiService(auth),
        ),
        ChangeNotifierProxyProvider<AuthService, ChatApiService>(
          create: (context) => ChatApiService(context.read<AuthService>()),
          update: (context, auth, previous) => ChatApiService(auth),
        ),
      ],
      child: MaterialApp(
        title: 'NoBS Dating',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
          useMaterial3: true,
        ),
        home: const AuthWrapper(),
      ),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    final authService = context.watch<AuthService>();
    
    if (authService.isAuthenticated) {
      return const MainScreen();
    } else {
      return const AuthScreen();
    }
  }
}
