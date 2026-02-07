import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/safety_service.dart';
import '../services/profile_api_service.dart';
import '../services/auth_service.dart';
import '../models/profile.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_loader.dart';
import '../widgets/confirmation_dialog.dart';
import '../utils/error_handler.dart';
import 'consent_settings_screen.dart';
import 'legal_document_viewer.dart';

class SafetySettingsScreen extends StatefulWidget {
  const SafetySettingsScreen({super.key});

  @override
  State<SafetySettingsScreen> createState() => _SafetySettingsScreenState();
}

class _SafetySettingsScreenState extends State<SafetySettingsScreen> {
  bool _isLoading = true;
  bool _isExporting = false;
  List<Map<String, dynamic>> _blockedUsers = [];
  Map<String, Profile> _profiles = {};

  @override
  void initState() {
    super.initState();
    _loadBlockedUsers();
  }

  Future<void> _loadBlockedUsers() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final safetyService = context.read<SafetyService>();
      final profileService = context.read<ProfileApiService>();

      final blockedUsers = await safetyService.getBlockedUsersWithProfiles();

      // Batch load profiles for blocked users (fixes N+1)
      final blockedUserIds = blockedUsers.map((b) => b['blockedUserId'] as String).toList();
      Map<String, Profile> profiles = {};
      if (blockedUserIds.isNotEmpty) {
        try {
          profiles = await profileService.batchGetProfiles(blockedUserIds);
        } catch (e) {
          debugPrint('Error batch loading blocked user profiles: $e');
        }
      }

      setState(() {
        _blockedUsers = blockedUsers;
        _profiles = profiles;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        final friendlyError = ErrorHandler.handleError(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(friendlyError.message)),
        );
      }
    }
  }

  Future<void> _handleUnblock(String userId, String userName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Unblock User'),
        content: Text('Are you sure you want to unblock $userName?'),
        actions: [
          VlvtButton.text(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(false),
          ),
          VlvtButton.primary(
            label: 'Unblock',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        final safetyService = context.read<SafetyService>();
        await safetyService.unblockUser(userId);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$userName has been unblocked')),
          );
          _loadBlockedUsers();
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

  /// Contact support via email
  Future<void> _contactSupport() async {
    const supportEmail = 'support@getvlvt.vip';
    const subject = 'VLVT - Safety Concern';
    final uri = Uri(
      scheme: 'mailto',
      path: supportEmail,
      query: 'subject=${Uri.encodeComponent(subject)}',
    );

    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      } else {
        // Fallback: show dialog with support email
        if (mounted) {
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Contact Support'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Please email us at:',
                    style: VlvtTextStyles.labelMedium,
                  ),
                  const SizedBox(height: 8),
                  SelectableText(
                    supportEmail,
                    style: VlvtTextStyles.bodyMedium.copyWith(
                      color: VlvtColors.primary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'We typically respond within 24 hours.',
                    style: VlvtTextStyles.bodySmall.copyWith(color: VlvtColors.textMuted),
                  ),
                ],
              ),
              actions: [
                VlvtButton.text(
                  label: 'Close',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          );
        }
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

  /// Handle data export request
  Future<void> _handleDataExport() async {
    setState(() => _isExporting = true);

    try {
      final authService = context.read<AuthService>();
      final filePath = await authService.requestDataExport();

      if (!mounted) return;

      if (filePath != null) {
        // Show success dialog with share option
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Export Complete'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Your data has been exported successfully.',
                ),
                const SizedBox(height: 8),
                Text(
                  'File saved to:\n$filePath',
                  style: VlvtTextStyles.caption.copyWith(
                    color: VlvtColors.textMuted,
                  ),
                ),
              ],
            ),
            actions: [
              VlvtButton.text(
                label: 'Close',
                onPressed: () => Navigator.of(context).pop(),
              ),
              VlvtButton.primary(
                label: 'Share',
                onPressed: () async {
                  Navigator.of(context).pop();
                  await SharePlus.instance.share(ShareParams(files: [XFile(filePath)]));
                },
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to export data. You may have reached the hourly limit. Please try again later.'),
            backgroundColor: VlvtColors.crimson,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        final friendlyError = ErrorHandler.handleError(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(friendlyError.message),
            backgroundColor: VlvtColors.crimson,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isExporting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Safety & Privacy'),
      ),
      body: ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Blocked Users',
                  style: VlvtTextStyles.h2,
                ),
                const SizedBox(height: 8),
                Text(
                  'Blocked users cannot see your profile or send you messages.',
                  style: VlvtTextStyles.bodySmall.copyWith(
                    color: VlvtColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const Divider(),
          if (_isLoading)
            Padding(
              padding: const EdgeInsets.all(32.0),
              child: Center(
                child: AnimatedOpacity(
                  opacity: 1.0,
                  duration: const Duration(milliseconds: 300),
                  child: const VlvtProgressIndicator(size: 32),
                ),
              ),
            )
          else if (_blockedUsers.isEmpty)
            Padding(
              padding: const EdgeInsets.all(32.0),
              child: Center(
                child: Column(
                  children: [
                    const Icon(
                      Icons.check_circle_outline,
                      size: 80,
                      color: VlvtColors.success,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No blocked users',
                      style: VlvtTextStyles.h3.copyWith(
                        color: VlvtColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'You have not blocked anyone yet.',
                      style: VlvtTextStyles.bodySmall.copyWith(
                        color: VlvtColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            ...(_blockedUsers.map((blocked) {
              final userId = blocked['blockedUserId'] as String;
              final profile = _profiles[userId];
              final name = profile?.name ?? 'Unknown User';

              return ListTile(
                leading: Semantics(
                  label: 'Profile picture for $name',
                  child: CircleAvatar(
                    backgroundColor: VlvtColors.surface,
                    child: Text(
                      name[0].toUpperCase(),
                      style: VlvtTextStyles.labelMedium.copyWith(color: Colors.white),
                    ),
                  ),
                ),
                title: Text(name),
                subtitle: Text(
                  'Blocked on ${_formatDate(blocked['createdAt'])}',
                  style: VlvtTextStyles.caption,
                ),
                trailing: VlvtButton.secondary(
                  label: 'Unblock',
                  onPressed: () => _handleUnblock(userId, name),
                ),
              );
            })),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Safety Tips',
                  style: VlvtTextStyles.h2,
                ),
                const SizedBox(height: 16),
                const _SafetyTip(
                  icon: Icons.shield,
                  title: 'Protect Your Personal Information',
                  description:
                      'Never share personal information like your address, financial details, or social security number.',
                ),
                const SizedBox(height: 12),
                const _SafetyTip(
                  icon: Icons.group,
                  title: 'Meet in Public Places',
                  description:
                      'Always meet in public places for first dates and tell a friend or family member where you\'re going.',
                ),
                const SizedBox(height: 12),
                const _SafetyTip(
                  icon: Icons.flag,
                  title: 'Report Suspicious Behavior',
                  description:
                      'If someone makes you uncomfortable or exhibits suspicious behavior, report them immediately.',
                ),
                const SizedBox(height: 12),
                const _SafetyTip(
                  icon: Icons.block,
                  title: 'Trust Your Instincts',
                  description:
                      'If something doesn\'t feel right, don\'t hesitate to block or report the user.',
                ),
              ],
            ),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Need Help?',
                  style: VlvtTextStyles.h2,
                ),
                const SizedBox(height: 8),
                Text(
                  'If you\'re experiencing harassment or feel unsafe, please contact our support team.',
                  style: VlvtTextStyles.bodySmall.copyWith(
                    color: VlvtColors.textMuted,
                  ),
                ),
                const SizedBox(height: 16),
                VlvtButton.primary(
                  label: 'Contact Support',
                  onPressed: _contactSupport,
                  icon: Icons.support_agent,
                ),
              ],
            ),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Privacy & Legal',
                  style: VlvtTextStyles.h2,
                ),
                const SizedBox(height: 8),
                Text(
                  'Review our policies and your privacy rights.',
                  style: VlvtTextStyles.bodySmall.copyWith(
                    color: VlvtColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          ListTile(
            leading: const Icon(Icons.privacy_tip_outlined),
            title: const Text('Privacy Policy'),
            subtitle: const Text('How we collect and use your data'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.push(
                context,
                PageRouteBuilder(
                  pageBuilder: (context, animation, secondaryAnimation) =>
                      const LegalDocumentViewer(
                    documentType: LegalDocumentType.privacyPolicy,
                  ),
                  transitionsBuilder: (context, animation, secondaryAnimation, child) {
                    return SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0.0, 1.0),
                        end: Offset.zero,
                      ).animate(CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutCubic,
                      )),
                      child: child,
                    );
                  },
                ),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.tune_outlined),
            title: const Text('Privacy Preferences'),
            subtitle: const Text('Manage your data and consent settings'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.push(
                context,
                PageRouteBuilder(
                  pageBuilder: (context, animation, secondaryAnimation) =>
                      const ConsentSettingsScreen(),
                  transitionsBuilder: (context, animation, secondaryAnimation, child) {
                    return SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0.0, 1.0),
                        end: Offset.zero,
                      ).animate(CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutCubic,
                      )),
                      child: child,
                    );
                  },
                ),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.description_outlined),
            title: const Text('Terms of Service'),
            subtitle: const Text('Rules and conditions of use'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.push(
                context,
                PageRouteBuilder(
                  pageBuilder: (context, animation, secondaryAnimation) =>
                      const LegalDocumentViewer(
                    documentType: LegalDocumentType.termsOfService,
                  ),
                  transitionsBuilder: (context, animation, secondaryAnimation, child) {
                    return SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0.0, 1.0),
                        end: Offset.zero,
                      ).animate(CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutCubic,
                      )),
                      child: child,
                    );
                  },
                ),
              );
            },
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Your Data',
                  style: VlvtTextStyles.h2,
                ),
                const SizedBox(height: 8),
                Text(
                  'Download a copy of all your personal data. This includes your profile, matches, messages, and preferences.',
                  style: VlvtTextStyles.bodySmall.copyWith(
                    color: VlvtColors.textMuted,
                  ),
                ),
                const SizedBox(height: 16),
                VlvtButton.secondary(
                  label: _isExporting ? 'Exporting...' : 'Export My Data',
                  onPressed: _isExporting ? null : _handleDataExport,
                  icon: Icons.download,
                ),
              ],
            ),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Delete Account',
                  style: VlvtTextStyles.h2.copyWith(
                    color: VlvtColors.crimson,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Permanently delete your account and all associated data. This action cannot be undone.',
                  style: VlvtTextStyles.bodySmall.copyWith(
                    color: VlvtColors.textMuted,
                  ),
                ),
                const SizedBox(height: 16),
                VlvtButton.secondary(
                  label: 'Delete My Account',
                  onPressed: _handleDeleteAccount,
                  icon: Icons.delete_forever,
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Future<void> _handleDeleteAccount() async {
    // First confirmation using ConfirmationDialog
    final firstConfirm = await ConfirmationDialog.showDestructive(
      context: context,
      title: 'Delete Account?',
      message: 'This will permanently delete your account, including:\n\n'
          '• Your profile and photos\n'
          '• All matches and conversations\n'
          '• Your subscription (you\'ll need to cancel separately)',
      consequences: 'This action cannot be undone.',
      confirmText: 'Continue',
      icon: Icons.delete_forever,
    );

    if (firstConfirm != true || !mounted) return;

    // Second confirmation with DELETE text input
    final deleteController = TextEditingController();
    final secondConfirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            final isValid = deleteController.text == 'DELETE';
            return AlertDialog(
              title: Text(
                'Are you absolutely sure?',
                style: VlvtTextStyles.h2.copyWith(color: VlvtColors.crimson),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Type "DELETE" to confirm permanent account deletion.'),
                  const SizedBox(height: 16),
                  TextField(
                    controller: deleteController,
                    autofocus: true,
                    decoration: InputDecoration(
                      hintText: 'Type DELETE',
                      border: const OutlineInputBorder(),
                      errorText: deleteController.text.isNotEmpty && !isValid
                          ? 'Please type DELETE exactly'
                          : null,
                    ),
                    onChanged: (_) => setDialogState(() {}),
                  ),
                ],
              ),
              actions: [
                VlvtButton.text(
                  label: 'Cancel',
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                ),
                VlvtButton.danger(
                  label: 'Delete Forever',
                  onPressed: isValid
                      ? () => Navigator.of(dialogContext).pop(true)
                      : null,
                ),
              ],
            );
          },
        );
      },
    );
    deleteController.dispose();

    if (secondConfirm != true || !mounted) return;

    // Show loading
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: VlvtLoader(),
      ),
    );

    try {
      final authService = context.read<AuthService>();
      final success = await authService.deleteAccount();

      if (!mounted) return;
      Navigator.of(context).pop(); // Dismiss loading

      if (success) {
        // Account deleted - user will be redirected to auth screen automatically
        // via the AuthService state change
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Your account has been deleted.'),
            backgroundColor: VlvtColors.surface,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to delete account. Please try again or contact support.'),
            backgroundColor: VlvtColors.crimson,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop(); // Dismiss loading
      final friendlyError = ErrorHandler.handleError(e);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(friendlyError.message),
          backgroundColor: VlvtColors.crimson,
        ),
      );
    }
  }

  String _formatDate(dynamic dateTime) {
    if (dateTime == null) return 'Unknown date';
    try {
      final DateTime date = dateTime is DateTime
          ? dateTime
          : DateTime.parse(dateTime.toString());
      return '${date.month}/${date.day}/${date.year}';
    } catch (e) {
      return 'Unknown date';
    }
  }
}

class _SafetyTip extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;

  const _SafetyTip({
    required this.icon,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          icon,
          color: VlvtColors.primary,
          size: 24,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: VlvtTextStyles.h4,
              ),
              const SizedBox(height: 4),
              Text(
                description,
                style: VlvtTextStyles.bodySmall.copyWith(
                  color: VlvtColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
