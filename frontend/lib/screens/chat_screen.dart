import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../services/chat_api_service.dart';
import '../services/profile_api_service.dart';
import '../services/subscription_service.dart';
import '../models/match.dart';
import '../models/message.dart';
import '../models/profile.dart';
import '../utils/date_utils.dart';
import '../widgets/user_action_sheet.dart';
import '../widgets/premium_gate_dialog.dart';

class ChatScreen extends StatefulWidget {
  final Match match;

  const ChatScreen({super.key, required this.match});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  List<Message>? _messages;
  bool _isLoading = true;
  bool _isSending = false;
  String? _errorMessage;
  Profile? _otherUserProfile;
  Timer? _pollingTimer;
  Timer? _typingTimer;
  bool _isTyping = false;
  bool _isRefreshing = false;
  static const int _maxCharacters = 500;
  static const Duration _pollingInterval = Duration(seconds: 4);
  static const Duration _typingTimeout = Duration(seconds: 2);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadData();
    _startPolling();
    _messageController.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopPolling();
    _typingTimer?.cancel();
    _messageController.removeListener(_onTextChanged);
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Only poll when app is in foreground
    if (state == AppLifecycleState.resumed) {
      _startPolling();
    } else if (state == AppLifecycleState.paused) {
      _stopPolling();
    }
  }

  void _startPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(_pollingInterval, (_) => _pollMessages());
  }

  void _stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }

  void _onTextChanged() {
    final hasText = _messageController.text.trim().isNotEmpty;

    if (hasText && !_isTyping) {
      setState(() => _isTyping = true);
    }

    // Reset typing timer
    _typingTimer?.cancel();
    _typingTimer = Timer(_typingTimeout, () {
      if (mounted) {
        setState(() => _isTyping = false);
      }
    });
  }

  Future<void> _pollMessages() async {
    if (!mounted || _isRefreshing) return;

    try {
      final chatService = context.read<ChatApiService>();
      final newMessages = await chatService.getMessages(widget.match.id);

      if (!mounted) return;

      // Check if there are new messages by comparing message IDs
      final currentMessageIds = _messages?.map((m) => m.id).toSet() ?? {};
      final hasNewMessages = newMessages.any((m) => !currentMessageIds.contains(m.id));

      if (hasNewMessages) {
        final wasNearBottom = _isNearBottom();

        setState(() {
          _messages = newMessages;
        });

        // Auto-scroll to bottom if user was already near bottom
        if (wasNearBottom) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _scrollToBottom(animated: true);
          });
        }
      }
    } catch (e) {
      // Silently fail polling - don't disrupt user experience
      debugPrint('Polling error: $e');
    }
  }

  bool _isNearBottom() {
    if (!_scrollController.hasClients) return true;
    final position = _scrollController.position;
    final threshold = 100.0;
    return position.maxScrollExtent - position.pixels < threshold;
  }

  void _scrollToBottom({bool animated = false}) {
    if (!_scrollController.hasClients) return;

    if (animated) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    } else {
      _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
    }
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final authService = context.read<AuthService>();
      final chatService = context.read<ChatApiService>();
      final profileService = context.read<ProfileApiService>();
      final currentUserId = authService.userId;

      if (currentUserId == null) {
        throw Exception('User not authenticated');
      }

      // Get the other user's ID
      final otherUserId = widget.match.getOtherUserId(currentUserId);

      // Load messages and other user's profile in parallel
      final results = await Future.wait([
        chatService.getMessages(widget.match.id),
        profileService.getProfile(otherUserId),
      ]);

      setState(() {
        _messages = results[0] as List<Message>;
        _otherUserProfile = results[1] as Profile;
        _isLoading = false;
      });

      // Scroll to bottom after messages are loaded
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToBottom();
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to load chat: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _refreshMessages() async {
    if (_isRefreshing) return;

    setState(() => _isRefreshing = true);

    try {
      final chatService = context.read<ChatApiService>();
      final messages = await chatService.getMessages(widget.match.id);

      if (mounted) {
        setState(() {
          _messages = messages;
          _isRefreshing = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isRefreshing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to refresh: $e')),
        );
      }
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || text.length > _maxCharacters) return;

    // Check demo mode limits
    final subscriptionService = context.read<SubscriptionService>();
    if (!subscriptionService.canSendMessage()) {
      if (mounted) {
        PremiumGateDialog.showMessagesLimitReached(context);
      }
      return;
    }

    final authService = context.read<AuthService>();
    final chatService = context.read<ChatApiService>();
    final currentUserId = authService.userId;

    if (currentUserId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User not authenticated')),
      );
      return;
    }

    // Create temporary message with 'sending' status
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';
    final tempMessage = Message(
      id: tempId,
      matchId: widget.match.id,
      senderId: currentUserId,
      text: text,
      timestamp: DateTime.now(),
      status: MessageStatus.sending,
    );

    // Add temp message to UI immediately
    setState(() {
      _messages = [...(_messages ?? []), tempMessage];
      _messageController.clear();
      _isSending = true;
    });

    // Scroll to bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottom(animated: true);
    });

    try {
      final sentMessage = await chatService.sendMessage(
        widget.match.id,
        currentUserId,
        text,
      );

      // Use a message (increments counter for demo users)
      await subscriptionService.useMessage();

      // Replace temp message with real message
      setState(() {
        _messages = _messages!
            .where((m) => m.id != tempId)
            .toList()
          ..add(sentMessage.copyWith(status: MessageStatus.sent));
        _isSending = false;
      });
    } catch (e) {
      // Mark message as failed
      setState(() {
        _messages = _messages!.map((m) {
          if (m.id == tempId) {
            return m.copyWith(
              status: MessageStatus.failed,
              error: e.toString(),
            );
          }
          return m;
        }).toList();
        _isSending = false;
      });
    }
  }

  Future<void> _retryMessage(Message failedMessage) async {
    final authService = context.read<AuthService>();
    final chatService = context.read<ChatApiService>();
    final currentUserId = authService.userId;

    if (currentUserId == null) return;

    // Update message status to sending
    setState(() {
      _messages = _messages!.map((m) {
        if (m.id == failedMessage.id) {
          return m.copyWith(status: MessageStatus.sending, error: null);
        }
        return m;
      }).toList();
    });

    try {
      final sentMessage = await chatService.sendMessage(
        widget.match.id,
        currentUserId,
        failedMessage.text,
      );

      // Replace failed message with sent message
      setState(() {
        _messages = _messages!
            .where((m) => m.id != failedMessage.id)
            .toList()
          ..add(sentMessage.copyWith(status: MessageStatus.sent));
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollToBottom(animated: true);
      });
    } catch (e) {
      // Mark as failed again
      setState(() {
        _messages = _messages!.map((m) {
          if (m.id == failedMessage.id) {
            return m.copyWith(
              status: MessageStatus.failed,
              error: e.toString(),
            );
          }
          return m;
        }).toList();
      });
    }
  }

  void _deleteFailedMessage(Message message) {
    setState(() {
      _messages = _messages!.where((m) => m.id != message.id).toList();
    });
  }

  void _showUserActionSheet() {
    if (_otherUserProfile == null) return;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => UserActionSheet(
        otherUserProfile: _otherUserProfile!,
        match: widget.match,
        onActionComplete: () {
          // Navigate back to matches screen after block/unmatch
          Navigator.of(context).pop(); // Pop chat screen
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authService = context.watch<AuthService>();
    final subscriptionService = context.watch<SubscriptionService>();
    final currentUserId = authService.userId;
    final messagesRemaining = subscriptionService.getMessagesRemaining();
    final showMessagesCounter = subscriptionService.isDemoMode;

    return Scaffold(
      appBar: AppBar(
        title: Text(_otherUserProfile?.name ?? 'Chat'),
        actions: [
          if (showMessagesCounter)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: messagesRemaining > 0 ? Colors.green.shade100 : Colors.red.shade100,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: messagesRemaining > 0 ? Colors.green : Colors.red,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.chat,
                        size: 16,
                        color: messagesRemaining > 0 ? Colors.green : Colors.red,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '$messagesRemaining left',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: messagesRemaining > 0 ? Colors.green.shade900 : Colors.red.shade900,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (_otherUserProfile != null && !showMessagesCounter)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Center(
                child: Text(
                  '${_otherUserProfile!.age ?? '?'}',
                  style: const TextStyle(fontSize: 16),
                ),
              ),
            ),
          if (_otherUserProfile != null)
            IconButton(
              icon: const Icon(Icons.more_vert),
              onPressed: _showUserActionSheet,
              tooltip: 'More options',
            ),
        ],
      ),
      body: Column(
        children: [
          // Messages list
          Expanded(
            child: _buildMessagesList(currentUserId),
          ),
          // Message input
          _buildMessageInput(),
        ],
      ),
    );
  }

  Widget _buildMessagesList(String? currentUserId) {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              _errorMessage!,
              style: const TextStyle(fontSize: 16, color: Colors.red),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadData,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_messages == null || _messages!.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.chat_bubble_outline,
              size: 80,
              color: Colors.grey,
            ),
            const SizedBox(height: 16),
            Text(
              'No messages yet',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Say hi to ${_otherUserProfile?.name ?? 'your match'}!',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[500],
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _refreshMessages,
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        itemCount: _messages!.length + (_isTyping ? 1 : 0),
        itemBuilder: (context, index) {
          // Show typing indicator as last item
          if (_isTyping && index == _messages!.length) {
            return Align(
              alignment: Alignment.centerLeft,
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  '...',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.black54,
                    letterSpacing: 2,
                  ),
                ),
              ),
            );
          }

          final message = _messages![index];
          final isCurrentUser = message.senderId == currentUserId;

          return _buildMessageBubble(message, isCurrentUser);
        },
      ),
    );
  }

  Widget _buildMessageBubble(Message message, bool isCurrentUser) {
    final isFailed = message.status == MessageStatus.failed;

    return Align(
      alignment: isCurrentUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // Retry button for failed messages
            if (isCurrentUser && isFailed) ...[
              IconButton(
                icon: const Icon(Icons.refresh, size: 20),
                color: Colors.red,
                onPressed: () => _retryMessage(message),
                tooltip: 'Retry',
              ),
              const SizedBox(width: 4),
            ],
            Flexible(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width * 0.7,
                ),
                decoration: BoxDecoration(
                  color: isFailed
                      ? Colors.red[100]
                      : (isCurrentUser ? Colors.deepPurple : Colors.grey[300]),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      message.text,
                      style: TextStyle(
                        fontSize: 16,
                        color: isFailed
                            ? Colors.red[900]
                            : (isCurrentUser ? Colors.white : Colors.black87),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          formatTimestamp(message.timestamp),
                          style: TextStyle(
                            fontSize: 11,
                            color: isFailed
                                ? Colors.red[700]
                                : (isCurrentUser ? Colors.white70 : Colors.black54),
                          ),
                        ),
                        if (isCurrentUser && !isFailed) ...[
                          const SizedBox(width: 4),
                          _buildMessageStatusIcon(message.status),
                        ],
                      ],
                    ),
                    if (isFailed) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Failed to send',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.red[900],
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            // Delete button for failed messages
            if (isCurrentUser && isFailed) ...[
              const SizedBox(width: 4),
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                color: Colors.red,
                onPressed: () => _deleteFailedMessage(message),
                tooltip: 'Delete',
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMessageStatusIcon(MessageStatus status) {
    switch (status) {
      case MessageStatus.sending:
        return const SizedBox(
          width: 12,
          height: 12,
          child: CircularProgressIndicator(
            strokeWidth: 1.5,
            valueColor: AlwaysStoppedAnimation<Color>(Colors.white70),
          ),
        );
      case MessageStatus.sent:
        return const Icon(
          Icons.check,
          size: 14,
          color: Colors.white70,
        );
      case MessageStatus.delivered:
        return const Icon(
          Icons.done_all,
          size: 14,
          color: Colors.white70,
        );
      case MessageStatus.read:
        return const Icon(
          Icons.done_all,
          size: 14,
          color: Colors.blue,
        );
      case MessageStatus.failed:
        return const Icon(
          Icons.error_outline,
          size: 14,
          color: Colors.red,
        );
    }
  }

  Widget _buildMessageInput() {
    final charCount = _messageController.text.length;
    final isOverLimit = charCount > _maxCharacters;
    final showCounter = charCount > _maxCharacters * 0.8;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.3),
            spreadRadius: 1,
            blurRadius: 3,
            offset: const Offset(0, -1),
          ),
        ],
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Character counter
            if (showCounter)
              Padding(
                padding: const EdgeInsets.only(right: 16, bottom: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      '$charCount/$_maxCharacters',
                      style: TextStyle(
                        fontSize: 12,
                        color: isOverLimit ? Colors.red : Colors.grey[600],
                        fontWeight: isOverLimit ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
              ),
            // Input row
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(25),
                        borderSide: BorderSide.none,
                      ),
                      filled: true,
                      fillColor: Colors.grey[200],
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 10,
                      ),
                    ),
                    maxLines: null,
                    maxLength: null,
                    textCapitalization: TextCapitalization.sentences,
                    onSubmitted: (_) => _sendMessage(),
                    textInputAction: TextInputAction.send,
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _sendMessage,
                  icon: _isSending
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                  color: Colors.deepPurple,
                  iconSize: 28,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }


}
