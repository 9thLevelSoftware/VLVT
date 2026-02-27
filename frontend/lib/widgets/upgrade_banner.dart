import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/subscription_service.dart';
import '../screens/paywall_screen.dart';
import '../theme/vlvt_colors.dart';
import 'vlvt_button.dart';

class UpgradeBanner extends StatelessWidget {
  const UpgradeBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final subscriptionService = context.watch<SubscriptionService>();

    // Don't show if user has premium
    if (subscriptionService.hasPremiumAccess) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.deepPurple.shade600, Colors.deepPurple.shade800],
        ),
        boxShadow: [
          BoxShadow(
            color: VlvtColors.background.withAlpha(51),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              const Icon(
                Icons.lock_outline,
                color: Colors.amber,
                size: 24,
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Subscribe to Connect',
                      style: TextStyle(
                        color: VlvtColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      'Unlock swiping, matching & messaging',
                      style: TextStyle(
                        color: VlvtColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              VlvtButton.primary(
                label: 'Subscribe',
                onPressed: () async {
                  await PaywallScreen.show(context, source: 'upgrade_banner');
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
