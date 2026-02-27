/// Session Expiry Banner Widget
/// Shows warning when session is about to expire
library;

import 'package:flutter/material.dart';
import '../../theme/vlvt_colors.dart';
import '../../theme/vlvt_text_styles.dart';

/// A warning banner displayed when an After Hours session is about to expire.
///
/// Features:
/// - Crimson background for urgency
/// - Countdown display
/// - Optional "Extend" button for future extension feature
class SessionExpiryBanner extends StatelessWidget {
  /// The number of seconds remaining until session expires.
  final int secondsRemaining;

  /// Called when user taps the extend button.
  /// If null, the extend button is not shown.
  final VoidCallback? onExtend;

  const SessionExpiryBanner({
    super.key,
    required this.secondsRemaining,
    this.onExtend,
  });

  @override
  Widget build(BuildContext context) {
    final minutes = secondsRemaining ~/ 60;
    final seconds = secondsRemaining % 60;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: VlvtColors.crimson,
        boxShadow: [
          BoxShadow(
            color: VlvtColors.crimson.withValues(alpha: 0.3),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            color: VlvtColors.textPrimary,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Session ending in $minutes:${seconds.toString().padLeft(2, '0')}',
              style: VlvtTextStyles.labelMedium.copyWith(
                color: VlvtColors.textPrimary,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          if (onExtend != null)
            TextButton(
              onPressed: onExtend,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text(
                'Extend',
                style: TextStyle(
                  color: VlvtColors.textPrimary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
