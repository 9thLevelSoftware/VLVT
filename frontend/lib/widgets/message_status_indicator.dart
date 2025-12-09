import 'package:flutter/material.dart';
import '../theme/vlvt_colors.dart';
import '../models/message.dart';

/// A compact visual indicator showing message delivery status.
///
/// Displays different states with appropriate icons and colors:
/// - `sending`: Small circular progress indicator
/// - `sent`: Single grey check ✓
/// - `delivered`: Double grey checks ✓✓ (overlapped)
/// - `read`: Double gold checks ✓✓ (overlapped, VlvtColors.gold)
/// - `failed`: Red error icon
class MessageStatusIndicator extends StatelessWidget {
  final MessageStatus status;
  final double size;

  const MessageStatusIndicator({
    super.key,
    required this.status,
    this.size = 16,
  });

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case MessageStatus.sending:
        return SizedBox(
          width: size,
          height: size,
          child: CircularProgressIndicator(
            strokeWidth: 1.5,
            valueColor: AlwaysStoppedAnimation<Color>(
              VlvtColors.textMuted.withValues(alpha: 0.7),
            ),
          ),
        );

      case MessageStatus.sent:
        // Single grey check
        return Icon(
          Icons.check,
          size: size,
          color: VlvtColors.textMuted,
        );

      case MessageStatus.delivered:
        // Double grey checks (overlapped)
        return _buildDoubleCheck(
          size: size,
          color: VlvtColors.textMuted,
        );

      case MessageStatus.read:
        // Double gold checks (overlapped)
        return _buildDoubleCheck(
          size: size,
          color: VlvtColors.gold,
        );

      case MessageStatus.failed:
        // Red error icon
        return Icon(
          Icons.error_outline,
          size: size,
          color: VlvtColors.error,
        );
    }
  }

  /// Builds overlapping double check marks for delivered/read status
  Widget _buildDoubleCheck({required double size, required Color color}) {
    return SizedBox(
      width: size * 1.3, // Slightly wider to accommodate overlap
      height: size,
      child: Stack(
        children: [
          // First check (left, slightly behind)
          Positioned(
            left: 0,
            child: Icon(
              Icons.check,
              size: size,
              color: color,
            ),
          ),
          // Second check (right, overlapping)
          Positioned(
            left: size * 0.35, // Overlap by ~65% for visual appeal
            child: Icon(
              Icons.check,
              size: size,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
