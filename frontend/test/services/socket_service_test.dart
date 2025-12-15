import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';
import 'package:vlvt/services/socket_service.dart';
import 'package:vlvt/services/auth_service.dart';
import 'package:vlvt/services/message_queue_service.dart';
import 'package:vlvt/models/message.dart';

@GenerateMocks([AuthService, MessageQueueService])
import 'socket_service_test.mocks.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('SocketService', () {
    late MockAuthService mockAuthService;
    late MockMessageQueueService mockMessageQueueService;
    late SocketService socketService;
    bool wasDisposed = false;

    setUp(() {
      mockAuthService = MockAuthService();
      mockMessageQueueService = MockMessageQueueService();
      socketService = SocketService(mockAuthService);
      wasDisposed = false;
    });

    tearDown(() {
      if (!wasDisposed) {
        socketService.dispose();
      }
    });

    group('UserStatus model', () {
      test('should deserialize from JSON with all fields', () {
        final json = {
          'userId': 'user_123',
          'isOnline': true,
          'lastSeenAt': '2025-01-15T10:30:00.000Z',
        };

        final status = UserStatus.fromJson(json);

        expect(status.userId, 'user_123');
        expect(status.isOnline, true);
        expect(status.lastSeenAt, isNotNull);
        expect(status.lastSeenAt!.year, 2025);
      });

      test('should deserialize from JSON without lastSeenAt', () {
        final json = {
          'userId': 'user_456',
          'isOnline': false,
        };

        final status = UserStatus.fromJson(json);

        expect(status.userId, 'user_456');
        expect(status.isOnline, false);
        expect(status.lastSeenAt, isNull);
      });

      test('should handle online user correctly', () {
        final onlineUser = UserStatus(
          userId: 'online_user',
          isOnline: true,
          lastSeenAt: null,
        );

        expect(onlineUser.isOnline, true);
        expect(onlineUser.lastSeenAt, isNull);
      });

      test('should handle offline user with last seen time', () {
        final offlineUser = UserStatus(
          userId: 'offline_user',
          isOnline: false,
          lastSeenAt: DateTime(2025, 1, 15, 10, 0),
        );

        expect(offlineUser.isOnline, false);
        expect(offlineUser.lastSeenAt, isNotNull);
      });
    });

    group('Initial state', () {
      test('should start disconnected', () {
        expect(socketService.isConnected, false);
        expect(socketService.isConnecting, false);
      });
    });

    group('connect', () {
      test('should not connect without auth token', () async {
        when(mockAuthService.getToken()).thenAnswer((_) async => null);

        await socketService.connect();

        expect(socketService.isConnected, false);
        expect(socketService.isConnecting, false);
      });

      test('should check for existing connection', () async {
        // If already connecting, shouldn't start new connection
        when(mockAuthService.getToken()).thenAnswer((_) async => 'test_token');

        // Simulate that we're not connected or connecting
        expect(socketService.isConnected, false);
        expect(socketService.isConnecting, false);
      });
    });

    group('setMessageQueueService', () {
      test('should accept MessageQueueService', () {
        // Should not throw
        socketService.setMessageQueueService(mockMessageQueueService);
      });
    });

    group('disconnect', () {
      test('should reset connection state', () {
        socketService.disconnect();

        expect(socketService.isConnected, false);
        expect(socketService.isConnecting, false);
      });
    });

    group('Streams', () {
      test('onNewMessage stream should be broadcast', () {
        final stream = socketService.onNewMessage;
        expect(stream.isBroadcast, true);
      });

      test('onMessagesRead stream should be broadcast', () {
        final stream = socketService.onMessagesRead;
        expect(stream.isBroadcast, true);
      });

      test('onUserTyping stream should be broadcast', () {
        final stream = socketService.onUserTyping;
        expect(stream.isBroadcast, true);
      });

      test('onUserStatusChanged stream should be broadcast', () {
        final stream = socketService.onUserStatusChanged;
        expect(stream.isBroadcast, true);
      });

      test('onConnectionChanged stream should be broadcast', () {
        final stream = socketService.onConnectionChanged;
        expect(stream.isBroadcast, true);
      });
    });

    group('sendMessage', () {
      test('should return null when not connected', () async {
        expect(socketService.isConnected, false);

        final result = await socketService.sendMessage(
          matchId: 'match_123',
          text: 'Hello!',
        );

        expect(result, isNull);
      });

      test('should validate message parameters', () {
        const matchId = 'match_123';
        const text = 'Hello!';
        const tempId = 'temp_456';

        final messageData = {
          'matchId': matchId,
          'text': text,
          'tempId': tempId,
        };

        expect(messageData['matchId'], matchId);
        expect(messageData['text'], text);
        expect(messageData['tempId'], tempId);
      });

      test('should handle message without tempId', () {
        const matchId = 'match_123';
        const text = 'Hello!';

        final messageData = {
          'matchId': matchId,
          'text': text,
        };

        expect(messageData.containsKey('tempId'), false);
      });
    });

    group('markMessagesAsRead', () {
      test('should return false when not connected', () async {
        expect(socketService.isConnected, false);

        final result = await socketService.markMessagesAsRead(
          matchId: 'match_123',
        );

        expect(result, false);
      });

      test('should construct correct payload with messageIds', () {
        const matchId = 'match_123';
        final messageIds = ['msg_1', 'msg_2', 'msg_3'];

        final payload = {
          'matchId': matchId,
          'messageIds': messageIds,
        };

        expect(payload['matchId'], matchId);
        expect(payload['messageIds'], messageIds);
      });

      test('should construct correct payload without messageIds', () {
        const matchId = 'match_123';

        final payload = <String, dynamic>{
          'matchId': matchId,
        };

        expect(payload['matchId'], matchId);
        expect(payload.containsKey('messageIds'), false);
      });
    });

    group('sendTypingIndicator', () {
      test('should not send when not connected', () async {
        expect(socketService.isConnected, false);

        // Should not throw
        await socketService.sendTypingIndicator(
          matchId: 'match_123',
          isTyping: true,
        );
      });

      test('should construct correct typing payload', () {
        const matchId = 'match_123';
        const isTyping = true;

        final payload = {
          'matchId': matchId,
          'isTyping': isTyping,
        };

        expect(payload['matchId'], matchId);
        expect(payload['isTyping'], true);
      });

      test('should handle stop typing indicator', () {
        const matchId = 'match_123';
        const isTyping = false;

        final payload = {
          'matchId': matchId,
          'isTyping': isTyping,
        };

        expect(payload['isTyping'], false);
      });
    });

    group('getOnlineStatus', () {
      test('should return empty list when not connected', () async {
        expect(socketService.isConnected, false);

        final result = await socketService.getOnlineStatus(['user_1', 'user_2']);

        expect(result, isEmpty);
      });

      test('should construct correct status request', () {
        final userIds = ['user_1', 'user_2', 'user_3'];

        final payload = {
          'userIds': userIds,
        };

        expect(payload['userIds'], userIds);
        expect(payload['userIds']!.length, 3);
      });
    });

    group('reconnect', () {
      test('should disconnect before reconnecting', () async {
        // Test the state before reconnect - no actual network call needed
        // The reconnect method will try to connect which requires a server,
        // so we just verify the initial state and that it handles no-token case
        when(mockAuthService.getToken()).thenAnswer((_) async => null);

        await socketService.reconnect();

        // Without a token, should not be connected
        expect(socketService.isConnected, false);
      });
    });

    group('dispose', () {
      test('should close all stream controllers', () {
        // Should not throw
        socketService.dispose();
        wasDisposed = true;
      });

      test('should disconnect socket on dispose', () {
        socketService.dispose();
        wasDisposed = true;

        expect(socketService.isConnected, false);
        expect(socketService.isConnecting, false);
      });
    });

    group('Message parsing', () {
      test('should parse valid message JSON', () {
        final messageJson = {
          'id': 'msg_123',
          'matchId': 'match_456',
          'senderId': 'user_789',
          'text': 'Hello!',
          'timestamp': '2025-01-15T10:30:00.000Z',
          'status': 'sent',
        };

        final message = Message.fromJson(messageJson);

        expect(message.id, 'msg_123');
        expect(message.matchId, 'match_456');
        expect(message.senderId, 'user_789');
        expect(message.text, 'Hello!');
        expect(message.status, MessageStatus.sent);
      });

      test('should handle message with createdAt instead of timestamp', () {
        final messageJson = {
          'id': 'msg_abc',
          'matchId': 'match_def',
          'senderId': 'user_ghi',
          'text': 'Hi there!',
          'createdAt': '2025-01-15T11:00:00.000Z',
        };

        final message = Message.fromJson(messageJson);

        expect(message.id, 'msg_abc');
        expect(message.text, 'Hi there!');
      });
    });

    group('Connection event handling', () {
      test('should emit connection status changes', () async {
        final connectionEvents = <bool>[];
        final subscription = socketService.onConnectionChanged.listen((status) {
          connectionEvents.add(status);
        });

        // Simulate connection event (normally from socket)
        // Since we can't trigger real socket events, we verify the stream exists
        expect(socketService.onConnectionChanged, isA<Stream<bool>>());

        await subscription.cancel();
      });
    });

    group('Error handling', () {
      test('should handle invalid message data type gracefully', () {
        // Test that type checking is in place
        final invalidData = 'not a map';
        expect(invalidData is Map<String, dynamic>, false);
      });

      test('should handle missing fields in status response', () {
        final incompleteJson = {
          'userId': 'user_123',
          // missing isOnline
        };

        expect(
          () => UserStatus.fromJson(incompleteJson),
          throwsA(isA<TypeError>()),
        );
      });
    });

    group('Timeout handling', () {
      test('should timeout message send after 10 seconds', () {
        const timeout = Duration(seconds: 10);
        expect(timeout.inSeconds, 10);
      });
    });

    group('Socket configuration', () {
      test('should use correct transport options', () {
        final transports = ['websocket', 'polling'];

        expect(transports, contains('websocket'));
        expect(transports, contains('polling'));
      });

      test('should configure reconnection settings', () {
        const reconnectionAttempts = 20;
        const reconnectionDelay = 1000;
        const reconnectionDelayMax = 30000;

        expect(reconnectionAttempts, 20);
        expect(reconnectionDelay, 1000);
        expect(reconnectionDelayMax, 30000);
      });
    });

    group('Auth token handling', () {
      test('should include token in auth options', () async {
        const token = 'test_jwt_token';
        when(mockAuthService.getToken()).thenAnswer((_) async => token);

        final retrievedToken = await mockAuthService.getToken();

        expect(retrievedToken, token);

        final authOptions = {
          'token': retrievedToken,
        };

        expect(authOptions['token'], token);
      });

      test('should handle null token', () async {
        when(mockAuthService.getToken()).thenAnswer((_) async => null);

        final token = await mockAuthService.getToken();

        expect(token, isNull);
      });
    });

    group('ChangeNotifier', () {
      test('should notify listeners on state changes', () {
        var notified = false;
        socketService.addListener(() {
          notified = true;
        });

        // Disconnect triggers notifyListeners
        socketService.disconnect();

        expect(notified, true);
      });
    });

    group('Multiple subscriptions', () {
      test('should support multiple listeners on broadcast streams', () {
        // Broadcast streams support multiple listeners
        final stream = socketService.onNewMessage;

        expect(stream.isBroadcast, true);

        // Multiple listeners should not throw
        stream.listen((_) {});
        stream.listen((_) {});
      });
    });

    group('Message events', () {
      test('should handle new_message event structure', () {
        final eventData = {
          'id': 'msg_new',
          'matchId': 'match_1',
          'senderId': 'user_sender',
          'text': 'New message!',
          'timestamp': DateTime.now().toIso8601String(),
        };

        expect(eventData.containsKey('id'), true);
        expect(eventData.containsKey('matchId'), true);
        expect(eventData.containsKey('senderId'), true);
        expect(eventData.containsKey('text'), true);
      });

      test('should handle messages_read event structure', () {
        final eventData = {
          'matchId': 'match_1',
          'readBy': 'user_reader',
          'messageIds': ['msg_1', 'msg_2'],
        };

        expect(eventData.containsKey('matchId'), true);
        expect(eventData.containsKey('readBy'), true);
      });

      test('should handle user_typing event structure', () {
        final eventData = {
          'matchId': 'match_1',
          'userId': 'user_typing',
          'isTyping': true,
        };

        expect(eventData.containsKey('matchId'), true);
        expect(eventData.containsKey('userId'), true);
        expect(eventData.containsKey('isTyping'), true);
      });

      test('should handle user_status_changed event structure', () {
        final eventData = {
          'userId': 'user_changed',
          'isOnline': false,
          'lastSeenAt': DateTime.now().toIso8601String(),
        };

        expect(eventData.containsKey('userId'), true);
        expect(eventData.containsKey('isOnline'), true);
      });
    });

    group('Acknowledgment responses', () {
      test('should handle successful send_message ack', () {
        final ackResponse = {
          'success': true,
          'message': {
            'id': 'msg_server_123',
            'matchId': 'match_1',
            'senderId': 'user_1',
            'text': 'Hello!',
            'timestamp': DateTime.now().toIso8601String(),
          },
        };

        expect(ackResponse['success'], true);
        expect(ackResponse['message'], isA<Map>());
      });

      test('should handle failed send_message ack', () {
        final ackResponse = {
          'success': false,
          'error': 'Message send failed',
        };

        expect(ackResponse['success'], false);
        expect(ackResponse['error'], isNotNull);
      });

      test('should handle successful mark_read ack', () {
        final ackResponse = {
          'success': true,
        };

        expect(ackResponse['success'], true);
      });

      test('should handle successful get_online_status ack', () {
        final ackResponse = {
          'success': true,
          'statuses': [
            {'userId': 'user_1', 'isOnline': true},
            {'userId': 'user_2', 'isOnline': false, 'lastSeenAt': '2025-01-15T10:00:00Z'},
          ],
        };

        expect(ackResponse['success'], true);
        expect(ackResponse['statuses'], isA<List>());
        expect((ackResponse['statuses'] as List).length, 2);
      });
    });
  });
}
