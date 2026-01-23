/// After Hours Tab Screen
/// Entry point for After Hours mode
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/after_hours_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';

class AfterHoursTabScreen extends StatelessWidget {
  const AfterHoursTabScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final afterHoursService = context.watch<AfterHoursService>();
    final state = afterHoursService.state;

    return Scaffold(
      backgroundColor: VlvtColors.background,
      appBar: AppBar(
        backgroundColor: VlvtColors.background,
        title: Text('After Hours', style: VlvtTextStyles.h2),
        centerTitle: true,
        elevation: 0,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.nightlife,
              size: 64,
              color: VlvtColors.gold,
            ),
            const SizedBox(height: 16),
            Text(
              'After Hours Mode',
              style: VlvtTextStyles.h2,
            ),
            const SizedBox(height: 8),
            Text(
              'Current state: ${state.name}',
              style: VlvtTextStyles.bodyMedium.copyWith(
                color: VlvtColors.textSecondary,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Coming soon...',
              style: VlvtTextStyles.labelMedium.copyWith(
                color: VlvtColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
