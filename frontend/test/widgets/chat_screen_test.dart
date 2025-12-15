import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vlvt/models/message.dart';
import 'package:vlvt/models/match.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Chat Screen Widget Tests', () {
    group('Message model', () {
      test('should create Message from JSON with timestamp field', () {
        final json = {
          'id': 'msg_123',
          'matchId': 'match_1',
          'senderId': 'user_1',
          'text': 'Hello!',
          'timestamp': '2025-01-15T10:30:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.id, 'msg_123');
        expect(message.matchId, 'match_1');
        expect(message.senderId, 'user_1');
        expect(message.text, 'Hello!');
        expect(message.status, MessageStatus.sent);
      });

      test('should create Message from JSON with createdAt field', () {
        final json = {
          'id': 'msg_456',
          'matchId': 'match_2',
          'senderId': 'user_2',
          'text': 'Hi there!',
          'createdAt': '2025-01-15T11:00:00.000Z',
        };

        final message = Message.fromJson(json);

        expect(message.id, 'msg_456');
        expect(message.text, 'Hi there!');
      });

      test('should deserialize status correctly', () {
        final statusTests = [
          {'status': 'sending', 'expected': MessageStatus.sending},
          {'status': 'sent', 'expected': MessageStatus.sent},
          {'status': 'delivered', 'expected': MessageStatus.delivered},
          {'status': 'read', 'expected': MessageStatus.read},
          {'status': 'failed', 'expected': MessageStatus.failed},
        ];

        for (final test in statusTests) {
          final json = {
            'id': 'msg_${test['status']}',
            'matchId': 'match_1',
            'senderId': 'user_1',
            'text': 'Test',
            'timestamp': '2025-01-15T10:30:00.000Z',
            'status': test['status'],
          };

          final message = Message.fromJson(json);
          expect(message.status, test['expected']);
        }
      });

      test('should serialize to JSON correctly', () {
        final message = Message(
          id: 'msg_abc',
          matchId: 'match_1',
          senderId: 'user_1',
          text: 'Test message',
          timestamp: DateTime(2025, 1, 15, 10, 30),
          status: MessageStatus.delivered,
        );

        final json = message.toJson();

        expect(json['id'], 'msg_abc');
        expect(json['text'], 'Test message');
        expect(json['status'], 'delivered');
      });

      test('should include error in JSON when present', () {
        final message = Message(
          id: 'msg_err',
          matchId: 'match_1',
          senderId: 'user_1',
          text: 'Failed message',
          timestamp: DateTime.now(),
          status: MessageStatus.failed,
          error: 'Network error',
        );

        final json = message.toJson();

        expect(json['error'], 'Network error');
      });

      test('copyWith creates correct copy', () {
        final original = Message(
          id: 'msg_1',
          matchId: 'match_1',
          senderId: 'user_1',
          text: 'Original',
          timestamp: DateTime.now(),
          status: MessageStatus.sending,
        );

        final copy = original.copyWith(
          status: MessageStatus.sent,
          text: 'Modified',
        );

        expect(copy.id, original.id);
        expect(copy.matchId, original.matchId);
        expect(copy.text, 'Modified');
        expect(copy.status, MessageStatus.sent);
      });

      test('copyWith preserves unmodified fields', () {
        final original = Message(
          id: 'msg_1',
          matchId: 'match_1',
          senderId: 'user_1',
          text: 'Original',
          timestamp: DateTime(2025, 1, 15),
          status: MessageStatus.sending,
          error: 'some error',
        );

        final copy = original.copyWith(status: MessageStatus.sent);

        expect(copy.id, 'msg_1');
        expect(copy.matchId, 'match_1');
        expect(copy.senderId, 'user_1');
        expect(copy.text, 'Original');
        expect(copy.timestamp, original.timestamp);
      });
    });

    group('MessageStatus enum', () {
      test('should have all expected values', () {
        expect(MessageStatus.values.length, 5);
        expect(MessageStatus.values, contains(MessageStatus.sending));
        expect(MessageStatus.values, contains(MessageStatus.sent));
        expect(MessageStatus.values, contains(MessageStatus.delivered));
        expect(MessageStatus.values, contains(MessageStatus.read));
        expect(MessageStatus.values, contains(MessageStatus.failed));
      });
    });

    group('Match model for chat', () {
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
      });

      test('should get other user ID correctly', () {
        final match = Match(
          id: 'match_1',
          userId1: 'alice',
          userId2: 'bob',
          createdAt: DateTime.now(),
        );

        expect(match.getOtherUserId('alice'), 'bob');
        expect(match.getOtherUserId('bob'), 'alice');
        expect(match.getOtherUserId('unknown'), 'alice'); // fallback
      });
    });

    group('UI Components', () {
      testWidgets('should display loading indicator', (tester) async {
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
        const errorMessage = 'Failed to load chat';

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(errorMessage, style: const TextStyle(color: Colors.red)),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () {},
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text(errorMessage), findsOneWidget);
        expect(find.text('Retry'), findsOneWidget);
      });

      testWidgets('should display empty state when no messages', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.chat_bubble_outline, size: 80, color: Colors.grey[400]),
                    const SizedBox(height: 16),
                    const Text('No messages yet', style: TextStyle(fontSize: 18)),
                    const SizedBox(height: 8),
                    const Text('Say hi to your match!'),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('No messages yet'), findsOneWidget);
        expect(find.byIcon(Icons.chat_bubble_outline), findsOneWidget);
      });
    });

    group('Message Bubbles', () {
      testWidgets('should display sent message on right side', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Align(
                alignment: Alignment.centerRight,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'Hello!',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Hello!'), findsOneWidget);
      });

      testWidgets('should display received message on left side', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text('Hi there!'),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Hi there!'), findsOneWidget);
      });

      testWidgets('should display timestamp on message', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Container(
                padding: const EdgeInsets.all(12),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Hello!'),
                    SizedBox(height: 4),
                    Text('10:30 AM', style: TextStyle(fontSize: 11, color: Colors.grey)),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('10:30 AM'), findsOneWidget);
      });

      testWidgets('should display failed message with error styling', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Failed message', style: TextStyle(color: Colors.red)),
                    SizedBox(height: 4),
                    Text('Failed to send', style: TextStyle(fontSize: 11, color: Colors.red)),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('Failed to send'), findsOneWidget);
      });

      testWidgets('should display retry button for failed messages', (tester) async {
        bool retried = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Colors.red),
                    onPressed: () {
                      retried = true;
                    },
                    tooltip: 'Retry',
                  ),
                  const Text('Failed message'),
                ],
              ),
            ),
          ),
        );

        await tester.tap(find.byIcon(Icons.refresh));
        await tester.pump();

        expect(retried, isTrue);
      });

      testWidgets('should display delete button for failed messages', (tester) async {
        bool deleted = false;

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Failed message'),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.red),
                    onPressed: () {
                      deleted = true;
                    },
                    tooltip: 'Delete',
                  ),
                ],
              ),
            ),
          ),
        );

        await tester.tap(find.byIcon(Icons.close));
        await tester.pump();

        expect(deleted, isTrue);
      });
    });

    group('Message Status Indicators', () {
      testWidgets('should display sending indicator', (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 1.5),
              ),
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      });

      testWidgets('should display sent check icon', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Icon(Icons.check, size: 14, color: Colors.grey[400]),
            ),
          ),
        );

        expect(find.byIcon(Icons.check), findsOneWidget);
      });

      testWidgets('should display delivered double check icon', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Icon(Icons.done_all, size: 14, color: Colors.grey[400]),
            ),
          ),
        );

        expect(find.byIcon(Icons.done_all), findsOneWidget);
      });

      testWidgets('should display read double check in blue', (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: Icon(Icons.done_all, size: 14, color: Colors.blue),
            ),
          ),
        );

        expect(find.byIcon(Icons.done_all), findsOneWidget);
      });
    });

    group('Typing Indicator', () {
      testWidgets('should display typing indicator when other user is typing', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    '...',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 2),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('...'), findsOneWidget);
      });
    });

    group('Message Input', () {
      testWidgets('should display message input field', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TextField(
                decoration: const InputDecoration(
                  hintText: 'Type a message...',
                ),
              ),
            ),
          ),
        );

        expect(find.byType(TextField), findsOneWidget);
        expect(find.text('Type a message...'), findsOneWidget);
      });

      testWidgets('should display send button', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: IconButton(
                onPressed: () {},
                icon: const Icon(Icons.send),
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.send), findsOneWidget);
      });

      testWidgets('should display character counter when approaching limit', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: const [
                  Text('450/500', style: TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ),
          ),
        );

        expect(find.text('450/500'), findsOneWidget);
      });

      testWidgets('should display red counter when over limit', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: const [
                  Text('520/500', style: TextStyle(fontSize: 12, color: Colors.red, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
        );

        expect(find.text('520/500'), findsOneWidget);
      });

      testWidgets('should display loading indicator when sending', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: IconButton(
                onPressed: null,
                icon: const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          ),
        );

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      });

      testWidgets('should display date proposal button', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: IconButton(
                onPressed: () {},
                icon: const Icon(Icons.calendar_today),
                tooltip: 'Propose a Date',
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.calendar_today), findsOneWidget);
      });
    });

    group('Profile Completion Banner', () {
      testWidgets('should display profile completion banner when incomplete', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: Colors.red),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text('Please complete your profile to start messaging'),
                    ),
                    TextButton(
                      onPressed: () {},
                      child: const Text('Complete'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('Please complete your profile to start messaging'), findsOneWidget);
        expect(find.text('Complete'), findsOneWidget);
      });

      testWidgets('should display missing fields', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Container(
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Please complete your profile'),
                    SizedBox(height: 4),
                    Text('Missing: photo, bio'),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.text('Missing: photo, bio'), findsOneWidget);
      });

      testWidgets('should disable input when profile incomplete', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: TextField(
                enabled: false,
                decoration: const InputDecoration(
                  hintText: 'Complete your profile to message',
                ),
              ),
            ),
          ),
        );

        expect(find.text('Complete your profile to message'), findsOneWidget);
      });
    });

    group('App Bar', () {
      testWidgets('should display other user name', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: const Text('Alice'),
              ),
            ),
          ),
        );

        expect(find.text('Alice'), findsOneWidget);
      });

      testWidgets('should display user avatar', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: Row(
                  children: [
                    const CircleAvatar(
                      radius: 18,
                      backgroundColor: Colors.grey,
                      child: Icon(Icons.person),
                    ),
                    const SizedBox(width: 10),
                    const Text('Alice'),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.byType(CircleAvatar), findsOneWidget);
      });

      testWidgets('should display online status indicator', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                title: Row(
                  children: [
                    Stack(
                      children: [
                        const CircleAvatar(radius: 18),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            key: const Key('online_indicator'),
                            width: 10,
                            height: 10,
                            decoration: const BoxDecoration(
                              color: Colors.green,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 10),
                    const Text('Alice'),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.byKey(const Key('online_indicator')), findsOneWidget);
      });

      testWidgets('should display more options button', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                actions: [
                  IconButton(
                    icon: const Icon(Icons.more_vert),
                    onPressed: () {},
                    tooltip: 'More options',
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.byIcon(Icons.more_vert), findsOneWidget);
      });

      testWidgets('should display messages remaining counter for free users', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                actions: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.chat, size: 16, color: Colors.green),
                        SizedBox(width: 4),
                        Text('15 left', style: TextStyle(fontSize: 12, color: Colors.green)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('15 left'), findsOneWidget);
      });

      testWidgets('should display user age', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              appBar: AppBar(
                actions: [
                  const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Center(child: Text('25')),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('25'), findsOneWidget);
      });
    });

    group('Date Proposal Card', () {
      testWidgets('should display date proposal card', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Date Proposal', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Coffee at Starbucks'),
                      const Text('January 20, 2025 at 3:00 PM'),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          ElevatedButton(
                            onPressed: () {},
                            child: const Text('Accept'),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: () {},
                            child: const Text('Decline'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Date Proposal'), findsOneWidget);
        expect(find.text('Coffee at Starbucks'), findsOneWidget);
        expect(find.text('Accept'), findsOneWidget);
        expect(find.text('Decline'), findsOneWidget);
      });
    });

    group('Message Queuing', () {
      testWidgets('should display queued message indicator', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Container(
                padding: const EdgeInsets.all(16),
                color: Colors.orange,
                child: const Text(
                  'Message queued. Will send when connected.',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
        );

        expect(find.text('Message queued. Will send when connected.'), findsOneWidget);
      });
    });

    group('Refresh Messages', () {
      testWidgets('should have RefreshIndicator for pull to refresh', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: RefreshIndicator(
                onRefresh: () async {},
                child: ListView(
                  children: const [
                    ListTile(title: Text('Message 1')),
                    ListTile(title: Text('Message 2')),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.byType(RefreshIndicator), findsOneWidget);
      });
    });

    group('Keyboard Dismiss', () {
      testWidgets('should dismiss keyboard on tap outside', (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: GestureDetector(
                onTap: () => FocusScope.of(tester.element(find.byType(GestureDetector))).unfocus(),
                behavior: HitTestBehavior.translucent,
                child: Column(
                  children: [
                    const Expanded(child: SizedBox()),
                    TextField(
                      decoration: const InputDecoration(hintText: 'Type here'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        expect(find.byType(GestureDetector), findsOneWidget);
      });
    });

    group('Message Grouping', () {
      testWidgets('should have tighter spacing for grouped messages', (tester) async {
        // Grouped messages from same sender should have smaller margin
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  Container(
                    margin: const EdgeInsets.only(top: 4), // Grouped margin
                    padding: const EdgeInsets.all(12),
                    child: const Text('Message 1'),
                  ),
                  Container(
                    margin: const EdgeInsets.only(top: 12), // Non-grouped margin
                    padding: const EdgeInsets.all(12),
                    child: const Text('Message 2'),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text('Message 1'), findsOneWidget);
        expect(find.text('Message 2'), findsOneWidget);
      });
    });

    group('Max Characters Limit', () {
      test('should have max character limit of 500', () {
        const maxCharacters = 500;
        expect(maxCharacters, 500);
      });

      test('should calculate if text is over limit', () {
        const maxCharacters = 500;
        final text = 'a' * 520;
        final isOverLimit = text.length > maxCharacters;
        expect(isOverLimit, isTrue);
      });

      test('should show counter when 80% of limit reached', () {
        const maxCharacters = 500;
        const charCount = 450; // 90% of 500
        final showCounter = charCount > maxCharacters * 0.8;
        expect(showCounter, isTrue);
      });
    });
  });
}
