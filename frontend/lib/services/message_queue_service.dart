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
  static const Duration _maxMessageAge = Duration(hours: 24);

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
            .where((m) => _isMessageFresh(m))
            .toList();
      } catch (_) {
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
  }

  /// Remove message from queue
  Future<void> removeMessage(String id) async {
    final initialLength = _queue.length;
    _queue.removeWhere((m) => m.id == id);

    if (_queue.length != initialLength) {
      await _persist();
      notifyListeners();
    }
  }

  /// Get all queued messages for a specific match
  List<QueuedMessage> getMessagesForMatch(String matchId) {
    return _queue.where((m) => m.matchId == matchId).toList();
  }

  /// Persist queue to SharedPreferences
  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final queueJson = json.encode(_queue.map((m) => m.toJson()).toList());
      await prefs.setString(_storageKey, queueJson);
    } catch (_) {}
  }

  /// Process entire queue - send all queued messages
  Future<void> processQueue(SocketService socketService) async {
    if (_isProcessing) {
      return;
    }

    if (!socketService.isConnected || _queue.isEmpty) {
      return;
    }

    _isProcessing = true;

    final messagesToSend = List<QueuedMessage>.from(_queue);

    for (final message in messagesToSend) {
      try {
        await socketService.sendMessage(
          matchId: message.matchId,
          text: message.content,
          tempId: message.id,
        );

        await removeMessage(message.id);

        await Future.delayed(const Duration(milliseconds: 100));
      } catch (_) {
        final queueIndex = _queue.indexWhere((m) => m.id == message.id);
        if (queueIndex != -1) {
          _queue[queueIndex].retryCount++;

          if (_queue[queueIndex].retryCount >= _maxRetries) {
            await removeMessage(message.id);
          } else {
            await _persist();
          }
        }

        break;
      }
    }

    _isProcessing = false;
  }

  /// Clear all queued messages (e.g., user logout)
  Future<void> clearQueue() async {
    _queue.clear();
    await _persist();
    notifyListeners();
  }

  /// Clear queued messages for a specific match
  Future<void> clearMatch(String matchId) async {
    final initialLength = _queue.length;
    _queue.removeWhere((m) => m.matchId == matchId);

    if (_queue.length != initialLength) {
      await _persist();
      notifyListeners();
    }
  }
}
