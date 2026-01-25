import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_loader.dart';
import '../utils/error_handler.dart';

/// Screen for managing GDPR consent preferences.
///
/// Allows users to view and toggle their consent for various data processing
/// purposes as required by GDPR-02 and GDPR-05 compliance.
class ConsentSettingsScreen extends StatefulWidget {
  const ConsentSettingsScreen({super.key});

  @override
  State<ConsentSettingsScreen> createState() => _ConsentSettingsScreenState();
}

class _ConsentSettingsScreenState extends State<ConsentSettingsScreen> {
  List<ConsentStatus> _consents = [];
  bool _isLoading = true;
  final Map<String, bool> _pendingChanges = {};

  @override
  void initState() {
    super.initState();
    _loadConsents();
  }

  Future<void> _loadConsents() async {
    setState(() => _isLoading = true);

    try {
      final authService = context.read<AuthService>();
      final consents = await authService.getConsents();
      setState(() {
        _consents = consents;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        final friendlyError = ErrorHandler.handleError(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(friendlyError.message)),
        );
      }
    }
  }

  Future<void> _handleConsentChange(ConsentStatus consent, bool value) async {
    // Optimistic update
    setState(() {
      _pendingChanges[consent.purpose] = value;
    });

    final authService = context.read<AuthService>();
    bool success;

    if (value) {
      success = await authService.grantConsent(consent.purpose);
    } else {
      // Show confirmation for withdrawing consent
      final confirmed = await _showWithdrawConfirmation(consent);
      if (!confirmed) {
        setState(() => _pendingChanges.remove(consent.purpose));
        return;
      }
      success = await authService.withdrawConsent(consent.purpose);
    }

    if (success) {
      await _loadConsents();
    } else {
      // Revert optimistic update
      setState(() => _pendingChanges.remove(consent.purpose));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update consent')),
        );
      }
    }
  }

  Future<bool> _showWithdrawConfirmation(ConsentStatus consent) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Withdraw Consent?'),
            content: Text(
              'You are about to withdraw consent for "${consent.displayName}".\n\n'
              'This may affect your ability to use certain features.',
            ),
            actions: [
              VlvtButton.text(
                label: 'Cancel',
                onPressed: () => Navigator.of(context).pop(false),
              ),
              VlvtButton.primary(
                label: 'Withdraw',
                onPressed: () => Navigator.of(context).pop(true),
              ),
            ],
          ),
        ) ??
        false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Privacy Preferences'),
      ),
      body: _isLoading
          ? const Center(child: VlvtProgressIndicator())
          : ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Manage Your Data',
                        style: VlvtTextStyles.h2,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Control how VLVT uses your data. You can withdraw consent at any time without affecting your account.',
                        style: VlvtTextStyles.bodySmall.copyWith(
                          color: VlvtColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(),
                ..._consents.map((consent) => _buildConsentTile(consent)),
                const Divider(),
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text(
                    'These settings help us provide a better experience while respecting your privacy. '
                    'Some features may require certain consents to function properly.',
                    style: VlvtTextStyles.caption.copyWith(
                      color: VlvtColors.textMuted,
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildConsentTile(ConsentStatus consent) {
    final isGranted = _pendingChanges[consent.purpose] ?? consent.granted;

    return SwitchListTile(
      title: Row(
        children: [
          Text(consent.displayName),
          if (consent.needsRenewal) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: VlvtColors.warning,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                'Update Required',
                style: VlvtTextStyles.overline.copyWith(color: VlvtColors.textOnGold),
              ),
            ),
          ],
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(consent.description),
          if (consent.grantedAt != null && consent.granted)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Granted on ${_formatDate(consent.grantedAt!)}',
                style: VlvtTextStyles.overline.copyWith(
                  color: VlvtColors.textMuted,
                ),
              ),
            ),
        ],
      ),
      value: isGranted,
      onChanged: (value) => _handleConsentChange(consent, value),
      activeTrackColor: VlvtColors.primary.withAlpha(128),
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return VlvtColors.primary;
        }
        return null;
      }),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}/${date.year}';
  }
}
