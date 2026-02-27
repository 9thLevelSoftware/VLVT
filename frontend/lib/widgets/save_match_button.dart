/// Save Match Button Widget
/// Displays save button with state-dependent appearance for After Hours chat
library;

import 'package:flutter/material.dart';
import '../theme/vlvt_colors.dart';
import 'vlvt_loader.dart';

/// State for the save match button
enum SaveButtonState {
  /// User hasn't saved yet, button shows "Save Match"
  notSaved,
  /// Save request in progress
  saving,
  /// User saved, waiting for partner to save
  waitingForPartner,
  /// Partner saved first, urgent CTA to reciprocate
  partnerSavedFirst,
  /// Both saved, match is permanent
  mutualSaved,
}

/// Button for saving an After Hours match
///
/// Shows different states based on save progress:
/// - notSaved: Active "Save Match" button
/// - saving: Loading indicator
/// - waitingForPartner: Disabled "Waiting for partner"
/// - partnerSavedFirst: Highlighted "Save to keep chatting!"
/// - mutualSaved: Disabled "Match saved!" with checkmark
class SaveMatchButton extends StatelessWidget {
  final SaveButtonState state;
  final VoidCallback? onSave;

  const SaveMatchButton({
    super.key,
    required this.state,
    this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    switch (state) {
      case SaveButtonState.notSaved:
        return ElevatedButton.icon(
          onPressed: onSave,
          icon: const Icon(Icons.bookmark_border),
          label: const Text('Save Match'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.amber,
            foregroundColor: VlvtColors.textOnGold,
          ),
        );

      case SaveButtonState.saving:
        return ElevatedButton.icon(
          onPressed: null,
          icon: const VlvtProgressIndicator(size: 18, strokeWidth: 2),
          label: const Text('Saving...'),
        );

      case SaveButtonState.waitingForPartner:
        return ElevatedButton.icon(
          onPressed: null,
          icon: const Icon(Icons.bookmark, color: Colors.amber),
          label: const Text('Waiting for partner'),
          style: ElevatedButton.styleFrom(
            backgroundColor: VlvtColors.surface,
            foregroundColor: VlvtColors.textMuted,
          ),
        );

      case SaveButtonState.partnerSavedFirst:
        // Highlighted state - they saved first, prompt user to reciprocate
        return ElevatedButton.icon(
          onPressed: onSave,
          icon: const Icon(Icons.favorite, color: VlvtColors.textPrimary),
          label: const Text('Save to keep chatting!'),
          style: ElevatedButton.styleFrom(
            backgroundColor: theme.colorScheme.primary,
            foregroundColor: VlvtColors.textPrimary,
          ),
        );

      case SaveButtonState.mutualSaved:
        return ElevatedButton.icon(
          onPressed: null,
          icon: const Icon(Icons.check_circle, color: VlvtColors.success),
          label: const Text('Match saved!'),
          style: ElevatedButton.styleFrom(
            backgroundColor: VlvtColors.success.withValues(alpha: 0.2),
            foregroundColor: VlvtColors.success,
          ),
        );
    }
  }
}
