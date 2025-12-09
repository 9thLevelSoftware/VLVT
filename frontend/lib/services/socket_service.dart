/// Socket.IO Service for Real-time Messaging
/// Handles WebSocket connections and real-time events
library;

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import '../models/message.dart';
import '../config/app_config.dart';
import 'auth_service.dart';
import 'message_queue_service.dart';

/// Represents online status of a user
class UserStatus {
  final String userId;
  final bool isOnline;
  final DateTime? lastSeenAt;

  UserStatus({
    required this.userId,
    required this.isOnline,
    this.lastSeenAt,
  });

  factory UserStatus.fromJson(Map<String, dynamic> json) {
    return UserStatus(
      userId: json['userId'] as String,
      isOnline: json['isOnline'] as bool,
      lastSeenAt: json['lastSeenAt'] != null
          ? DateTime.parse(json['lastSeenAt'] as String)
          : null,
    );
  }
}

/// Socket.IO service for real-time messaging
class SocketService extends ChangeNotifier {
  socket_io.Socket? _socket;
  final AuthService _authService;
  MessageQueueService? _messageQueueService;
  bool _isConnected = false;
  bool _isConnecting = false;

  // Event stream controllers
  final _messageController = StreamController<Message>.broadcast();
  final _messageReadController = StreamController<Map<String, dynamic>>.broadcast();
  final _typingController = StreamController<Map<String, dynamic>>.broadcast();
  final _statusController = StreamController<UserStatus>.broadcast();
  final _connectionController = StreamController<bool>.broadcast();

  // Getters for streams
  Stream<Message> get onNewMessage => _messageController.stream;
  Stream<Map<String, dynamic>> get onMessagesRead => _messageReadController.stream;
  Stream<Map<String, dynamic>> get onUserTyping => _typingController.stream;
  Stream<UserStatus> get onUserStatusChanged => _statusController.stream;
  Stream<bool> get onConnectionChanged => _connectionController.stream;

  bool get isConnected => _isConnected;
  bool get isConnecting => _isConnecting;

  SocketService(this._authService);

  /// Set the MessageQueueService for auto-processing on reconnection
  void setMessageQueueService(MessageQueueService queueService) {
    _messageQueueService = queueService;
  }

  /// Connect to Socket.IO server
  Future<void> connect() async {
    if (_isConnected || _isConnecting) {
      debugPrint('Socket: Already connected or connecting');
      return;
    }

    final token = await _authService.getToken();
    if (token == null) {
      debugPrint('Socket: No auth token available');
      return;
    }

    _isConnecting = true;
    notifyListeners();

    try {
      final chatUrl = AppConfig.chatServiceUrl;
      debugPrint('Socket: Connecting to $chatUrl');

      _socket = socket_io.io(
        chatUrl,
        socket_io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .enableAutoConnect()
            .enableReconnection()
            .setReconnectionAttempts(20) // Increased for better resilience to brief outages
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(30000) // Max 30s between attempts
            .setAuth({
              'token': token,
            })
            .build(),
      );

      _setupEventHandlers();
      _socket!.connect();
    } catch (e) {
      debugPrint('Socket: Connection error: $e');
      _isConnecting = false;
      notifyListeners();
    }
  }

  /// Setup Socket.IO event handlers
  void _setupEventHandlers() {
    if (_socket == null) return;

    // Connection events
    _socket!.onConnect((_) {
      debugPrint('Socket: Connected successfully');
      _isConnected = true;
      _isConnecting = false;
      _connectionController.add(true);
      notifyListeners();

      // FIX: Auto-process message queue on reconnection
      if (_messageQueueService != null) {
        debugPrint('Socket: Triggering auto-process of message queue');
        _messageQueueService!.processQueue(this);
      }
    });

    _socket!.onDisconnect((_) {
      debugPrint('Socket: Disconnected');
      _isConnected = false;
      _isConnecting = false;
      _connectionController.add(false);
      notifyListeners();
    });

    _socket!.onConnectError((error) {
      debugPrint('Socket: Connection error: $error');
      _isConnecting = false;
      notifyListeners();
    });

    _socket!.onError((error) {
      debugPrint('Socket: Error: $error');
    });

    _socket!.on('connect_timeout', (_) {
      debugPrint('Socket: Connection timeout');
      _isConnecting = false;
      notifyListeners();
    });

    // Message events
    _socket!.on('new_message', (data) {
      debugPrint('Socket: New message received');
      try {
        // Safe type check before casting
        if (data is! Map<String, dynamic>) {
          debugPrint('Socket: Invalid new_message data type: ${data.runtimeType}');
          return;
        }
        final message = Message.fromJson(data);
        _messageController.add(message);
      } catch (e) {
        debugPrint('Socket: Error parsing new message: $e');
      }
    });

    _socket!.on('messages_read', (data) {
      debugPrint('Socket: Messages marked as read');
      try {
        // Safe type check before casting
        if (data is! Map<String, dynamic>) {
          debugPrint('Socket: Invalid messages_read data type: ${data.runtimeType}');
          return;
        }
        _messageReadController.add(data);
      } catch (e) {
        debugPrint('Socket: Error parsing read receipt: $e');
      }
    });

    // Typing indicators
    _socket!.on('user_typing', (data) {
      debugPrint('Socket: User typing indicator');
      try {
        // Safe type check before casting
        if (data is! Map<String, dynamic>) {
          debugPrint('Socket: Invalid user_typing data type: ${data.runtimeType}');
          return;
        }
        _typingController.add(data);
      } catch (e) {
        debugPrint('Socket: Error parsing typing indicator: $e');
      }
    });

    // Online status
    _socket!.on('user_status_changed', (data) {
      debugPrint('Socket: User status changed');
      try {
        // Safe type check before casting
        if (data is! Map<String, dynamic>) {
          debugPrint('Socket: Invalid user_status_changed data type: ${data.runtimeType}');
          return;
        }
        final status = UserStatus.fromJson(data);
        _statusController.add(status);
      } catch (e) {
        debugPrint('Socket: Error parsing status: $e');
      }
    });
  }

  /// Send a message
  Future<Message?> sendMessage({
    required String matchId,
    required String text,
    String? tempId,
  }) async {
    if (!_isConnected || _socket == null) {
      debugPrint('Socket: Cannot send message - not connected');
      return null;
    }

    final completer = Completer<Message?>();
    bool hasCompleted = false;

    // Timeout after 10 seconds
    Timer(const Duration(seconds: 10), () {
      if (!hasCompleted) {
        debugPrint('Socket: Message send timed out');
        hasCompleted = true;
        completer.complete(null);
      }
    });

    _socket!.emitWithAck('send_message', {
      'matchId': matchId,
      'text': text,
      'tempId': tempId,
    }, ack: (response) {
      if (hasCompleted) return; // Already timed out
      hasCompleted = true;
      try {
        // Safe type check before casting
        if (response is! Map<String, dynamic>) {
          debugPrint('Socket: Invalid send_message ack type: ${response.runtimeType}');
          completer.complete(null);
          return;
        }
        debugPrint('Socket: Received ack response: $response');
        if (response['success'] == true) {
          final messageData = response['message'];
          if (messageData is! Map<String, dynamic>) {
            debugPrint('Socket: Invalid message data type in ack');
            completer.complete(null);
            return;
          }
          final message = Message.fromJson(messageData);
          debugPrint('Socket: Message sent successfully');
          completer.complete(message);
        } else {
          debugPrint('Socket: Message send failed: ${response['error']}');
          completer.complete(null);
        }
      } catch (e) {
        debugPrint('Socket: Error parsing send response: $e');
        completer.complete(null);
      }
    });

    return completer.future;
  }

  /// Mark messages as read
  Future<bool> markMessagesAsRead({
    required String matchId,
    List<String>? messageIds,
  }) async {
    if (!_isConnected || _socket == null) {
      debugPrint('Socket: Cannot mark as read - not connected');
      return false;
    }

    final completer = Completer<bool>();

    _socket!.emitWithAck('mark_read', {
      'matchId': matchId,
      if (messageIds != null) 'messageIds': messageIds,
    }, ack: (response) {
      try {
        // Safe type check before casting
        if (response is! Map<String, dynamic>) {
          debugPrint('Socket: Invalid mark_read ack type: ${response.runtimeType}');
          completer.complete(false);
          return;
        }
        final success = response['success'] == true;
        debugPrint('Socket: Mark as read ${success ? 'succeeded' : 'failed'}');
        completer.complete(success);
      } catch (e) {
        debugPrint('Socket: Error parsing mark read response: $e');
        completer.complete(false);
      }
    });

    return completer.future;
  }

  /// Send typing indicator
  Future<void> sendTypingIndicator({
    required String matchId,
    required bool isTyping,
  }) async {
    if (!_isConnected || _socket == null) {
      return;
    }

    _socket!.emit('typing', {
      'matchId': matchId,
      'isTyping': isTyping,
    });
  }

  /// Get online status of users
  Future<List<UserStatus>> getOnlineStatus(List<String> userIds) async {
    if (!_isConnected || _socket == null) {
      debugPrint('Socket: Cannot get status - not connected');
      return [];
    }

    final completer = Completer<List<UserStatus>>();

    _socket!.emitWithAck('get_online_status', {
      'userIds': userIds,
    }, ack: (response) {
      try {
        // Safe type check before casting
        if (response is! Map<String, dynamic>) {
          debugPrint('Socket: Invalid get_online_status ack type: ${response.runtimeType}');
          completer.complete([]);
          return;
        }
        if (response['success'] == true) {
          final statusesData = response['statuses'];
          if (statusesData is! List) {
            debugPrint('Socket: Invalid statuses data type');
            completer.complete([]);
            return;
          }
          final statuses = statusesData
              .whereType<Map<String, dynamic>>()
              .map((s) => UserStatus.fromJson(s))
              .toList();
          completer.complete(statuses);
        } else {
          completer.complete([]);
        }
      } catch (e) {
        debugPrint('Socket: Error parsing status response: $e');
        completer.complete([]);
      }
    });

    return completer.future;
  }

  /// Disconnect from Socket.IO server
  void disconnect() {
    debugPrint('Socket: Disconnecting');
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
    _isConnecting = false;
    notifyListeners();
  }

  /// Reconnect to Socket.IO server
  Future<void> reconnect() async {
    disconnect();
    await Future.delayed(const Duration(milliseconds: 500));
    await connect();
  }

  @override
  void dispose() {
    disconnect();
    _messageController.close();
    _messageReadController.close();
    _typingController.close();
    _statusController.close();
    _connectionController.close();
    super.dispose();
  }
}
