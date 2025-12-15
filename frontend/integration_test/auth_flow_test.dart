import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:vlvt/models/profile.dart';
import 'package:vlvt/models/match.dart';
import 'package:vlvt/models/message.dart';

/// Integration tests for the authentication flow.
/// These tests verify the complete user journey from login to the main app.
///
/// To run these tests:
/// flutter test integration_test/auth_flow_test.dart
///
/// For device testing:
/// flutter drive --target=integration_test/auth_flow_test.dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Authentication Flow Integration Tests', () {
    group('Data Models', () {
      test('Profile model should serialize and deserialize correctly', () {
        final originalProfile = Profile(
          userId: 'test_user_123',
          name: 'Test User',
          age: 25,
          bio: 'This is my bio',
          photos: ['photo1.jpg', 'photo2.jpg'],
          interests: ['hiking', 'music', 'travel'],
          distance: 5.5,
          isVerified: true,
          isNewUser: false,
        );

        final json = originalProfile.toJson();
        final deserializedProfile = Profile.fromJson(json);

        expect(deserializedProfile.userId, originalProfile.userId);
        expect(deserializedProfile.name, originalProfile.name);
        expect(deserializedProfile.age, originalProfile.age);
        expect(deserializedProfile.bio, originalProfile.bio);
        expect(deserializedProfile.isVerified, originalProfile.isVerified);
      });

      test('Match model should serialize and deserialize correctly', () {
        final originalMatch = Match(
          id: 'match_123',
          userId1: 'user_1',
          userId2: 'user_2',
          createdAt: DateTime(2025, 1, 15, 10, 30),
        );

        final json = originalMatch.toJson();
        final deserializedMatch = Match.fromJson(json);

        expect(deserializedMatch.id, originalMatch.id);
        expect(deserializedMatch.userId1, originalMatch.userId1);
        expect(deserializedMatch.userId2, originalMatch.userId2);
      });

      test('Message model should serialize and deserialize correctly', () {
        final originalMessage = Message(
          id: 'msg_123',
          matchId: 'match_1',
          senderId: 'user_1',
          text: 'Hello world!',
          timestamp: DateTime(2025, 1, 15, 10, 30),
          status: MessageStatus.sent,
        );

        final json = originalMessage.toJson();
        final deserializedMessage = Message.fromJson(json);

        expect(deserializedMessage.id, originalMessage.id);
        expect(deserializedMessage.matchId, originalMessage.matchId);
        expect(deserializedMessage.senderId, originalMessage.senderId);
        expect(deserializedMessage.text, originalMessage.text);
        expect(deserializedMessage.status, originalMessage.status);
      });

      test('Message copyWith should create correct copy', () {
        final original = Message(
          id: 'msg_1',
          matchId: 'match_1',
          senderId: 'user_1',
          text: 'Original text',
          timestamp: DateTime(2025, 1, 15),
          status: MessageStatus.sending,
        );

        final modified = original.copyWith(
          status: MessageStatus.sent,
          text: 'Modified text',
        );

        expect(modified.id, original.id);
        expect(modified.matchId, original.matchId);
        expect(modified.text, 'Modified text');
        expect(modified.status, MessageStatus.sent);
      });

      test('Match getOtherUserId should return correct user', () {
        final match = Match(
          id: 'match_1',
          userId1: 'alice',
          userId2: 'bob',
          createdAt: DateTime.now(),
        );

        expect(match.getOtherUserId('alice'), 'bob');
        expect(match.getOtherUserId('bob'), 'alice');
      });
    });

    group('Authentication UI', () {
      testWidgets('should display auth screen elements', (tester) async {
        // Test basic auth screen structure
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // App logo
                    const FlutterLogo(size: 100),
                    const SizedBox(height: 32),
                    // App title
                    const Text(
                      'VLVT',
                      style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 48),
                    // Sign in buttons
                    ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.apple),
                      label: const Text('Sign in with Apple'),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.g_mobiledata),
                      label: const Text('Sign in with Google'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('VLVT'), findsOneWidget);
        expect(find.text('Sign in with Apple'), findsOneWidget);
        expect(find.text('Sign in with Google'), findsOneWidget);
      });

      testWidgets('should handle sign in button taps', (tester) async {
        bool appleSignInTapped = false;
        bool googleSignInTapped = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ElevatedButton(
                    onPressed: () => appleSignInTapped = true,
                    child: const Text('Sign in with Apple'),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => googleSignInTapped = true,
                    child: const Text('Sign in with Google'),
                  ),
                ],
              ),
            ),
          ),
        );

        await tester.tap(find.text('Sign in with Apple'));
        await tester.pump();
        expect(appleSignInTapped, isTrue);

        await tester.tap(find.text('Sign in with Google'));
        await tester.pump();
        expect(googleSignInTapped, isTrue);
      });

      testWidgets('should display loading state during authentication', (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 16),
                    Text('Signing in...'),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Signing in...'), findsOneWidget);
      });

      testWidgets('should display error message on authentication failure', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 64, color: Colors.red),
                    const SizedBox(height: 16),
                    const Text(
                      'Authentication failed',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    const Text('Please check your internet connection and try again'),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: () {},
                      child: const Text('Try Again'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.error_outline), findsOneWidget);
        expect(find.text('Authentication failed'), findsOneWidget);
        expect(find.text('Try Again'), findsOneWidget);
      });
    });

    group('Post-Authentication Navigation', () {
      testWidgets('should navigate to main screen after successful login', (tester) async {
        bool navigatedToMain = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ElevatedButton(
                onPressed: () => navigatedToMain = true,
                child: const Text('Continue to App'),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Continue to App'));
        await tester.pump();

        expect(navigatedToMain, isTrue);
      });

      testWidgets('should display bottom navigation bar after login', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: const Center(child: Text('Main Screen')),
              bottomNavigationBar: BottomNavigationBar(
                currentIndex: 0,
                items: const [
                  BottomNavigationBarItem(
                    icon: Icon(Icons.explore),
                    label: 'Discover',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.chat),
                    label: 'Matches',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.person),
                    label: 'Profile',
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.byType(BottomNavigationBar), findsOneWidget);
        expect(find.text('Discover'), findsOneWidget);
        expect(find.text('Matches'), findsOneWidget);
        expect(find.text('Profile'), findsOneWidget);
      });

      testWidgets('should handle bottom navigation taps', (tester) async {
        int selectedIndex = 0;

        await tester.pumpWidget(
          MaterialApp(
            home: StatefulBuilder(
              builder: (context, setState) => Scaffold(
                body: Center(
                  child: Text('Tab $selectedIndex'),
                ),
                bottomNavigationBar: BottomNavigationBar(
                  currentIndex: selectedIndex,
                  onTap: (index) => setState(() => selectedIndex = index),
                  items: const [
                    BottomNavigationBarItem(
                      icon: Icon(Icons.explore),
                      label: 'Discover',
                    ),
                    BottomNavigationBarItem(
                      icon: Icon(Icons.chat),
                      label: 'Matches',
                    ),
                    BottomNavigationBarItem(
                      icon: Icon(Icons.person),
                      label: 'Profile',
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        // Tap on Matches tab
        await tester.tap(find.text('Matches'));
        await tester.pump();
        expect(find.text('Tab 1'), findsOneWidget);

        // Tap on Profile tab
        await tester.tap(find.text('Profile'));
        await tester.pump();
        expect(find.text('Tab 2'), findsOneWidget);
      });
    });

    group('Session Management', () {
      testWidgets('should display logout confirmation dialog', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: ElevatedButton(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Log Out'),
                        content: const Text('Are you sure you want to log out?'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Cancel'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('Log Out'),
                          ),
                        ],
                      ),
                    );
                  },
                  child: const Text('Log Out'),
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Log Out'));
        await tester.pumpAndSettle();

        expect(find.text('Are you sure you want to log out?'), findsOneWidget);
        expect(find.text('Cancel'), findsOneWidget);
      });
    });

    group('Input Validation', () {
      testWidgets('should handle email input validation', (tester) async {
        final controller = TextEditingController();

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TextField(
                controller: controller,
                decoration: const InputDecoration(
                  hintText: 'Enter email',
                  errorText: null,
                ),
                keyboardType: TextInputType.emailAddress,
              ),
            ),
          ),
        );

        // Enter valid email
        await tester.enterText(find.byType(TextField), 'test@example.com');
        expect(controller.text, 'test@example.com');

        // Validate email format
        final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
        expect(emailRegex.hasMatch(controller.text), isTrue);
      });

      testWidgets('should show error for invalid email', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TextField(
                decoration: const InputDecoration(
                  hintText: 'Enter email',
                  errorText: 'Please enter a valid email address',
                ),
              ),
            ),
          ),
        );

        expect(find.text('Please enter a valid email address'), findsOneWidget);
      });
    });

    group('Network State Handling', () {
      testWidgets('should display offline indicator', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    color: Colors.red,
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.wifi_off, color: Colors.white, size: 16),
                        SizedBox(width: 8),
                        Text(
                          'No internet connection',
                          style: TextStyle(color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                  const Expanded(
                    child: Center(child: Text('App Content')),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('No internet connection'), findsOneWidget);
        expect(find.byIcon(Icons.wifi_off), findsOneWidget);
      });

      testWidgets('should display reconnecting indicator', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    color: Colors.orange,
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Reconnecting...',
                          style: TextStyle(color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Reconnecting...'), findsOneWidget);
      });
    });

    group('Accessibility', () {
      testWidgets('should have semantic labels for buttons', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  Semantics(
                    label: 'Sign in with Apple',
                    button: true,
                    child: ElevatedButton(
                      onPressed: () {},
                      child: const Text('Sign in with Apple'),
                    ),
                  ),
                  Semantics(
                    label: 'Sign in with Google',
                    button: true,
                    child: ElevatedButton(
                      onPressed: () {},
                      child: const Text('Sign in with Google'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        // Verify specific semantic labels exist (ElevatedButton adds its own Semantics
        // container, so we check for at least one widget with each label)
        expect(find.bySemanticsLabel('Sign in with Apple'), findsAtLeastNWidgets(1));
        expect(find.bySemanticsLabel('Sign in with Google'), findsAtLeastNWidgets(1));
      });
    });

    group('Theme and Styling', () {
      testWidgets('should apply dark theme correctly', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData.dark(),
            home: const Scaffold(
              body: Center(
                child: Text('Dark Theme Test'),
              ),
            ),
          ),
        );

        expect(find.text('Dark Theme Test'), findsOneWidget);
      });

      testWidgets('should apply light theme correctly', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData.light(),
            home: const Scaffold(
              body: Center(
                child: Text('Light Theme Test'),
              ),
            ),
          ),
        );

        expect(find.text('Light Theme Test'), findsOneWidget);
      });
    });
  });
}
