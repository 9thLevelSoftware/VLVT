/// After Hours Chat Screen
/// Ephemeral chat UI with session timer and save button
library;

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/auth_service.dart';
import '../services/after_hours_service.dart';
import '../services/after_hours_chat_service.dart';
import '../services/after_hours_safety_service.dart';
import '../services/socket_service.dart';
import '../models/message.dart';
import '../utils/date_utils.dart';
import '../widgets/after_hours/session_timer.dart';
import '../widgets/after_hours/session_expiry_banner.dart';
import '../widgets/save_match_button.dart';
import '../widgets/quick_report_dialog.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_input.dart';
import '../widgets/vlvt_loader.dart';
import '../widgets/message_status_indicator.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../utils/error_handler.dart';

/// Chat screen for After Hours ephemeral conversations.
///
/// Features:
/// - Real-time messaging via socket events
/// - Session timer in app bar
/// - Session expiry banner when time is running low
/// - Save match button above message input
/// - Partner saved/mutual save dialogs
/// - Session expiry handling with navigation
class AfterHoursChatScreen extends StatefulWidget {
  final AfterHoursMatch match;

  const AfterHoursChatScreen({
    super.key,
    required this.match,
  });

  @override
  State<AfterHoursChatScreen> createState() => _AfterHoursChatScreenState();
}

class _AfterHoursChatScreenState extends State<AfterHoursChatScreen>
    with WidgetsBindingObserver {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  // State
  List<Message> _messages = [];
  bool _isLoading = true;
  bool _isSending = false;
  bool _otherUserTyping = false;
  SaveButtonState _saveState = SaveButtonState.notSaved;

  // Socket subscriptions
  StreamSubscription<Message>? _messageSubscription;
  StreamSubscription<Map<String, dynamic>>? _typingSubscription;
  StreamSubscription<Map<String, dynamic>>? _readSubscription;
  StreamSubscription<Map<String, dynamic>>? _partnerSavedSubscription;
  StreamSubscription<Map<String, dynamic>>? _matchSavedSubscription;
  StreamSubscription<Map<String, dynamic>>? _sessionExpiredSubscription;

  // Typing
  Timer? _typingTimer;
  Timer? _typingIndicatorTimer;
  bool _isTyping = false;

  static const int _maxCharacters = 500;
  static const Duration _typingTimeout = Duration(seconds: 2);
  static const Duration _typingIndicatorTimeout = Duration(seconds: 3);
  static const double _nearBottomThreshold = 100.0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadMessages();
    _setupSocketListeners();
    _messageController.addListener(_onTextChanged);

    // Join the chat room (method exists in socket_service.dart from Phase 4)
    final socketService = context.read<SocketService>();
    socketService.joinAfterHoursChat(widget.match.id);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cancelSocketListeners();
    _typingTimer?.cancel();
    _typingIndicatorTimer?.cancel();
    _messageController.removeListener(_onTextChanged);
    _messageController.dispose();
    _scrollController.dispose();

    // Leave the chat room (method exists in socket_service.dart from Phase 4)
    try {
      final socketService = context.read<SocketService>();
      socketService.leaveAfterHoursChat(widget.match.id);
    } catch (_) {}

    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Refresh messages and check session status
      _loadMessages();
      context.read<AfterHoursService>().refreshSessionStatus();
    }
  }

  void _setupSocketListeners() {
    final socketService = context.read<SocketService>();

    _messageSubscription = socketService.onAfterHoursMessage.listen((message) {
      if (!mounted || message.matchId != widget.match.id) return;
      final wasNearBottom = _isNearBottom();
      setState(() {
        _messages = [..._messages, message];
      });
      if (wasNearBottom) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom(animated: true));
      }
      _markMessagesAsRead();
    });

    _typingSubscription = socketService.onAfterHoursTyping.listen((data) {
      if (!mounted || data['matchId'] != widget.match.id) return;
      final userId = data['userId'] as String?;
      if (userId == context.read<AuthService>().userId) return;
      final isTyping = data['isTyping'] as bool? ?? false;
      setState(() => _otherUserTyping = isTyping);
      if (isTyping) {
        _typingIndicatorTimer?.cancel();
        _typingIndicatorTimer = Timer(_typingIndicatorTimeout, () {
          if (mounted) setState(() => _otherUserTyping = false);
        });
      }
    });

    _readSubscription = socketService.onAfterHoursMessagesRead.listen((data) {
      if (!mounted || data['matchId'] != widget.match.id) return;
      // Update message status to read
      final messageIds = (data['messageIds'] as List?)?.cast<String>() ?? [];
      setState(() {
        _messages = _messages.map((m) {
          return messageIds.contains(m.id)
              ? m.copyWith(status: MessageStatus.read)
              : m;
        }).toList();
      });
    });

    _partnerSavedSubscription = socketService.onPartnerSaved.listen((data) {
      if (!mounted || data['matchId'] != widget.match.id) return;
      setState(() {
        if (_saveState == SaveButtonState.notSaved) {
          _saveState = SaveButtonState.partnerSavedFirst;
        }
      });
      // Show alert
      _showPartnerSavedAlert();
    });

    _matchSavedSubscription = socketService.onMatchSaved.listen((data) {
      if (!mounted || data['matchId'] != widget.match.id) return;
      setState(() {
        _saveState = SaveButtonState.mutualSaved;
      });
      // Show celebration and navigate to regular matches
      _showMutualSaveSuccess(data['permanentMatchId'] as String?);
    });

    _sessionExpiredSubscription = socketService.onSessionExpired.listen((data) {
      if (!mounted) return;
      // Session ended - close chat
      _handleSessionExpired();
    });
  }

  void _cancelSocketListeners() {
    _messageSubscription?.cancel();
    _typingSubscription?.cancel();
    _readSubscription?.cancel();
    _partnerSavedSubscription?.cancel();
    _matchSavedSubscription?.cancel();
    _sessionExpiredSubscription?.cancel();
  }

  Future<void> _loadMessages() async {
    final chatService = context.read<AfterHoursChatService>();
    try {
      final messages = await chatService.getMessageHistory(matchId: widget.match.id);
      if (mounted) {
        setState(() {
          _messages = messages;
          _isLoading = false;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
        _markMessagesAsRead();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _onTextChanged() {
    final socketService = context.read<SocketService>();
    if (_messageController.text.trim().isNotEmpty && !_isTyping) {
      setState(() => _isTyping = true);
      // Method exists in socket_service.dart from Phase 4
      socketService.sendAfterHoursTypingIndicator(
        matchId: widget.match.id,
        isTyping: true,
      );
    }
    _typingTimer?.cancel();
    _typingTimer = Timer(_typingTimeout, () {
      if (mounted) {
        setState(() => _isTyping = false);
        socketService.sendAfterHoursTypingIndicator(
          matchId: widget.match.id,
          isTyping: false,
        );
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || text.length > _maxCharacters || _isSending) return;

    setState(() => _isSending = true);

    final authService = context.read<AuthService>();
    final chatService = context.read<AfterHoursChatService>();
    final currentUserId = authService.userId;

    if (currentUserId == null) {
      setState(() => _isSending = false);
      return;
    }

    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';

    // Optimistic update
    final tempMessage = Message(
      id: tempId,
      matchId: widget.match.id,
      senderId: currentUserId,
      text: text,
      timestamp: DateTime.now(),
      status: MessageStatus.sending,
    );

    setState(() {
      _messages = [..._messages, tempMessage];
      _messageController.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom(animated: true));

    try {
      final sentMessage = await chatService.sendMessageWithRetry(
        matchId: widget.match.id,
        text: text,
        tempId: tempId,
      );

      if (mounted) {
        if (sentMessage != null) {
          setState(() {
            _isSending = false;
            _messages = _messages.where((m) => m.id != tempId).toList()..add(sentMessage);
          });
        } else {
          setState(() {
            _isSending = false;
            _messages = _messages.map((m) => m.id == tempId
                ? m.copyWith(status: MessageStatus.failed)
                : m).toList();
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isSending = false;
          _messages = _messages.map((m) => m.id == tempId
              ? m.copyWith(status: MessageStatus.failed, error: ErrorHandler.getShortMessage(e))
              : m).toList();
        });
      }
    }
  }

  Future<void> _saveMatch() async {
    setState(() => _saveState = SaveButtonState.saving);

    final chatService = context.read<AfterHoursChatService>();
    final result = await chatService.saveMatch(matchId: widget.match.id);

    if (mounted) {
      if (result.success) {
        if (result.mutualSave) {
          setState(() => _saveState = SaveButtonState.mutualSaved);
          _showMutualSaveSuccess(result.permanentMatchId);
        } else {
          setState(() => _saveState = SaveButtonState.waitingForPartner);
        }
      } else {
        setState(() => _saveState = SaveButtonState.notSaved);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.error ?? 'Failed to save match'),
            backgroundColor: VlvtColors.error,
          ),
        );
      }
    }
  }

  void _showPartnerSavedAlert() {
    HapticFeedback.heavyImpact();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: VlvtColors.surface,
        title: Row(
          children: [
            Icon(Icons.favorite, color: VlvtColors.crimson),
            const SizedBox(width: 8),
            const Text('They saved!'),
          ],
        ),
        content: Text(
          '${widget.match.name} wants to keep chatting! Save back to make this a permanent match.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Later', style: TextStyle(color: VlvtColors.textSecondary)),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _saveMatch();
            },
            child: Text('Save Now', style: TextStyle(color: VlvtColors.gold)),
          ),
        ],
      ),
    );
  }

  void _showMutualSaveSuccess(String? permanentMatchId) {
    HapticFeedback.heavyImpact();
    final outerNavigator = Navigator.of(context);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: VlvtColors.surface,
        title: Row(
          children: [
            Icon(Icons.celebration, color: VlvtColors.gold),
            const SizedBox(width: 8),
            const Text('Match Saved!'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'You and ${widget.match.name} are now a permanent match!',
            ),
            const SizedBox(height: 8),
            Text(
              'Your chat history has been saved. You can find them in your regular matches.',
              style: VlvtTextStyles.bodySmall.copyWith(color: VlvtColors.textSecondary),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext); // Close dialog
              if (mounted) {
                outerNavigator.pop(); // Close chat
              }
            },
            child: const Text('View Matches'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Keep Chatting'),
          ),
        ],
      ),
    );
  }

  void _handleSessionExpired() {
    final outerNavigator = Navigator.of(context);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: VlvtColors.surface,
        title: const Text('Session Ended'),
        content: Text(
          _saveState == SaveButtonState.mutualSaved
              ? 'Your session has ended, but your match with ${widget.match.name} was saved!'
              : 'Your After Hours session has ended.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext); // Close dialog
              if (mounted) {
                outerNavigator.pop(); // Close chat
              }
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _handleReport() async {
    final safetyService = context.read<AfterHoursSafetyService>();
    final matchId = widget.match.id;

    final reported = await showQuickReportDialog(
      context,
      matchId: matchId,
      onReport: (reason, details) async {
        await safetyService.reportUser(
          matchId: matchId,
          reason: reason,
          details: details,
        );
      },
    );

    if (reported == true && mounted) {
      // Exit chat and return to After Hours tab
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User reported and blocked')),
      );
    }
  }

  Future<void> _handleBlock() async {
    // Capture service before async gap
    final safetyService = context.read<AfterHoursSafetyService>();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: VlvtColors.surface,
        title: const Text('Block User?'),
        content: const Text(
          'This will permanently block this user. You won\'t see them again in After Hours or the main app.',
        ),
        actions: [
          VlvtButton.text(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(false),
          ),
          VlvtButton.primary(
            label: 'Block',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await safetyService.blockUser(widget.match.id);
        if (mounted) {
          Navigator.of(context).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('User blocked')),
          );
        }
      } catch (e) {
        if (mounted) {
          final friendlyError = ErrorHandler.handleError(e);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(friendlyError.message)),
          );
        }
      }
    }
  }

  Future<void> _markMessagesAsRead() async {
    final socketService = context.read<SocketService>();
    if (socketService.isConnected) {
      // Method exists in socket_service.dart from Phase 4
      await socketService.markAfterHoursMessagesRead(matchId: widget.match.id);
    }
  }

  bool _isNearBottom() {
    if (!_scrollController.hasClients) return true;
    return _scrollController.position.pixels < _nearBottomThreshold;
  }

  void _scrollToBottom({bool animated = false}) {
    if (!_scrollController.hasClients) return;
    if (animated) {
      _scrollController.animateTo(0,
          duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    } else {
      _scrollController.jumpTo(0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final afterHoursService = context.watch<AfterHoursService>();
    final authService = context.watch<AuthService>();
    final currentUserId = authService.userId;

    return Scaffold(
      backgroundColor: VlvtColors.background,
      appBar: AppBar(
        backgroundColor: VlvtColors.background,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        titleSpacing: 0,
        title: Row(
          children: [
            if (widget.match.photoUrl != null)
              Padding(
                padding: const EdgeInsets.only(right: 10),
                child: CircleAvatar(
                  radius: 18,
                  backgroundImage: CachedNetworkImageProvider(widget.match.photoUrl!),
                ),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.match.name, style: VlvtTextStyles.labelLarge),
                  Text(
                    'After Hours',
                    style: VlvtTextStyles.labelSmall.copyWith(
                      color: VlvtColors.gold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (afterHoursService.expiresAt != null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Center(
                child: SessionTimer(
                  expiresAt: afterHoursService.expiresAt!,
                  onExpired: _handleSessionExpired,
                  onWarning: () => HapticFeedback.heavyImpact(),
                ),
              ),
            ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) async {
              if (value == 'report') {
                await _handleReport();
              } else if (value == 'block') {
                await _handleBlock();
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'report',
                child: Row(
                  children: [
                    Icon(Icons.flag, color: Colors.red),
                    SizedBox(width: 8),
                    Text('Report User'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'block',
                child: Row(
                  children: [
                    Icon(Icons.block, color: Colors.orange),
                    SizedBox(width: 8),
                    Text('Block User'),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Expiry banner if in expiring state
          if (afterHoursService.state == AfterHoursState.expiring)
            SessionExpiryBanner(
              secondsRemaining: afterHoursService.remainingSeconds,
            ),

          // Messages list
          Expanded(
            child: _isLoading
                ? const Center(child: VlvtLoader())
                : _buildMessagesList(currentUserId),
          ),

          // Save button
          _buildSaveButton(),

          // Message input
          _buildMessageInput(),
        ],
      ),
    );
  }

  Widget _buildSaveButton() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: VlvtColors.surface,
        border: Border(
          top: BorderSide(color: VlvtColors.border, width: 0.5),
        ),
      ),
      child: SaveMatchButton(
        state: _saveState,
        onSave: _saveState == SaveButtonState.notSaved ||
                _saveState == SaveButtonState.partnerSavedFirst
            ? _saveMatch
            : null,
      ),
    );
  }

  Widget _buildMessagesList(String? currentUserId) {
    if (_messages.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.chat_bubble_outline, size: 64, color: VlvtColors.textMuted),
            const SizedBox(height: 12),
            Text('Start chatting!', style: VlvtTextStyles.bodyMedium.copyWith(
              color: VlvtColors.textSecondary,
            )),
            const SizedBox(height: 4),
            Text(
              'Say hi to ${widget.match.name}',
              style: VlvtTextStyles.bodySmall.copyWith(color: VlvtColors.textMuted),
            ),
          ],
        ),
      );
    }

    final itemCount = _messages.length + (_otherUserTyping ? 1 : 0);

    return ListView.builder(
      controller: _scrollController,
      reverse: true,
      padding: const EdgeInsets.all(16),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (_otherUserTyping && index == 0) {
          return _buildTypingIndicator();
        }

        final messageIndex = _otherUserTyping ? index - 1 : index;
        final reversedIndex = _messages.length - 1 - messageIndex;
        final message = _messages[reversedIndex];
        final isCurrentUser = message.senderId == currentUserId;

        return _buildMessageBubble(message, isCurrentUser);
      },
    );
  }

  Widget _buildTypingIndicator() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: VlvtColors.surface,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          '...',
          style: VlvtTextStyles.h2.copyWith(
            color: VlvtColors.textMuted,
            letterSpacing: 2,
          ),
        ),
      ),
    );
  }

  Future<void> _retryMessage(Message failedMessage) async {
    final chatService = context.read<AfterHoursChatService>();

    setState(() {
      _messages = _messages.map((m) => m.id == failedMessage.id
          ? m.copyWith(status: MessageStatus.sending, error: null)
          : m).toList();
    });

    try {
      final sentMessage = await chatService.sendMessageWithRetry(
        matchId: widget.match.id,
        text: failedMessage.text,
        tempId: failedMessage.id,
      );

      if (mounted) {
        if (sentMessage != null) {
          setState(() {
            _messages = _messages.where((m) => m.id != failedMessage.id).toList()..add(sentMessage);
          });
        } else {
          setState(() {
            _messages = _messages.map((m) => m.id == failedMessage.id
                ? m.copyWith(status: MessageStatus.failed)
                : m).toList();
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages = _messages.map((m) => m.id == failedMessage.id
              ? m.copyWith(status: MessageStatus.failed, error: ErrorHandler.getShortMessage(e))
              : m).toList();
        });
      }
    }
  }

  Widget _buildMessageBubble(Message message, bool isCurrentUser) {
    final isFailed = message.status == MessageStatus.failed;

    final borderRadius = isCurrentUser
        ? const BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
            bottomLeft: Radius.circular(20),
            bottomRight: Radius.circular(6),
          )
        : const BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
            bottomLeft: Radius.circular(6),
            bottomRight: Radius.circular(20),
          );

    return GestureDetector(
      onTap: isFailed ? () => _retryMessage(message) : null,
      child: Align(
        alignment: isCurrentUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(top: 8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.7,
            ),
            decoration: BoxDecoration(
              color: isFailed
                  ? VlvtColors.error.withValues(alpha: 0.1)
                  : (isCurrentUser ? VlvtColors.chatBubbleSent : VlvtColors.chatBubbleReceived),
              borderRadius: borderRadius,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message.text,
                  style: VlvtTextStyles.bodyMedium.copyWith(
                    color: isFailed
                        ? VlvtColors.error
                        : (isCurrentUser ? VlvtColors.chatTextSent : VlvtColors.chatTextReceived),
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      formatTimestamp(message.timestamp),
                      style: VlvtTextStyles.overline.copyWith(
                        color: isFailed
                            ? VlvtColors.error.withValues(alpha: 0.8)
                            : (isCurrentUser ? VlvtColors.chatTimestampSent : VlvtColors.chatTimestampReceived),
                      ),
                    ),
                    if (isCurrentUser && !isFailed) ...[
                      const SizedBox(width: 4),
                      MessageStatusIndicator(status: message.status, size: 14),
                    ],
                  ],
                ),
                if (isFailed)
                  Text(
                    'Failed to send - tap to retry',
                    style: VlvtTextStyles.overline.copyWith(color: VlvtColors.error, fontWeight: FontWeight.bold),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMessageInput() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: VlvtColors.surface,
        boxShadow: [
          BoxShadow(
            color: VlvtColors.border.withValues(alpha: 0.1),
            spreadRadius: 1,
            blurRadius: 3,
            offset: const Offset(0, -1),
          ),
        ],
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: VlvtInput(
                controller: _messageController,
                hintText: 'Type a message...',
                maxLines: null,
                textCapitalization: TextCapitalization.sentences,
                onSubmitted: (_) => _sendMessage(),
                textInputAction: TextInputAction.send,
                blur: false,
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              onPressed: _sendMessage,
              icon: _isSending
                  ? const VlvtProgressIndicator(size: 16, strokeWidth: 2)
                  : const Icon(Icons.send),
              color: VlvtColors.gold,
              iconSize: 28,
            ),
          ],
        ),
      ),
    );
  }
}
