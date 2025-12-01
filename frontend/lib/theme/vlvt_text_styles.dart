import 'package:flutter/material.dart';
import 'vlvt_colors.dart';

/// VLVT Typography System
///
/// Uses Playfair Display for elegant headers and
/// Montserrat for clean, readable body text.
class VlvtTextStyles {
  VlvtTextStyles._();

  // ============================================
  // FONT FAMILIES
  // ============================================

  static const String fontFamilyDisplay = 'PlayfairDisplay';
  static const String fontFamilyBody = 'Montserrat';

  // ============================================
  // DISPLAY STYLES (Playfair Display - Italic)
  // Large, elegant headers for screen titles
  // ============================================

  /// Extra large display - splash screens, hero text
  static const TextStyle displayLarge = TextStyle(
    fontFamily: fontFamilyDisplay,
    fontStyle: FontStyle.italic,
    fontSize: 48,
    fontWeight: FontWeight.w400,
    height: 1.2,
    letterSpacing: 0.5,
    color: VlvtColors.textPrimary,
  );

  /// Large display - major screen headers
  static const TextStyle displayMedium = TextStyle(
    fontFamily: fontFamilyDisplay,
    fontStyle: FontStyle.italic,
    fontSize: 36,
    fontWeight: FontWeight.w400,
    height: 1.2,
    letterSpacing: 0.5,
    color: VlvtColors.textPrimary,
  );

  /// Standard display - section headers
  static const TextStyle displaySmall = TextStyle(
    fontFamily: fontFamilyDisplay,
    fontStyle: FontStyle.italic,
    fontSize: 28,
    fontWeight: FontWeight.w400,
    height: 1.3,
    letterSpacing: 0.3,
    color: VlvtColors.textPrimary,
  );

  // ============================================
  // HEADING STYLES (Montserrat - SemiBold)
  // For sub-sections and card titles
  // ============================================

  /// Heading 1 - large section titles
  static const TextStyle h1 = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 24,
    fontWeight: FontWeight.w600,
    height: 1.3,
    color: VlvtColors.textPrimary,
  );

  /// Heading 2 - card titles
  static const TextStyle h2 = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 20,
    fontWeight: FontWeight.w600,
    height: 1.3,
    color: VlvtColors.textPrimary,
  );

  /// Heading 3 - sub-section titles
  static const TextStyle h3 = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.4,
    color: VlvtColors.textPrimary,
  );

  /// Heading 4 - list item titles
  static const TextStyle h4 = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    height: 1.4,
    color: VlvtColors.textPrimary,
  );

  // ============================================
  // BODY STYLES (Montserrat - Regular)
  // For readable content
  // ============================================

  /// Large body - featured text, intros
  static const TextStyle bodyLarge = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 18,
    fontWeight: FontWeight.w400,
    height: 1.6,
    color: VlvtColors.textPrimary,
  );

  /// Medium body - standard content
  static const TextStyle bodyMedium = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
    color: VlvtColors.textPrimary,
  );

  /// Small body - compact content
  static const TextStyle bodySmall = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.5,
    color: VlvtColors.textPrimary,
  );

  // ============================================
  // LABEL STYLES (Montserrat - SemiBold)
  // For buttons, chips, navigation
  // ============================================

  /// Large label - primary buttons
  static const TextStyle labelLarge = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    height: 1.3,
    letterSpacing: 0.5,
    color: VlvtColors.textPrimary,
  );

  /// Medium label - secondary buttons, chips
  static const TextStyle labelMedium = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    height: 1.3,
    letterSpacing: 0.3,
    color: VlvtColors.textPrimary,
  );

  /// Small label - badges, tags
  static const TextStyle labelSmall = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    height: 1.3,
    letterSpacing: 0.3,
    color: VlvtColors.textPrimary,
  );

  // ============================================
  // CAPTION STYLES (Montserrat - Regular)
  // For timestamps, hints, secondary info
  // ============================================

  /// Caption - timestamps, metadata
  static const TextStyle caption = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.4,
    color: VlvtColors.textSecondary,
  );

  /// Overline - tiny labels
  static const TextStyle overline = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 10,
    fontWeight: FontWeight.w600,
    height: 1.4,
    letterSpacing: 1.0,
    color: VlvtColors.textMuted,
  );

  // ============================================
  // SPECIAL STYLES
  // ============================================

  /// Button text - used on primary buttons
  static const TextStyle button = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 16,
    fontWeight: FontWeight.w600,
    height: 1.0,
    letterSpacing: 0.8,
  );

  /// Button text for gold buttons (dark text)
  static TextStyle get buttonOnGold => button.copyWith(
    color: VlvtColors.textOnGold,
  );

  /// Button text for primary buttons (light text)
  static TextStyle get buttonOnPrimary => button.copyWith(
    color: VlvtColors.textOnPrimary,
  );

  /// Input text
  static const TextStyle input = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
    color: VlvtColors.textPrimary,
  );

  /// Input hint text (gold)
  static const TextStyle inputHint = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
    color: VlvtColors.gold,
  );

  /// Link text
  static const TextStyle link = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 14,
    fontWeight: FontWeight.w500,
    decoration: TextDecoration.underline,
    decorationColor: VlvtColors.gold,
    color: VlvtColors.gold,
  );

  /// Gold accent text
  static TextStyle gold(TextStyle base) => base.copyWith(
    color: VlvtColors.gold,
  );

  /// Secondary text variant
  static TextStyle secondary(TextStyle base) => base.copyWith(
    color: VlvtColors.textSecondary,
  );

  /// Muted text variant
  static TextStyle muted(TextStyle base) => base.copyWith(
    color: VlvtColors.textMuted,
  );

  /// Error text
  static const TextStyle error = TextStyle(
    fontFamily: fontFamilyBody,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.4,
    color: VlvtColors.crimson,
  );
}
