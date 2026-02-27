import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/vlvt_colors.dart';

/// Action buttons for the discovery screen (pass, undo, like)
/// Provides accessible alternative to swipe gestures for screen reader users
class DiscoveryActionButtons extends StatelessWidget {
  final bool showUndoButton;
  final bool hasPremiumAccess;
  final VoidCallback onPass;
  final VoidCallback onLike;
  final VoidCallback onUndo;
  final VoidCallback onPremiumRequired;

  const DiscoveryActionButtons({
    super.key,
    required this.showUndoButton,
    required this.hasPremiumAccess,
    required this.onPass,
    required this.onLike,
    required this.onUndo,
    required this.onPremiumRequired,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Pass button - accessible alternative to swipe left
          Semantics(
            label: 'Pass on this profile',
            hint: 'Double tap to pass',
            button: true,
            enabled: true,
            child: FloatingActionButton(
              heroTag: 'pass',
              onPressed: () {
                if (!hasPremiumAccess) {
                  HapticFeedback.heavyImpact();
                  onPremiumRequired();
                  return;
                }
                HapticFeedback.lightImpact();
                onPass();
              },
              backgroundColor: VlvtColors.crimson,
              child: const Icon(Icons.close, size: 28, color: Colors.white),
            ),
          ),
          if (showUndoButton)
            Semantics(
              label: 'Undo last action',
              hint: 'Double tap to undo',
              button: true,
              enabled: true,
              child: FloatingActionButton(
                heroTag: 'undo',
                mini: true,
                onPressed: () {
                  HapticFeedback.lightImpact();
                  onUndo();
                },
                backgroundColor: VlvtColors.primary,
                child: const Icon(Icons.undo, size: 20, color: Colors.white),
              ),
            ),
          // Like button - accessible alternative to swipe right
          Semantics(
            label: 'Like this profile',
            hint: 'Double tap to like',
            button: true,
            enabled: true,
            child: FloatingActionButton(
              heroTag: 'like',
              onPressed: () {
                if (!hasPremiumAccess) {
                  HapticFeedback.heavyImpact();
                  onPremiumRequired();
                  return;
                }
                HapticFeedback.mediumImpact();
                onLike();
              },
              backgroundColor: VlvtColors.success,
              child: const Icon(Icons.favorite, size: 28, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
