import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart' show SharePlus, ShareParams;
import '../services/tickets_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_loader.dart';
import '../utils/error_handler.dart';

class InviteScreen extends StatefulWidget {
  const InviteScreen({super.key});

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  bool _isCreating = false;

  @override
  void initState() {
    super.initState();
    // Load tickets when screen opens
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TicketsService>().loadTickets();
    });
  }

  Future<void> _createInviteCode() async {
    if (_isCreating) return;

    setState(() => _isCreating = true);

    final ticketsService = context.read<TicketsService>();
    final result = await ticketsService.createInviteCode();

    if (!mounted) return;
    setState(() => _isCreating = false);

    if (result['success'] == true) {
      final code = result['code'] as String;
      final shareUrl = result['shareUrl'] as String;

      // Show success and share option
      showModalBottomSheet(
        context: context,
        backgroundColor: VlvtColors.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (context) => _ShareCodeSheet(code: code, shareUrl: shareUrl),
      );
    } else {
      final errorMsg = result['error'] as String? ?? 'Failed to create invite code';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ErrorHandler.getShortMessage(errorMsg)),
          backgroundColor: VlvtColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ticketsService = context.watch<TicketsService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Invite Friends'),
      ),
      body: ticketsService.isLoading
          ? Center(
              child: AnimatedOpacity(
                opacity: 1.0,
                duration: const Duration(milliseconds: 300),
                child: const VlvtLoader(),
              ),
            )
          : RefreshIndicator(
              onRefresh: ticketsService.loadTickets,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Ticket Balance Card
                    _BalanceCard(
                      balance: ticketsService.balance,
                      onCreateInvite: _createInviteCode,
                      isCreating: _isCreating,
                    ),

                    const SizedBox(height: 24),

                    // How to earn tickets
                    _EarnTicketsSection(),

                    const SizedBox(height: 24),

                    // Your Invite Codes
                    if (ticketsService.codes.isNotEmpty) ...[
                      Text(
                        'Your Invite Codes',
                        style: VlvtTextStyles.h3,
                      ),
                      const SizedBox(height: 12),
                      ...ticketsService.codes.map((code) => _InviteCodeTile(code: code)),
                    ],

                    const SizedBox(height: 24),

                    // Transaction History
                    if (ticketsService.history.isNotEmpty) ...[
                      Text(
                        'Ticket History',
                        style: VlvtTextStyles.h3,
                      ),
                      const SizedBox(height: 12),
                      ...ticketsService.history.map((tx) => _TransactionTile(transaction: tx)),
                    ],

                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  final int balance;
  final VoidCallback onCreateInvite;
  final bool isCreating;

  const _BalanceCard({
    required this.balance,
    required this.onCreateInvite,
    required this.isCreating,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            VlvtColors.gold.withValues(alpha: 0.2),
            VlvtColors.gold.withValues(alpha: 0.05),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: VlvtColors.gold.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          // Golden ticket icon
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: VlvtColors.gold,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.confirmation_number,
              size: 40,
              color: VlvtColors.textOnGold,
            ),
          ),

          const SizedBox(height: 16),

          Text(
            'Golden Tickets',
            style: VlvtTextStyles.bodySmall.copyWith(
              color: VlvtColors.textSecondary,
            ),
          ),

          const SizedBox(height: 4),

          Text(
            '$balance',
            style: VlvtTextStyles.displayLarge.copyWith(
              fontFamily: 'Montserrat',
              fontStyle: FontStyle.normal,
              color: VlvtColors.gold,
              fontWeight: FontWeight.bold,
            ),
          ),

          const SizedBox(height: 16),

          Text(
            'Use tickets to invite friends to VLVT',
            textAlign: TextAlign.center,
            style: VlvtTextStyles.bodySmall.copyWith(
              color: VlvtColors.textSecondary,
            ),
          ),

          const SizedBox(height: 20),

          VlvtButton.primary(
            label: isCreating ? 'Creating...' : 'Create Invite',
            onPressed: balance > 0 && !isCreating ? onCreateInvite : null,
            icon: Icons.card_giftcard,
            expanded: true,
          ),

          if (balance == 0) ...[
            const SizedBox(height: 8),
            Text(
              'Earn tickets by completing activities below',
              textAlign: TextAlign.center,
              style: VlvtTextStyles.caption.copyWith(
                color: VlvtColors.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _EarnTicketsSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'How to Earn Tickets',
          style: VlvtTextStyles.h3,
        ),
        const SizedBox(height: 12),
        _EarnItem(
          icon: Icons.verified_user,
          title: 'Verify your profile',
          subtitle: '+1 ticket (one-time)',
        ),
        _EarnItem(
          icon: Icons.favorite,
          title: 'Get your first match',
          subtitle: '+1 ticket (one-time)',
        ),
        _EarnItem(
          icon: Icons.calendar_today,
          title: 'Complete a date',
          subtitle: '+1 ticket (per date)',
        ),
        _EarnItem(
          icon: Icons.group_add,
          title: 'Referred user completes a date',
          subtitle: '+1 bonus ticket',
        ),
      ],
    );
  }
}

class _EarnItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _EarnItem({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: VlvtColors.gold.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: VlvtColors.gold, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: VlvtTextStyles.labelMedium,
                ),
                Text(
                  subtitle,
                  style: VlvtTextStyles.caption.copyWith(
                    color: VlvtColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InviteCodeTile extends StatelessWidget {
  final InviteCode code;

  const _InviteCodeTile({required this.code});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: VlvtColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: VlvtColors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: code.used
                  ? VlvtColors.success.withValues(alpha: 0.1)
                  : VlvtColors.gold.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              code.used ? Icons.check_circle : Icons.confirmation_number,
              color: code.used ? VlvtColors.success : VlvtColors.gold,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  code.code,
                  style: VlvtTextStyles.h4.copyWith(
                    letterSpacing: 1,
                  ),
                ),
                Text(
                  code.used
                      ? 'Used by ${code.usedBy ?? 'someone'}'
                      : 'Ready to share',
                  style: VlvtTextStyles.caption.copyWith(
                    color: VlvtColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (!code.used)
            IconButton(
              icon: Icon(Icons.share, color: VlvtColors.gold),
              tooltip: 'Share invite code',
              onPressed: () {
                SharePlus.instance.share(
                  ShareParams(text: "Join me on VLVT - the exclusive dating app! Use my invite code: ${code.code}\n\nhttps://getvlvt.vip/invite/${code.code}"),
                );
              },
            ),
        ],
      ),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  final TicketTransaction transaction;

  const _TransactionTile({required this.transaction});

  @override
  Widget build(BuildContext context) {
    final isPositive = transaction.amount > 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: VlvtColors.surface,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: isPositive
                  ? VlvtColors.success.withValues(alpha: 0.1)
                  : VlvtColors.error.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                isPositive ? '+${transaction.amount}' : '${transaction.amount}',
                style: VlvtTextStyles.labelSmall.copyWith(
                  color: isPositive ? VlvtColors.success : VlvtColors.error,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              transaction.reasonDisplayText,
              style: VlvtTextStyles.bodySmall,
            ),
          ),
          Text(
            _formatDate(transaction.createdAt),
            style: VlvtTextStyles.caption.copyWith(
              color: VlvtColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays == 0) {
      return 'Today';
    } else if (diff.inDays == 1) {
      return 'Yesterday';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    } else {
      return '${date.month}/${date.day}';
    }
  }
}

class _ShareCodeSheet extends StatelessWidget {
  final String code;
  final String shareUrl;

  const _ShareCodeSheet({required this.code, required this.shareUrl});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: VlvtColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          const SizedBox(height: 24),

          Icon(
            Icons.check_circle,
            size: 64,
            color: VlvtColors.success,
          ),

          const SizedBox(height: 16),

          Text(
            'Invite Created!',
            style: VlvtTextStyles.h1,
          ),

          const SizedBox(height: 8),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            decoration: BoxDecoration(
              color: VlvtColors.gold.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: VlvtColors.gold),
            ),
            child: Text(
              code,
              style: VlvtTextStyles.displaySmall.copyWith(
                fontFamily: 'Montserrat',
                fontStyle: FontStyle.normal,
                fontWeight: FontWeight.bold,
                color: VlvtColors.gold,
                letterSpacing: 2,
              ),
            ),
          ),

          const SizedBox(height: 24),

          VlvtButton.primary(
            label: 'Share Invite',
            onPressed: () {
              SharePlus.instance.share(
                ShareParams(text: "Join me on VLVT - the exclusive dating app! Use my invite code: $code\n\n$shareUrl"),
              );
            },
            icon: Icons.share,
            expanded: true,
          ),

          const SizedBox(height: 12),

          VlvtButton.secondary(
            label: 'Copy Code',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: code));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Code copied to clipboard!')),
              );
            },
            icon: Icons.copy,
            expanded: true,
          ),

          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
