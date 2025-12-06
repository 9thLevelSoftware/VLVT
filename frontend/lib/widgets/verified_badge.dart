import 'package:flutter/material.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';

/// A badge indicating a verified user
class VerifiedBadge extends StatelessWidget {
  final bool showLabel;
  final double size;

  const VerifiedBadge({
    super.key,
    this.showLabel = false,
    this.size = 20,
  });

  @override
  Widget build(BuildContext context) {
    if (showLabel) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: VlvtColors.gold.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: VlvtColors.gold.withValues(alpha: 0.5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.verified,
              color: VlvtColors.gold,
              size: size * 0.8,
            ),
            const SizedBox(width: 4),
            Text(
              'Verified',
              style: VlvtTextStyles.caption.copyWith(
                color: VlvtColors.gold,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: VlvtColors.gold,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: VlvtColors.gold.withValues(alpha: 0.3),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Icon(
        Icons.check,
        color: Colors.black,
        size: size * 0.6,
      ),
    );
  }
}

/// Small verified icon to show next to names
class VerifiedIcon extends StatelessWidget {
  final double size;

  const VerifiedIcon({
    super.key,
    this.size = 16,
  });

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.verified,
      color: VlvtColors.gold,
      size: size,
    );
  }
}
