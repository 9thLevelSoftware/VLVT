import 'package:flutter/material.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_decorations.dart';

/// A glassmorphism card widget for the VLVT design system.
///
/// Features a frosted glass effect with optional gold accents.
class VlvtCard extends StatelessWidget {
  /// The child widget to display inside the card.
  final Widget child;

  /// Padding inside the card.
  final EdgeInsetsGeometry? padding;

  /// Margin outside the card.
  final EdgeInsetsGeometry? margin;

  /// Whether to use a stronger glass effect.
  final bool strong;

  /// Whether to add a gold border accent.
  final bool goldAccent;

  /// Custom border radius.
  final BorderRadius? borderRadius;

  /// Whether to apply backdrop blur (glassmorphism).
  /// Set to false for better performance when not needed.
  final bool blur;

  /// Optional callback when the card is tapped.
  final VoidCallback? onTap;

  /// Optional callback when the card is long pressed.
  final VoidCallback? onLongPress;

  const VlvtCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.strong = false,
    this.goldAccent = false,
    this.borderRadius,
    this.blur = true,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? VlvtDecorations.borderRadiusLg;

    Widget card = Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: strong
            ? VlvtColors.glassBackgroundStrong
            : VlvtColors.glassBackground,
        borderRadius: radius,
        border: Border.all(
          color: goldAccent
              ? VlvtColors.gold.withValues(alpha: 0.5)
              : VlvtColors.glassBorder,
          width: goldAccent ? 1.5 : 1,
        ),
      ),
      child: child,
    );

    // Apply blur if enabled
    if (blur) {
      card = ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: VlvtDecorations.glassBlur,
          child: card,
        ),
      );
    }

    // Wrap with margin if provided
    if (margin != null) {
      card = Padding(
        padding: margin!,
        child: card,
      );
    }

    // Add tap handlers if provided
    if (onTap != null || onLongPress != null) {
      card = GestureDetector(
        onTap: onTap,
        onLongPress: onLongPress,
        child: card,
      );
    }

    return card;
  }
}

/// A simpler surface card without glassmorphism.
/// Use for list items and content that doesn't need blur.
class VlvtSurfaceCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final bool elevated;
  final VoidCallback? onTap;

  const VlvtSurfaceCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.elevated = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Widget card = Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: elevated ? VlvtColors.surfaceElevated : VlvtColors.surface,
        borderRadius: VlvtDecorations.borderRadiusLg,
        border: Border.all(
          color: VlvtColors.borderSubtle,
          width: 1,
        ),
        boxShadow: elevated ? [VlvtDecorations.shadowMedium] : null,
      ),
      child: child,
    );

    if (margin != null) {
      card = Padding(padding: margin!, child: card);
    }

    if (onTap != null) {
      card = GestureDetector(onTap: onTap, child: card);
    }

    return card;
  }
}
