import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/profile.dart';
import '../models/match.dart';
import '../services/safety_service.dart';
import '../theme/vlvt_colors.dart';
import 'report_dialog.dart';
import 'vlvt_button.dart';

class UserActionSheet extends StatelessWidget {
  final Profile otherUserProfile;
  final Match? match;
  final VoidCallback? onActionComplete;

  const UserActionSheet({
    super.key,
    required this.otherUserProfile,
    this.match,
    this.onActionComplete,
  });

  Future<void> _handleBlock(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Block User'),
        content: Text(
          'Are you sure you want to block ${otherUserProfile.name ?? "this user"}?\n\n'
          'They will no longer be able to see your profile or contact you. '
          'If you have an existing match, it will be removed.',
        ),
        actions: [
          VlvtButton.text(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(false),
          ),
          VlvtButton.danger(
            label: 'Block',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final safetyService = context.read<SafetyService>();
        await safetyService.blockUser(otherUserProfile.userId, reason: 'User blocked');

        // If there's a match, also unmatch
        if (match != null) {
          try {
            await safetyService.unmatch(match!.id);
          } catch (e) {
            // debugPrint('Error unmatching after block: $e');
            // Continue even if unmatch fails
          }
        }

        if (context.mounted) {
          Navigator.of(context).pop(); // Close action sheet
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${otherUserProfile.name ?? "User"} has been blocked'),
              backgroundColor: Colors.orange,
            ),
          );

          // Notify parent to refresh or navigate away
          onActionComplete?.call();
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to block user: $e')),
          );
        }
      }
    }
  }

  Future<void> _handleReport(BuildContext context) async {
    Navigator.of(context).pop(); // Close action sheet first

    if (context.mounted) {
      await showDialog(
        context: context,
        builder: (context) => ReportDialog(
          userName: otherUserProfile.name ?? 'this user',
          onSubmit: (reason, details) async {
            final safetyService = context.read<SafetyService>();
            await safetyService.reportUser(
              reportedUserId: otherUserProfile.userId,
              reason: reason,
              details: details,
            );
          },
        ),
      );
    }
  }

  Future<void> _handleUnmatch(BuildContext context) async {
    if (match == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Unmatch'),
        content: Text(
          'Are you sure you want to unmatch with ${otherUserProfile.name ?? "this user"}?\n\n'
          'This will remove the match and delete all conversation history. '
          'This action cannot be undone.',
        ),
        actions: [
          VlvtButton.text(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(false),
          ),
          VlvtButton.danger(
            label: 'Unmatch',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final safetyService = context.read<SafetyService>();
        await safetyService.unmatch(match!.id);

        if (context.mounted) {
          Navigator.of(context).pop(); // Close action sheet
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Unmatched with ${otherUserProfile.name ?? "user"}'),
              backgroundColor: Colors.orange,
            ),
          );

          // Notify parent to refresh or navigate away
          onActionComplete?.call();
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to unmatch: $e')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: VlvtColors.borderStrong,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              otherUserProfile.name ?? 'User',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.flag, color: Colors.orange),
            title: const Text('Report User'),
            subtitle: const Text('Report inappropriate behavior'),
            onTap: () => _handleReport(context),
          ),
          ListTile(
            leading: const Icon(Icons.block, color: Colors.red),
            title: const Text('Block User'),
            subtitle: const Text('Block and prevent future contact'),
            onTap: () => _handleBlock(context),
          ),
          if (match != null) ...[
            ListTile(
              leading: const Icon(Icons.heart_broken, color: Colors.orange),
              title: const Text('Unmatch'),
              subtitle: const Text('Remove match and conversation'),
              onTap: () => _handleUnmatch(context),
            ),
          ],
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: VlvtButton.secondary(
              label: 'Cancel',
              onPressed: () => Navigator.of(context).pop(),
              expanded: true,
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
