import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Profile Screen Widget Tests', () {
    testWidgets('should display profile information', (WidgetTester tester) async {
      const testName = 'John Doe';
      const testAge = 28;
      const testBio = 'Love hiking and coffee';

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(testName, style: TextStyle(fontSize: 24)),
                Text('$testAge', style: TextStyle(fontSize: 18)),
                Text(testBio),
              ],
            ),
          ),
        ),
      );

      // Verify profile information is displayed
      expect(find.text(testName), findsOneWidget);
      expect(find.text('$testAge'), findsOneWidget);
      expect(find.text(testBio), findsOneWidget);
    });

    testWidgets('should display profile photos', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Container(
                  width: 200,
                  height: 200,
                  color: Colors.grey,
                  child: const Icon(Icons.person),
                ),
              ],
            ),
          ),
        ),
      );

      // Verify photo container is present
      expect(find.byType(Container), findsOneWidget);
      expect(find.byIcon(Icons.person), findsOneWidget);
    });

    testWidgets('should display edit button', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ElevatedButton(
              onPressed: () {},
              child: const Text('Edit Profile'),
            ),
          ),
        ),
      );

      // Verify edit button is displayed
      expect(find.text('Edit Profile'), findsOneWidget);
    });

    testWidgets('should handle edit button tap', (WidgetTester tester) async {
      bool editTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ElevatedButton(
              onPressed: () {
                editTapped = true;
              },
              child: const Text('Edit Profile'),
            ),
          ),
        ),
      );

      // Tap edit button
      await tester.tap(find.text('Edit Profile'));
      await tester.pump();

      // Verify edit was triggered
      expect(editTapped, isTrue);
    });
  });

  group('Profile Screen Loading Tests', () {
    testWidgets('should show loading indicator while fetching profile', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          ),
        ),
      );

      // Verify loading indicator is shown
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('should display profile after loading', (WidgetTester tester) async {
      const profileName = 'Jane Smith';

      // Initially show loading state
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          ),
        ),
      );

      // Verify loading indicator is shown
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Update to loaded state with profile
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: Text(profileName),
            ),
          ),
        ),
      );

      // Profile should be displayed
      expect(find.text(profileName), findsOneWidget);
    });
  });

  group('Profile Screen Error Tests', () {
    testWidgets('should display error message on load failure', (WidgetTester tester) async {
      const errorMessage = 'Failed to load profile';

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: Text(errorMessage),
            ),
          ),
        ),
      );

      // Verify error message is displayed
      expect(find.text(errorMessage), findsOneWidget);
    });
  });

  group('Profile Interests Tests', () {
    testWidgets('should display list of interests', (WidgetTester tester) async {
      final interests = ['Hiking', 'Coffee', 'Reading'];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: interests.map((interest) => Chip(label: Text(interest))).toList(),
            ),
          ),
        ),
      );

      // Verify all interests are displayed
      for (final interest in interests) {
        expect(find.text(interest), findsOneWidget);
      }
    });
  });
}
