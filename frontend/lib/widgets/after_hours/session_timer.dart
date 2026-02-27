/// Session Timer Widget
/// Displays countdown timer with visual urgency states
library;

import 'dart:async';
import 'package:flutter/material.dart';
import '../../theme/vlvt_colors.dart';

/// A countdown timer widget for After Hours sessions.
///
/// Displays remaining time with visual urgency states:
/// - Gold background: normal state
/// - Crimson background with glow: urgent state (< 2 minutes)
///
/// Callbacks:
/// - [onWarning]: Called once when timer reaches 2 minutes
/// - [onExpired]: Called when timer reaches zero
class SessionTimer extends StatefulWidget {
  /// The time when the session expires.
  final DateTime expiresAt;

  /// Called when the timer reaches zero.
  final VoidCallback? onExpired;

  /// Called when the timer reaches 2 minutes remaining.
  final VoidCallback? onWarning;

  const SessionTimer({
    super.key,
    required this.expiresAt,
    this.onExpired,
    this.onWarning,
  });

  @override
  State<SessionTimer> createState() => _SessionTimerState();
}

class _SessionTimerState extends State<SessionTimer> {
  Timer? _timer;
  Duration _remaining = Duration.zero;
  bool _warningShown = false;

  @override
  void initState() {
    super.initState();
    _updateRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _updateRemaining());
  }

  @override
  void didUpdateWidget(SessionTimer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.expiresAt != widget.expiresAt) {
      _warningShown = false;
      _updateRemaining();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _updateRemaining() {
    final now = DateTime.now();
    final remaining = widget.expiresAt.difference(now);

    if (remaining.inSeconds <= 0) {
      widget.onExpired?.call();
      _timer?.cancel();
      setState(() => _remaining = Duration.zero);
      return;
    }

    // Trigger warning callback at 2 minutes (120 seconds)
    if (remaining.inSeconds <= 120 && !_warningShown) {
      _warningShown = true;
      widget.onWarning?.call();
    }

    setState(() => _remaining = remaining);
  }

  @override
  Widget build(BuildContext context) {
    final isUrgent = _remaining.inSeconds <= 120;
    final minutes = _remaining.inMinutes;
    final seconds = _remaining.inSeconds % 60;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isUrgent ? VlvtColors.crimson : VlvtColors.gold,
        borderRadius: BorderRadius.circular(20),
        boxShadow: isUrgent
            ? [
                BoxShadow(
                  color: VlvtColors.crimson.withValues(alpha: 0.4),
                  blurRadius: 8,
                  spreadRadius: 0,
                ),
              ]
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.timer,
            color: isUrgent ? VlvtColors.textPrimary : VlvtColors.textOnGold,
            size: 16,
          ),
          const SizedBox(width: 4),
          Text(
            '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}',
            style: TextStyle(
              color: isUrgent ? VlvtColors.textPrimary : VlvtColors.textOnGold,
              fontWeight: FontWeight.bold,
              fontFamily: 'Montserrat',
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}
