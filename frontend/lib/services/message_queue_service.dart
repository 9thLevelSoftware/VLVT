import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'socket_service.dart';

/// Represents a message queued for sending when connection is restored
class QueuedMessage {
  final String id;
  final String matchId;
  final String content;
  final DateTime queuedAt;
  int retryCount;

  QueuedMessage({
    required this.id,
    required this.matchId,
    required this.content,
    required this.queuedAt,
    this.retryCount = 0,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'matchId': matchId,
    'content': content,
    'queuedAt': queuedAt.toIso8601String(),
    'retryCount': retryCount,
  };

  factory QueuedMessage.fromJson(Map<String, dynamic> json) => QueuedMessage(
    id: json['id'] as String,
    matchId: json['matchId'] as String,
    content: json['content'] as String,
    queuedAt: DateTime.parse(json['queuedAt'] as String),
    retryCount: json['retryCount'] as int? ?? 0,
  );
}

/// Service for queuing messages when offline and sending when connection is restored
/// Prevents message loss on spotty networks (cafes, subways, rural areas)
class MessageQueueService extends ChangeNotifier {
  static const String _storageKey = 'vlvt_message_queue';
  static const int _maxRetries = 3;
  static const Duration _maxMessageAge = Duration(hours: 24); // Auto-delete messages older than 24h

  List<QueuedMessage> _queue = [];
  bool _isProcessing = false;

  List<QueuedMessage> get queue => List.unmodifiable(_queue);
  int get queueLength => _queue.length;

  /// Initialize service and load persisted queue
  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final queueJson = prefs.getString(_storageKey);

    if (queueJson != null) {
      try {
        final List<dynamic> decoded = json.decode(queueJson);
        _queue = decoded
            .map((m) => QueuedMessage.fromJson(m as Map<String, dynamic>))
            .where((m) => _isMessageFresh(m)) // Remove expired messages
            .toList();

        debugPrint('MessageQueueService: Loaded ${_queue.length} queued messages');
      } catch (e) {
        debugPrint('MessageQueueService: Error loading queue: $e');
        _queue = [];
      }
    }
  }

  /// Initialize service (alias for init for consistency)
  Future<void> initialize() async {
    await init();
  }

  /// Check if message is still fresh (not older than 24 hours)
  bool _isMessageFresh(QueuedMessage message) {
    final age = DateTime.now().difference(message.queuedAt);
    return age < _maxMessageAge;
  }

  /// Add message to queue
  Future<void> queueMessage(QueuedMessage message) async {
    _queue.add(message);
    await _persist();
    notifyListeners();

    debugPrint('MessageQueueService: Queued message ${message.id} for match ${message.matchId}');
  }

  /// Remove message from queue
  Future<void> removeMessage(String id) async {
    final initialLength = _queue.length;
    _queue.removeWhere((m) => m.id == id);

    if (_queue.length != initialLength) {
      await _persist();
      notifyListeners();
      debugPrint('MessageQueueService: Removed message $id from queue');
    }
  }

  /// Get all queued messages for a specific match
  List<QueuedMessage> getMessagesForMatch(String matchId) {
    return _queue.where((m) => m.matchId == matchId).toList();
  }

  /// Legacy method names for backward compatibility
  @Deprecated('Use queueMessage instead')
  Future<void> enqueue(QueuedMessage message) async {
    await queueMessage(message);
  }

  @Deprecated('Use removeMessage instead')
  Future<void> dequeue(String id) async {
    await removeMessage(id);
  }

  @Deprecated('Use getMessagesForMatch instead')
  List<QueuedMessage> getQueueForMatch(String matchId) {
    return getMessagesForMatch(matchId);
  }

  /// Persist queue to SharedPreferences
  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final queueJson = json.encode(_queue.map((m) => m.toJson()).toList());
      await prefs.setString(_storageKey, queueJson);
    } catch (e) {
      debugPrint('MessageQueueService: Error persisting queue: $e');
    }
  }

  /// Process entire queue - send all queued messages
  Future<void> processQueue(SocketService socketService) async {
    if (_isProcessing) {
      debugPrint('MessageQueueService: Already processing queue, skipping');
      return;
    }

    if (!socketService.isConnected || _queue.isEmpty) {
      debugPrint('MessageQueueService: Cannot process - socket connected: ${socketService.isConnected}, queue empty: ${_queue.isEmpty}');
      return;
    }

    _isProcessing = true;
    debugPrint('MessageQueueService: Processing ${_queue.length} queued messages');

    final messagesToSend = List<QueuedMessage>.from(_queue);
    int successCount = 0;
    int failureCount = 0;

    for (final message in messagesToSend) {
      try {
        debugPrint('MessageQueueService: Sending queued message ${message.id} (retry ${message.retryCount})');

        await socketService.sendMessage(
          matchId: message.matchId,
          text: message.content,
          tempId: message.id,
        );

        await removeMessage(message.id);
        successCount++;

        // Small delay between messages to avoid overwhelming the server
        await Future.delayed(const Duration(milliseconds: 100));
      } catch (e) {
        debugPrint('MessageQueueService: Failed to send queued message: $e');
        failureCount++;

        // Increment retry count
        message.retryCount++;

        // Remove message if max retries reached
        if (message.retryCount >= _maxRetries) {
          debugPrint('MessageQueueService: Max retries reached for message ${message.id}, removing from queue');
          await removeMessage(message.id);
        } else {
          // Persist updated retry count
          await _persist();
        }

        // If one fails, stop trying (probably connection issue)
        break;
      }
    }

    _isProcessing = false;
    debugPrint('MessageQueueService: Queue processing complete - success: $successCount, failed: $failureCount, remaining: ${_queue.length}');
  }

  /// Clear all queued messages (e.g., user logout)
  Future<void> clearQueue() async {
    _queue.clear();
    await _persist();
    notifyListeners();
    debugPrint('MessageQueueService: Cleared all queued messages');
  }

  /// Clear queued messages for a specific match
  Future<void> clearMatch(String matchId) async {
    final initialLength = _queue.length;
    _queue.removeWhere((m) => m.matchId == matchId);

    if (_queue.length != initialLength) {
      await _persist();
      notifyListeners();
      debugPrint('MessageQueueService: Cleared ${initialLength - _queue.length} messages for match $matchId');
    }
  }

  /// Legacy method name for backward compatibility
  @Deprecated('Use clearQueue instead')
  Future<void> clearAll() async {
    await clearQueue();
  }
}
