import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vlvt/services/message_queue_service.dart';
import 'package:vlvt/services/socket_service.dart';
import 'package:vlvt/services/auth_service.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'message_queue_service_test.mocks.dart';

@GenerateMocks([SocketService, AuthService])
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('MessageQueueService', () {
    late MessageQueueService service;
    late MockSocketService mockSocketService;

    setUp(() async {
      // Reset SharedPreferences before each test
      SharedPreferences.setMockInitialValues({});
      service = MessageQueueService();
      await service.init();

      mockSocketService = MockSocketService();
    });

    group('QueuedMessage', () {
      test('should create QueuedMessage with all required fields', () {
        final now = DateTime.now();
        final message = QueuedMessage(
          id: 'local_123456',
          matchId: 'match_1',
          content: 'Hello World',
          queuedAt: now,
          retryCount: 0,
        );

        expect(message.id, 'local_123456');
        expect(message.matchId, 'match_1');
        expect(message.content, 'Hello World');
        expect(message.queuedAt, now);
        expect(message.retryCount, 0);
      });

      test('should serialize to JSON correctly', () {
        final now = DateTime.now();
        final message = QueuedMessage(
          id: 'local_123',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: now,
          retryCount: 2,
        );

        final json = message.toJson();

        expect(json['id'], 'local_123');
        expect(json['matchId'], 'match_1');
        expect(json['content'], 'Test');
        expect(json['queuedAt'], now.toIso8601String());
        expect(json['retryCount'], 2);
      });

      test('should deserialize from JSON correctly', () {
        final now = DateTime.now();
        final json = {
          'id': 'local_456',
          'matchId': 'match_2',
          'content': 'Test message',
          'queuedAt': now.toIso8601String(),
          'retryCount': 1,
        };

        final message = QueuedMessage.fromJson(json);

        expect(message.id, 'local_456');
        expect(message.matchId, 'match_2');
        expect(message.content, 'Test message');
        expect(message.queuedAt.toIso8601String(), now.toIso8601String());
        expect(message.retryCount, 1);
      });
    });

    group('queueMessage', () {
      test('should add message to queue', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        expect(service.queueLength, 1);
        expect(service.queue.first.id, 'local_1');
      });

      test('should persist message to SharedPreferences', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        // Create new service instance and init - should load from storage
        final newService = MessageQueueService();
        await newService.init();

        expect(newService.queueLength, 1);
        expect(newService.queue.first.id, 'local_1');
      });

      test('should notify listeners when message added', () async {
        bool notified = false;
        service.addListener(() {
          notified = true;
        });

        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        expect(notified, true);
      });
    });

    group('removeMessage', () {
      test('should remove message from queue', () async {
        final message1 = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test 1',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );
        final message2 = QueuedMessage(
          id: 'local_2',
          matchId: 'match_1',
          content: 'Test 2',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message1);
        await service.queueMessage(message2);
        expect(service.queueLength, 2);

        await service.removeMessage('local_1');

        expect(service.queueLength, 1);
        expect(service.queue.first.id, 'local_2');
      });

      test('should persist removal to SharedPreferences', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);
        await service.removeMessage('local_1');

        // Create new service instance and init - should be empty
        final newService = MessageQueueService();
        await newService.init();

        expect(newService.queueLength, 0);
      });

      test('should notify listeners when message removed', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        bool notified = false;
        service.addListener(() {
          notified = true;
        });

        await service.removeMessage('local_1');

        expect(notified, true);
      });

      test('should handle removing non-existent message gracefully', () async {
        await service.removeMessage('non_existent');
        expect(service.queueLength, 0);
      });
    });

    group('getMessagesForMatch', () {
      test('should return messages for specific match', () async {
        final message1 = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test 1',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );
        final message2 = QueuedMessage(
          id: 'local_2',
          matchId: 'match_2',
          content: 'Test 2',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );
        final message3 = QueuedMessage(
          id: 'local_3',
          matchId: 'match_1',
          content: 'Test 3',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message1);
        await service.queueMessage(message2);
        await service.queueMessage(message3);

        final match1Messages = service.getMessagesForMatch('match_1');

        expect(match1Messages.length, 2);
        expect(match1Messages[0].id, 'local_1');
        expect(match1Messages[1].id, 'local_3');
      });

      test('should return empty list for match with no messages', () {
        final messages = service.getMessagesForMatch('non_existent_match');
        expect(messages, isEmpty);
      });
    });

    group('processQueue', () {
      test('should send messages and remove on success', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        // Mock successful send
        when(mockSocketService.isConnected).thenReturn(true);
        when(mockSocketService.sendMessage(
          matchId: anyNamed('matchId'),
          text: anyNamed('text'),
          tempId: anyNamed('tempId'),
        )).thenAnswer((_) async => Future.value());

        await service.processQueue(mockSocketService);

        expect(service.queueLength, 0);
        verify(mockSocketService.sendMessage(
          matchId: 'match_1',
          text: 'Test',
          tempId: 'local_1',
        )).called(1);
      });

      test('should increment retryCount on failure', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        // Mock failed send
        when(mockSocketService.isConnected).thenReturn(true);
        when(mockSocketService.sendMessage(
          matchId: anyNamed('matchId'),
          text: anyNamed('text'),
          tempId: anyNamed('tempId'),
        )).thenThrow(Exception('Network error'));

        await service.processQueue(mockSocketService);

        expect(service.queueLength, 1);
        expect(service.queue.first.retryCount, 1);
      });

      test('should remove message after max retries', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 2, // Already failed twice
        );

        await service.queueMessage(message);

        // Mock failed send
        when(mockSocketService.isConnected).thenReturn(true);
        when(mockSocketService.sendMessage(
          matchId: anyNamed('matchId'),
          text: anyNamed('text'),
          tempId: anyNamed('tempId'),
        )).thenThrow(Exception('Network error'));

        await service.processQueue(mockSocketService);

        // Should be removed after 3rd failure
        expect(service.queueLength, 0);
      });

      test('should not process queue when socket disconnected', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        when(mockSocketService.isConnected).thenReturn(false);

        await service.processQueue(mockSocketService);

        expect(service.queueLength, 1);
        verifyNever(mockSocketService.sendMessage(
          matchId: anyNamed('matchId'),
          text: anyNamed('text'),
          tempId: anyNamed('tempId'),
        ));
      });

      test('should not process queue when already processing', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        when(mockSocketService.isConnected).thenReturn(true);
        when(mockSocketService.sendMessage(
          matchId: anyNamed('matchId'),
          text: anyNamed('text'),
          tempId: anyNamed('tempId'),
        )).thenAnswer((_) async {
          // Simulate slow network
          await Future.delayed(const Duration(milliseconds: 100));
          return null;
        });

        // Start processing
        final future1 = service.processQueue(mockSocketService);
        // Try to process again while first is still running
        final future2 = service.processQueue(mockSocketService);

        await Future.wait([future1, future2]);

        // Should only send once
        verify(mockSocketService.sendMessage(
          matchId: anyNamed('matchId'),
          text: anyNamed('text'),
          tempId: anyNamed('tempId'),
        )).called(1);
      });

      test('should handle multiple messages in queue', () async {
        final message1 = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test 1',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );
        final message2 = QueuedMessage(
          id: 'local_2',
          matchId: 'match_2',
          content: 'Test 2',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message1);
        await service.queueMessage(message2);

        when(mockSocketService.isConnected).thenReturn(true);
        when(mockSocketService.sendMessage(
          matchId: anyNamed('matchId'),
          text: anyNamed('text'),
          tempId: anyNamed('tempId'),
        )).thenAnswer((_) async => Future.value());

        await service.processQueue(mockSocketService);

        expect(service.queueLength, 0);
        verify(mockSocketService.sendMessage(
          matchId: 'match_1',
          text: 'Test 1',
          tempId: 'local_1',
        )).called(1);
        verify(mockSocketService.sendMessage(
          matchId: 'match_2',
          text: 'Test 2',
          tempId: 'local_2',
        )).called(1);
      });
    });

    group('initialize', () {
      test('should load persisted queue on init', () async {
        final message = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message);

        // Create new service instance
        final newService = MessageQueueService();
        await newService.init();

        expect(newService.queueLength, 1);
        expect(newService.queue.first.id, 'local_1');
        expect(newService.queue.first.content, 'Test');
      });

      test('should handle empty storage gracefully', () async {
        final newService = MessageQueueService();
        await newService.init();

        expect(newService.queueLength, 0);
      });

      test('should handle corrupted storage data gracefully', () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('vlvt_message_queue', 'invalid json');

        final newService = MessageQueueService();
        await newService.init();

        expect(newService.queueLength, 0);
      });
    });

    group('clearQueue', () {
      test('should clear all messages', () async {
        final message1 = QueuedMessage(
          id: 'local_1',
          matchId: 'match_1',
          content: 'Test 1',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );
        final message2 = QueuedMessage(
          id: 'local_2',
          matchId: 'match_2',
          content: 'Test 2',
          queuedAt: DateTime.now(),
          retryCount: 0,
        );

        await service.queueMessage(message1);
        await service.queueMessage(message2);

        await service.clearQueue();

        expect(service.queueLength, 0);
      });
    });
  });
}
