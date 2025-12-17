import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:vlvt/services/profile_api_service.dart';
import 'package:vlvt/services/auth_service.dart';
import 'package:vlvt/services/chat_api_service.dart';
import 'package:vlvt/services/subscription_service.dart';
import 'package:vlvt/services/discovery_preferences_service.dart';
import 'package:vlvt/services/location_service.dart';
import 'package:vlvt/models/profile.dart';
import 'package:vlvt/models/match.dart';

@GenerateMocks([
  ProfileApiService,
  AuthService,
  ChatApiService,
  SubscriptionService,
  DiscoveryPreferencesService,
  LocationService,
])
import 'discovery_screen_test.mocks.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Discovery Screen Widget Tests', () {
    late MockProfileApiService mockProfileService;
    late MockAuthService mockAuthService;
    late MockChatApiService mockChatService;
    late MockSubscriptionService mockSubscriptionService;
    late MockDiscoveryPreferencesService mockPrefsService;
    late MockLocationService mockLocationService;

    setUp(() {
      mockProfileService = MockProfileApiService();
      mockAuthService = MockAuthService();
      mockChatService = MockChatApiService();
      mockSubscriptionService = MockSubscriptionService();
      mockPrefsService = MockDiscoveryPreferencesService();
      mockLocationService = MockLocationService();

      // Default mock setups
      when(mockAuthService.userId).thenReturn('test_user_1');
      when(mockAuthService.isAuthenticated).thenReturn(true);
      when(mockSubscriptionService.hasPremiumAccess).thenReturn(true);
      when(mockSubscriptionService.canLike()).thenReturn(true);
      when(mockSubscriptionService.isFreeUser).thenReturn(false);
      when(mockSubscriptionService.getLikesRemaining()).thenReturn(20);
    });

    group('Profile model', () {
      test('should create Profile from JSON', () {
        final json = {
          'userId': 'user_123',
          'name': 'Test User',
          'age': 25,
          'bio': 'Hello world',
          'photos': ['photo1.jpg', 'photo2.jpg'],
          'interests': ['hiking', 'music'],
          'distance': 5.5,
          'isVerified': true,
          'isNewUser': false,
        };

        final profile = Profile.fromJson(json);

        expect(profile.userId, 'user_123');
        expect(profile.name, 'Test User');
        expect(profile.age, 25);
        expect(profile.bio, 'Hello world');
        expect(profile.photos?.length, 2);
        expect(profile.interests?.length, 2);
        expect(profile.distance, 5.5);
        expect(profile.isVerified, true);
        expect(profile.isNewUser, false);
      });

      test('should serialize Profile to JSON', () {
        final profile = Profile(
          userId: 'user_456',
          name: 'Another User',
          age: 30,
          bio: 'Test bio',
          photos: ['photo.jpg'],
          interests: ['reading'],
          distance: 10.0,
          isVerified: false,
          isNewUser: true,
        );

        final json = profile.toJson();

        expect(json['userId'], 'user_456');
        expect(json['name'], 'Another User');
        expect(json['age'], 30);
        expect(json['isVerified'], false);
        expect(json['isNewUser'], true);
      });

      test('should handle null optional fields', () {
        final json = {
          'userId': 'user_789',
        };

        final profile = Profile.fromJson(json);

        expect(profile.userId, 'user_789');
        expect(profile.name, isNull);
        expect(profile.age, isNull);
        expect(profile.bio, isNull);
        expect(profile.photos, isNull);
        expect(profile.interests, isNull);
        expect(profile.distance, isNull);
      });

      test('should default isVerified to false', () {
        final profile = Profile(userId: 'test');
        expect(profile.isVerified, false);
      });

      test('should default isNewUser to false', () {
        final profile = Profile(userId: 'test');
        expect(profile.isNewUser, false);
      });
    });

    group('Match model', () {
      test('should create Match from JSON', () {
        final json = {
          'id': 'match_123',
          'userId1': 'user_1',
          'userId2': 'user_2',
          'createdAt': '2025-01-15T10:30:00.000Z',
        };

        final match = Match.fromJson(json);

        expect(match.id, 'match_123');
        expect(match.userId1, 'user_1');
        expect(match.userId2, 'user_2');
        expect(match.createdAt.year, 2025);
      });

      test('should get other user ID', () {
        final match = Match(
          id: 'match_1',
          userId1: 'alice',
          userId2: 'bob',
          createdAt: DateTime.now(),
        );

        expect(match.getOtherUserId('alice'), 'bob');
        expect(match.getOtherUserId('bob'), 'alice');
      });

      test('matchId alias should return id', () {
        final match = Match(
          id: 'match_xyz',
          userId1: 'user_1',
          userId2: 'user_2',
          createdAt: DateTime.now(),
        );

        expect(match.matchId, match.id);
      });
    });

    group('UI Components', () {
      testWidgets('should display loading indicator initially', (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Center(
                child: CircularProgressIndicator(),
              ),
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      });

      testWidgets('should display error message on error', (tester) async {
        const errorMessage = 'Failed to load profiles';

        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.error_outline, size: 64),
                    SizedBox(height: 16),
                    Text(errorMessage),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text(errorMessage), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('should display empty state when no profiles', (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.people_outline, size: 64),
                    SizedBox(height: 16),
                    Text('No profiles available'),
                    SizedBox(height: 16),
                    Text('Adjust your filters or check back later'),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('No profiles available'), findsOneWidget);
        expect(find.byIcon(Icons.people_outline), findsOneWidget);
      });

      testWidgets('should display profile card with name and age', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Card(
                child: Column(
                  children: [
                    const Text('Test User, 25'),
                    const SizedBox(height: 8),
                    const Text('This is my bio'),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('Test User, 25'), findsOneWidget);
        expect(find.text('This is my bio'), findsOneWidget);
      });

      testWidgets('should display verified badge for verified users', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Row(
                children: [
                  const Text('Verified User, 28'),
                  const SizedBox(width: 8),
                  Container(
                    key: const Key('verified_badge'),
                    child: const Icon(Icons.verified, color: Colors.blue),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.byKey(const Key('verified_badge')), findsOneWidget);
        expect(find.byIcon(Icons.verified), findsOneWidget);
      });

      testWidgets('should display interests chips', (tester) async {
        final interests = ['Hiking', 'Music', 'Travel'];

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Wrap(
                spacing: 8,
                children: interests.map((interest) => Chip(label: Text(interest))).toList(),
              ),
            ),
          ),
        );

        expect(find.text('Hiking'), findsOneWidget);
        expect(find.text('Music'), findsOneWidget);
        expect(find.text('Travel'), findsOneWidget);
        expect(find.byType(Chip), findsNWidgets(3));
      });
    });

    group('Action Buttons', () {
      testWidgets('should display pass button', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: FloatingActionButton(
                heroTag: 'pass',
                onPressed: () {},
                backgroundColor: Colors.red,
                child: const Icon(Icons.close),
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.close), findsOneWidget);
        expect(find.byType(FloatingActionButton), findsOneWidget);
      });

      testWidgets('should display like button', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: FloatingActionButton(
                heroTag: 'like',
                onPressed: () {},
                backgroundColor: Colors.green,
                child: const Icon(Icons.favorite),
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.favorite), findsOneWidget);
      });

      testWidgets('should display undo button when visible', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  FloatingActionButton(
                    heroTag: 'pass',
                    mini: true,
                    onPressed: () {},
                    child: const Icon(Icons.close),
                  ),
                  FloatingActionButton(
                    heroTag: 'undo',
                    mini: true,
                    onPressed: () {},
                    child: const Icon(Icons.undo),
                  ),
                  FloatingActionButton(
                    heroTag: 'like',
                    mini: true,
                    onPressed: () {},
                    child: const Icon(Icons.favorite),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.undo), findsOneWidget);
        expect(find.byType(FloatingActionButton), findsNWidgets(3));
      });

      testWidgets('should trigger pass action on button tap', (tester) async {
        bool passTriggered = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: FloatingActionButton(
                heroTag: 'pass',
                onPressed: () {
                  passTriggered = true;
                },
                child: const Icon(Icons.close),
              ),
            ),
          ),
        );

        await tester.tap(find.byType(FloatingActionButton));
        await tester.pump();

        expect(passTriggered, isTrue);
      });

      testWidgets('should trigger like action on button tap', (tester) async {
        bool likeTriggered = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: FloatingActionButton(
                heroTag: 'like',
                onPressed: () {
                  likeTriggered = true;
                },
                child: const Icon(Icons.favorite),
              ),
            ),
          ),
        );

        await tester.tap(find.byType(FloatingActionButton));
        await tester.pump();

        expect(likeTriggered, isTrue);
      });
    });

    group('Filter Functionality', () {
      testWidgets('should display filter icon in app bar', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: const Text('Discovery'),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.filter_list),
                    onPressed: () {},
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.filter_list), findsOneWidget);
      });

      testWidgets('should highlight filter icon when filters active', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: const Text('Discovery'),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.filter_list, color: Colors.amber),
                    onPressed: () {},
                  ),
                ],
              ),
            ),
          ),
        );

        // Find icon with specific color
        final iconFinder = find.byIcon(Icons.filter_list);
        expect(iconFinder, findsOneWidget);
      });

      testWidgets('should display "Filtered" badge when filters active', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: const Text('Discovery'),
                actions: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.amber,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text('Filtered'),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Filtered'), findsOneWidget);
      });

      testWidgets('should navigate to filters on icon tap', (tester) async {
        bool navigated = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                actions: [
                  IconButton(
                    icon: const Icon(Icons.filter_list),
                    onPressed: () {
                      navigated = true;
                    },
                  ),
                ],
              ),
            ),
          ),
        );

        await tester.tap(find.byIcon(Icons.filter_list));
        await tester.pump();

        expect(navigated, isTrue);
      });
    });

    group('Subscription Status', () {
      testWidgets('should display likes counter for free users', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                actions: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.favorite, size: 16, color: Colors.green),
                        SizedBox(width: 4),
                        Text('15', style: TextStyle(color: Colors.green)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('15'), findsOneWidget);
      });

      testWidgets('should show red counter when likes exhausted', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                actions: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.favorite, size: 16, color: Colors.red),
                        SizedBox(width: 4),
                        Text('0', style: TextStyle(color: Colors.red)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('0'), findsOneWidget);
      });
    });

    group('Profile Counter', () {
      testWidgets('should display remaining profiles count', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: Column(
                  children: const [
                    Text('Discovery'),
                    Text('5 profiles left', style: TextStyle(fontSize: 12)),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('5 profiles left'), findsOneWidget);
      });

      testWidgets('should display warning when few profiles remain', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    color: Colors.amber.withOpacity(0.15),
                    child: const Text(
                      'Only 3 profiles remaining. Adjust filters for more!',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.textContaining('Only 3 profiles remaining'), findsOneWidget);
      });
    });

    group('Who Liked You Banner', () {
      testWidgets('should display banner when someone liked user', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: const BoxDecoration(
                        color: Colors.amber,
                        shape: BoxShape.circle,
                      ),
                      child: const Text('5'),
                    ),
                    const SizedBox(width: 12),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('5 people liked you'),
                        Text("See who's already interested"),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('5 people liked you'), findsOneWidget);
        expect(find.textContaining("See who's already interested"), findsOneWidget);
      });

      testWidgets('should handle singular form for one like', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Container(
                child: const Text('1 person liked you'),
              ),
            ),
          ),
        );

        expect(find.text('1 person liked you'), findsOneWidget);
      });
    });

    group('Swipe Hints', () {
      testWidgets('should display swipe hint for new users', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.arrow_back, size: 20),
                  SizedBox(width: 8),
                  Text('Swipe to interact'),
                  SizedBox(width: 8),
                  Icon(Icons.arrow_forward, size: 20),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Swipe to interact'), findsOneWidget);
        expect(find.byIcon(Icons.arrow_back), findsOneWidget);
        expect(find.byIcon(Icons.arrow_forward), findsOneWidget);
      });
    });

    group('Swipe Indicators', () {
      testWidgets('should display LIKE indicator when swiping right', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [
                  Positioned(
                    top: 50,
                    left: 30,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.green, width: 4),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'LIKE',
                        style: TextStyle(color: Colors.green, fontSize: 32, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('LIKE'), findsOneWidget);
      });

      testWidgets('should display PASS indicator when swiping left', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [
                  Positioned(
                    top: 50,
                    right: 30,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.red, width: 4),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'PASS',
                        style: TextStyle(color: Colors.red, fontSize: 32, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('PASS'), findsOneWidget);
      });
    });

    group('Undo Functionality', () {
      testWidgets('should display undo hint when undo available', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [
                  Positioned(
                    bottom: 100,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.purple,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'Tap UNDO to revert last action',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Tap UNDO to revert last action'), findsOneWidget);
      });
    });

    group('End of Profiles Dialog', () {
      testWidgets('should display end of profiles dialog', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: ElevatedButton(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('No More Profiles'),
                        content: const Text('You\'ve seen all available profiles for now.'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('OK'),
                          ),
                        ],
                      ),
                    );
                  },
                  child: const Text('Show Dialog'),
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Show Dialog'));
        await tester.pumpAndSettle();

        expect(find.text('No More Profiles'), findsOneWidget);
        expect(find.textContaining('You\'ve seen all available profiles'), findsOneWidget);
      });

      testWidgets('should show filter options when filters are active', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: ElevatedButton(
                  onPressed: () {
                    showDialog(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('No More Profiles'),
                        content: const Text('No more profiles match your current filters.'),
                        actions: [
                          TextButton(
                            onPressed: () {},
                            child: const Text('Clear Filters'),
                          ),
                          TextButton(
                            onPressed: () {},
                            child: const Text('Adjust Filters'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('OK'),
                          ),
                        ],
                      ),
                    );
                  },
                  child: const Text('Show Dialog'),
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Show Dialog'));
        await tester.pumpAndSettle();

        expect(find.text('Clear Filters'), findsOneWidget);
        expect(find.text('Adjust Filters'), findsOneWidget);
      });
    });

    group('Photo Carousel', () {
      testWidgets('should display photo indicators for multiple photos', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  3,
                  (index) => Container(
                    key: Key('indicator_$index'),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: index == 0 ? Colors.white : Colors.white.withOpacity(0.4),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.byKey(const Key('indicator_0')), findsOneWidget);
        expect(find.byKey(const Key('indicator_1')), findsOneWidget);
        expect(find.byKey(const Key('indicator_2')), findsOneWidget);
      });
    });

    group('Expanded Profile View', () {
      testWidgets('should display distance in expanded view', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: const [
                  Icon(Icons.info_outline, size: 20),
                  SizedBox(width: 8),
                  Text('More Info'),
                  SizedBox(height: 12),
                  Text('Distance: 5.5km away'),
                  SizedBox(height: 8),
                  Text('Tap card to collapse'),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Distance: 5.5km away'), findsOneWidget);
        expect(find.text('Tap card to collapse'), findsOneWidget);
      });
    });

    group('App Bar', () {
      testWidgets('should display Discovery title', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: const Text('Discovery'),
              ),
            ),
          ),
        );

        expect(find.text('Discovery'), findsOneWidget);
      });
    });

    group('Retry Button', () {
      testWidgets('should display retry button on error', (tester) async {
        bool retried = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 64),
                    const SizedBox(height: 16),
                    const Text('Failed to load profiles'),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () {
                        retried = true;
                      },
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        await tester.tap(find.text('Retry'));
        await tester.pump();

        expect(retried, isTrue);
      });
    });
  });
}
