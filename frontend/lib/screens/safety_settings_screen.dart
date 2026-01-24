import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/safety_service.dart';
import '../services/profile_api_service.dart';
import '../services/auth_service.dart';
import '../models/profile.dart';
import '../theme/vlvt_colors.dart';
import '../widgets/vlvt_button.dart';
import 'consent_settings_screen.dart';
import 'legal_document_viewer.dart';

class SafetySettingsScreen extends StatefulWidget {
  const SafetySettingsScreen({super.key});

  @override
  State<SafetySettingsScreen> createState() => _SafetySettingsScreenState();
}

class _SafetySettingsScreenState extends State<SafetySettingsScreen> {
  bool _isLoading = true;
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

      // Load profiles for blocked users
      final Map<String, Profile> profiles = {};
      for (final blocked in blockedUsers) {
        try {
          final profile = await profileService.getProfile(blocked['blockedUserId']);
          profiles[blocked['blockedUserId']] = profile;
        } catch (e) {
          debugPrint('Error loading profile for ${blocked['blockedUserId']}: $e');
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load blocked users: $e')),
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
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to unblock user: $e')),
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
              content: const Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Please email us at:',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 8),
                  SelectableText(
                    supportEmail,
                    style: TextStyle(
                      color: Colors.deepPurple,
                      fontSize: 16,
                    ),
                  ),
                  SizedBox(height: 16),
                  Text(
                    'We typically respond within 24 hours.',
                    style: TextStyle(color: VlvtColors.textMuted),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error opening email: $e')),
        );
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
          const Padding(
            padding: EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Blocked Users',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Blocked users cannot see your profile or send you messages.',
                  style: TextStyle(
                    fontSize: 14,
                    color: VlvtColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const Divider(),
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(32.0),
              child: Center(
                child: CircularProgressIndicator(),
              ),
            )
          else if (_blockedUsers.isEmpty)
            const Padding(
              padding: EdgeInsets.all(32.0),
              child: Center(
                child: Column(
                  children: [
                    Icon(
                      Icons.check_circle_outline,
                      size: 80,
                      color: Colors.green,
                    ),
                    SizedBox(height: 16),
                    Text(
                      'No blocked users',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: VlvtColors.textMuted,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'You have not blocked anyone yet.',
                      style: TextStyle(
                        fontSize: 14,
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
                leading: CircleAvatar(
                  backgroundColor: VlvtColors.surface,
                  child: Text(
                    name[0].toUpperCase(),
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
                title: Text(name),
                subtitle: Text(
                  'Blocked on ${_formatDate(blocked['createdAt'])}',
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: VlvtButton.secondary(
                  label: 'Unblock',
                  onPressed: () => _handleUnblock(userId, name),
                ),
              );
            })),
          const Divider(),
          const Padding(
            padding: EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Safety Tips',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 16),
                _SafetyTip(
                  icon: Icons.shield,
                  title: 'Protect Your Personal Information',
                  description:
                      'Never share personal information like your address, financial details, or social security number.',
                ),
                SizedBox(height: 12),
                _SafetyTip(
                  icon: Icons.group,
                  title: 'Meet in Public Places',
                  description:
                      'Always meet in public places for first dates and tell a friend or family member where you\'re going.',
                ),
                SizedBox(height: 12),
                _SafetyTip(
                  icon: Icons.flag,
                  title: 'Report Suspicious Behavior',
                  description:
                      'If someone makes you uncomfortable or exhibits suspicious behavior, report them immediately.',
                ),
                SizedBox(height: 12),
                _SafetyTip(
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
                const Text(
                  'Need Help?',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'If you\'re experiencing harassment or feel unsafe, please contact our support team.',
                  style: TextStyle(
                    fontSize: 14,
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
                const Text(
                  'Privacy & Legal',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Review our policies and your privacy rights.',
                  style: TextStyle(
                    fontSize: 14,
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
                MaterialPageRoute(
                  builder: (context) => const LegalDocumentViewer(
                    documentType: LegalDocumentType.privacyPolicy,
                  ),
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
                MaterialPageRoute(
                  builder: (context) => const ConsentSettingsScreen(),
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
                MaterialPageRoute(
                  builder: (context) => const LegalDocumentViewer(
                    documentType: LegalDocumentType.termsOfService,
                  ),
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
                const Text(
                  'Delete Account',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: VlvtColors.crimson,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Permanently delete your account and all associated data. This action cannot be undone.',
                  style: TextStyle(
                    fontSize: 14,
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
    // First confirmation
    final firstConfirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Account?'),
        content: const Text(
          'This will permanently delete your account, including:\n\n'
          '• Your profile and photos\n'
          '• All matches and conversations\n'
          '• Your subscription (you\'ll need to cancel separately)\n\n'
          'This action cannot be undone.',
        ),
        actions: [
          VlvtButton.text(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(false),
          ),
          VlvtButton.primary(
            label: 'Continue',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );

    if (firstConfirm != true || !mounted) return;

    // Second confirmation with explicit text
    final secondConfirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(
          'Are you absolutely sure?',
          style: TextStyle(color: VlvtColors.crimson),
        ),
        content: const Text(
          'Type "DELETE" to confirm permanent account deletion.',
        ),
        actions: [
          VlvtButton.text(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(false),
          ),
          VlvtButton.primary(
            label: 'Delete Forever',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );

    if (secondConfirm != true || !mounted) return;

    // Show loading
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: CircularProgressIndicator(),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
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
          color: Colors.deepPurple,
          size: 24,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                description,
                style: TextStyle(
                  fontSize: 14,
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
