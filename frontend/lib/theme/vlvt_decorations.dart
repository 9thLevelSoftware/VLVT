import 'dart:ui';
import 'package:flutter/material.dart';
import 'vlvt_colors.dart';

/// VLVT Decoration Utilities
///
/// Reusable decoration patterns for glassmorphism,
/// gold accents, shadows, and borders.
class VlvtDecorations {
  VlvtDecorations._();

  // ============================================
  // BORDER RADIUS
  // ============================================

  static const double radiusSmall = 8.0;
  static const double radiusMedium = 12.0;
  static const double radiusLarge = 16.0;
  static const double radiusXLarge = 24.0;
  static const double radiusRound = 100.0;

  static BorderRadius get borderRadiusSm => BorderRadius.circular(radiusSmall);
  static BorderRadius get borderRadiusMd => BorderRadius.circular(radiusMedium);
  static BorderRadius get borderRadiusLg => BorderRadius.circular(radiusLarge);
  static BorderRadius get borderRadiusXl => BorderRadius.circular(radiusXLarge);
  static BorderRadius get borderRadiusRound => BorderRadius.circular(radiusRound);

  // ============================================
  // GLASSMORPHISM DECORATIONS
  // ============================================

  /// Standard glass card decoration
  static BoxDecoration get glassCard => BoxDecoration(
    color: VlvtColors.glassBackground,
    borderRadius: borderRadiusLg,
    border: Border.all(
      color: VlvtColors.glassBorder,
      width: 1,
    ),
  );

  /// Stronger glass card (more visible)
  static BoxDecoration get glassCardStrong => BoxDecoration(
    color: VlvtColors.glassBackgroundStrong,
    borderRadius: borderRadiusLg,
    border: Border.all(
      color: VlvtColors.glassBorder,
      width: 1,
    ),
  );

  /// Glass card with gold border
  static BoxDecoration get glassCardGold => BoxDecoration(
    color: VlvtColors.glassBackground,
    borderRadius: borderRadiusLg,
    border: Border.all(
      color: VlvtColors.gold.withValues(alpha: 0.5),
      width: 1,
    ),
  );

  /// Glass input field decoration
  static BoxDecoration get glassInput => BoxDecoration(
    color: VlvtColors.glassBackgroundStrong,
    borderRadius: borderRadiusMd,
    border: Border.all(
      color: VlvtColors.borderStrong,
      width: 1,
    ),
  );

  /// Glass input with gold focus border
  static BoxDecoration get glassInputFocused => BoxDecoration(
    color: VlvtColors.glassBackgroundStrong,
    borderRadius: borderRadiusMd,
    border: Border.all(
      color: VlvtColors.gold,
      width: 2,
    ),
    boxShadow: [goldGlowSoft],
  );

  // ============================================
  // SURFACE DECORATIONS
  // ============================================

  /// Standard surface card
  static BoxDecoration get surfaceCard => BoxDecoration(
    color: VlvtColors.surface,
    borderRadius: borderRadiusLg,
    border: Border.all(
      color: VlvtColors.borderSubtle,
      width: 1,
    ),
  );

  /// Elevated surface (modal, dialog)
  static BoxDecoration get surfaceElevated => BoxDecoration(
    color: VlvtColors.surfaceElevated,
    borderRadius: borderRadiusLg,
    boxShadow: [shadowLarge],
  );

  // ============================================
  // BUTTON DECORATIONS
  // ============================================

  /// Primary button with gold gradient
  static BoxDecoration get buttonPrimary => BoxDecoration(
    gradient: VlvtColors.goldGradient45,
    borderRadius: borderRadiusMd,
    boxShadow: [goldGlowSoft],
  );

  /// Primary button pressed state
  static BoxDecoration get buttonPrimaryPressed => BoxDecoration(
    gradient: LinearGradient(
      begin: const Alignment(-1, -1),
      end: const Alignment(1, 1),
      colors: [VlvtColors.goldDark, VlvtColors.gold],
    ),
    borderRadius: borderRadiusMd,
  );

  /// Secondary button (outline)
  static BoxDecoration get buttonSecondary => BoxDecoration(
    color: Colors.transparent,
    borderRadius: borderRadiusMd,
    border: Border.all(
      color: VlvtColors.gold,
      width: 1.5,
    ),
  );

  /// Secondary button hover/pressed
  static BoxDecoration get buttonSecondaryPressed => BoxDecoration(
    color: VlvtColors.gold.withValues(alpha: 0.1),
    borderRadius: borderRadiusMd,
    border: Border.all(
      color: VlvtColors.gold,
      width: 1.5,
    ),
  );

  /// Danger button
  static BoxDecoration get buttonDanger => BoxDecoration(
    color: VlvtColors.crimson,
    borderRadius: borderRadiusMd,
  );

  // ============================================
  // SHADOWS
  // ============================================

  /// Subtle shadow for cards
  static BoxShadow get shadowSmall => BoxShadow(
    color: Colors.black.withValues(alpha: 0.2),
    blurRadius: 8,
    offset: const Offset(0, 2),
  );

  /// Medium shadow
  static BoxShadow get shadowMedium => BoxShadow(
    color: Colors.black.withValues(alpha: 0.3),
    blurRadius: 16,
    offset: const Offset(0, 4),
  );

  /// Large shadow for elevated elements
  static BoxShadow get shadowLarge => BoxShadow(
    color: Colors.black.withValues(alpha: 0.4),
    blurRadius: 24,
    offset: const Offset(0, 8),
  );

  // ============================================
  // GLOW EFFECTS
  // ============================================

  /// Soft gold glow
  static BoxShadow get goldGlowSoft => BoxShadow(
    color: VlvtColors.goldGlow,
    blurRadius: 16,
    spreadRadius: 0,
  );

  /// Strong gold glow
  static BoxShadow get goldGlowStrong => BoxShadow(
    color: VlvtColors.goldGlow,
    blurRadius: 24,
    spreadRadius: 4,
  );

  /// Primary (purple) glow
  static BoxShadow get primaryGlow => BoxShadow(
    color: VlvtColors.primaryGlow,
    blurRadius: 20,
    spreadRadius: 2,
  );

  /// Crimson glow for notifications
  static BoxShadow get crimsonGlow => BoxShadow(
    color: VlvtColors.crimsonGlow,
    blurRadius: 16,
    spreadRadius: 0,
  );

  // ============================================
  // DIVIDERS
  // ============================================

  /// Standard horizontal divider
  static Widget get divider => Container(
    height: 1,
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: [
          Colors.transparent,
          VlvtColors.gold.withValues(alpha: 0.3),
          VlvtColors.gold.withValues(alpha: 0.3),
          Colors.transparent,
        ],
        stops: const [0.0, 0.2, 0.8, 1.0],
      ),
    ),
  );

  /// Simple divider (no gradient)
  static Widget get dividerSimple => Container(
    height: 1,
    color: VlvtColors.divider,
  );

  // ============================================
  // NAVIGATION BAR
  // ============================================

  /// Frosted glass navigation bar decoration
  static BoxDecoration get navBarGlass => BoxDecoration(
    color: VlvtColors.surface.withValues(alpha: 0.8),
    border: Border(
      top: BorderSide(
        color: VlvtColors.borderSubtle,
        width: 1,
      ),
    ),
  );

  // ============================================
  // HELPER METHODS
  // ============================================

  /// Creates a backdrop filter for glassmorphism
  static ImageFilter get glassBlur => ImageFilter.blur(
    sigmaX: 10,
    sigmaY: 10,
  );

  /// Creates a stronger backdrop filter
  static ImageFilter get glassBlurStrong => ImageFilter.blur(
    sigmaX: 20,
    sigmaY: 20,
  );

  /// Wraps a child with glassmorphism effect
  static Widget glassContainer({
    required Widget child,
    BoxDecoration? decoration,
    EdgeInsetsGeometry? padding,
    double? width,
    double? height,
  }) {
    return ClipRRect(
      borderRadius: borderRadiusLg,
      child: BackdropFilter(
        filter: glassBlur,
        child: Container(
          width: width,
          height: height,
          padding: padding,
          decoration: decoration ?? glassCard,
          child: child,
        ),
      ),
    );
  }
}
