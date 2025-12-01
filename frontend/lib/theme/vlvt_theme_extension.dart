import 'package:flutter/material.dart';
import 'vlvt_colors.dart';
import 'vlvt_decorations.dart';

/// VLVT Theme Extension
///
/// Provides access to VLVT-specific design tokens via the theme system.
/// Access via: `Theme.of(context).extension<VlvtThemeExtension>()`
///
/// Example:
/// ```dart
/// final vlvt = Theme.of(context).extension<VlvtThemeExtension>()!;
/// Container(
///   decoration: vlvt.glassDecoration,
///   child: Text('Hello', style: TextStyle(color: vlvt.gold)),
/// )
/// ```
@immutable
class VlvtThemeExtension extends ThemeExtension<VlvtThemeExtension> {
  const VlvtThemeExtension({
    // Gold tokens
    required this.gold,
    required this.goldLight,
    required this.goldDark,
    required this.goldGradient,
    required this.goldGlow,
    // Glass tokens
    required this.glassBackground,
    required this.glassBackgroundStrong,
    required this.glassBorder,
    required this.glassBlurSigma,
    // Surface tokens
    required this.surface,
    required this.surfaceElevated,
    required this.surfaceInput,
    // Border tokens
    required this.borderSubtle,
    required this.borderDefault,
    required this.borderStrong,
    // Accent tokens
    required this.crimson,
    required this.success,
    required this.warning,
    required this.info,
    // Text tokens
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.textOnGold,
    // Decorations
    required this.glassDecoration,
    required this.glassDecorationStrong,
    required this.glassDecorationGold,
    required this.surfaceDecoration,
    required this.surfaceElevatedDecoration,
    required this.buttonPrimaryDecoration,
    required this.buttonSecondaryDecoration,
    required this.buttonDangerDecoration,
    // Shadows
    required this.shadowSmall,
    required this.shadowMedium,
    required this.shadowLarge,
    required this.goldGlowShadow,
    // Border radius
    required this.radiusSmall,
    required this.radiusMedium,
    required this.radiusLarge,
    required this.radiusXLarge,
  });

  // Gold tokens
  final Color gold;
  final Color goldLight;
  final Color goldDark;
  final LinearGradient goldGradient;
  final Color goldGlow;

  // Glass tokens
  final Color glassBackground;
  final Color glassBackgroundStrong;
  final Color glassBorder;
  final double glassBlurSigma;

  // Surface tokens
  final Color surface;
  final Color surfaceElevated;
  final Color surfaceInput;

  // Border tokens
  final Color borderSubtle;
  final Color borderDefault;
  final Color borderStrong;

  // Accent tokens
  final Color crimson;
  final Color success;
  final Color warning;
  final Color info;

  // Text tokens
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color textOnGold;

  // Decorations
  final BoxDecoration glassDecoration;
  final BoxDecoration glassDecorationStrong;
  final BoxDecoration glassDecorationGold;
  final BoxDecoration surfaceDecoration;
  final BoxDecoration surfaceElevatedDecoration;
  final BoxDecoration buttonPrimaryDecoration;
  final BoxDecoration buttonSecondaryDecoration;
  final BoxDecoration buttonDangerDecoration;

  // Shadows
  final BoxShadow shadowSmall;
  final BoxShadow shadowMedium;
  final BoxShadow shadowLarge;
  final BoxShadow goldGlowShadow;

  // Border radius
  final double radiusSmall;
  final double radiusMedium;
  final double radiusLarge;
  final double radiusXLarge;

  /// The default VLVT theme extension (dark theme)
  static VlvtThemeExtension get dark => VlvtThemeExtension(
        // Gold tokens
        gold: VlvtColors.gold,
        goldLight: VlvtColors.goldLight,
        goldDark: VlvtColors.goldDark,
        goldGradient: VlvtColors.goldGradient,
        goldGlow: VlvtColors.goldGlow,
        // Glass tokens
        glassBackground: VlvtColors.glassBackground,
        glassBackgroundStrong: VlvtColors.glassBackgroundStrong,
        glassBorder: VlvtColors.glassBorder,
        glassBlurSigma: 10.0,
        // Surface tokens
        surface: VlvtColors.surface,
        surfaceElevated: VlvtColors.surfaceElevated,
        surfaceInput: VlvtColors.surfaceInput,
        // Border tokens
        borderSubtle: VlvtColors.borderSubtle,
        borderDefault: VlvtColors.border,
        borderStrong: VlvtColors.borderStrong,
        // Accent tokens
        crimson: VlvtColors.crimson,
        success: VlvtColors.success,
        warning: VlvtColors.warning,
        info: VlvtColors.info,
        // Text tokens
        textPrimary: VlvtColors.textPrimary,
        textSecondary: VlvtColors.textSecondary,
        textMuted: VlvtColors.textMuted,
        textOnGold: VlvtColors.textOnGold,
        // Decorations
        glassDecoration: VlvtDecorations.glassCard,
        glassDecorationStrong: VlvtDecorations.glassCardStrong,
        glassDecorationGold: VlvtDecorations.glassCardGold,
        surfaceDecoration: VlvtDecorations.surfaceCard,
        surfaceElevatedDecoration: VlvtDecorations.surfaceElevated,
        buttonPrimaryDecoration: VlvtDecorations.buttonPrimary,
        buttonSecondaryDecoration: VlvtDecorations.buttonSecondary,
        buttonDangerDecoration: VlvtDecorations.buttonDanger,
        // Shadows
        shadowSmall: VlvtDecorations.shadowSmall,
        shadowMedium: VlvtDecorations.shadowMedium,
        shadowLarge: VlvtDecorations.shadowLarge,
        goldGlowShadow: VlvtDecorations.goldGlowSoft,
        // Border radius
        radiusSmall: VlvtDecorations.radiusSmall,
        radiusMedium: VlvtDecorations.radiusMedium,
        radiusLarge: VlvtDecorations.radiusLarge,
        radiusXLarge: VlvtDecorations.radiusXLarge,
      );

  /// Convenience getter for border radius as BorderRadius
  BorderRadius get borderRadiusSm => BorderRadius.circular(radiusSmall);
  BorderRadius get borderRadiusMd => BorderRadius.circular(radiusMedium);
  BorderRadius get borderRadiusLg => BorderRadius.circular(radiusLarge);
  BorderRadius get borderRadiusXl => BorderRadius.circular(radiusXLarge);

  @override
  VlvtThemeExtension copyWith({
    Color? gold,
    Color? goldLight,
    Color? goldDark,
    LinearGradient? goldGradient,
    Color? goldGlow,
    Color? glassBackground,
    Color? glassBackgroundStrong,
    Color? glassBorder,
    double? glassBlurSigma,
    Color? surface,
    Color? surfaceElevated,
    Color? surfaceInput,
    Color? borderSubtle,
    Color? borderDefault,
    Color? borderStrong,
    Color? crimson,
    Color? success,
    Color? warning,
    Color? info,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? textOnGold,
    BoxDecoration? glassDecoration,
    BoxDecoration? glassDecorationStrong,
    BoxDecoration? glassDecorationGold,
    BoxDecoration? surfaceDecoration,
    BoxDecoration? surfaceElevatedDecoration,
    BoxDecoration? buttonPrimaryDecoration,
    BoxDecoration? buttonSecondaryDecoration,
    BoxDecoration? buttonDangerDecoration,
    BoxShadow? shadowSmall,
    BoxShadow? shadowMedium,
    BoxShadow? shadowLarge,
    BoxShadow? goldGlowShadow,
    double? radiusSmall,
    double? radiusMedium,
    double? radiusLarge,
    double? radiusXLarge,
  }) {
    return VlvtThemeExtension(
      gold: gold ?? this.gold,
      goldLight: goldLight ?? this.goldLight,
      goldDark: goldDark ?? this.goldDark,
      goldGradient: goldGradient ?? this.goldGradient,
      goldGlow: goldGlow ?? this.goldGlow,
      glassBackground: glassBackground ?? this.glassBackground,
      glassBackgroundStrong: glassBackgroundStrong ?? this.glassBackgroundStrong,
      glassBorder: glassBorder ?? this.glassBorder,
      glassBlurSigma: glassBlurSigma ?? this.glassBlurSigma,
      surface: surface ?? this.surface,
      surfaceElevated: surfaceElevated ?? this.surfaceElevated,
      surfaceInput: surfaceInput ?? this.surfaceInput,
      borderSubtle: borderSubtle ?? this.borderSubtle,
      borderDefault: borderDefault ?? this.borderDefault,
      borderStrong: borderStrong ?? this.borderStrong,
      crimson: crimson ?? this.crimson,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      info: info ?? this.info,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      textOnGold: textOnGold ?? this.textOnGold,
      glassDecoration: glassDecoration ?? this.glassDecoration,
      glassDecorationStrong: glassDecorationStrong ?? this.glassDecorationStrong,
      glassDecorationGold: glassDecorationGold ?? this.glassDecorationGold,
      surfaceDecoration: surfaceDecoration ?? this.surfaceDecoration,
      surfaceElevatedDecoration: surfaceElevatedDecoration ?? this.surfaceElevatedDecoration,
      buttonPrimaryDecoration: buttonPrimaryDecoration ?? this.buttonPrimaryDecoration,
      buttonSecondaryDecoration: buttonSecondaryDecoration ?? this.buttonSecondaryDecoration,
      buttonDangerDecoration: buttonDangerDecoration ?? this.buttonDangerDecoration,
      shadowSmall: shadowSmall ?? this.shadowSmall,
      shadowMedium: shadowMedium ?? this.shadowMedium,
      shadowLarge: shadowLarge ?? this.shadowLarge,
      goldGlowShadow: goldGlowShadow ?? this.goldGlowShadow,
      radiusSmall: radiusSmall ?? this.radiusSmall,
      radiusMedium: radiusMedium ?? this.radiusMedium,
      radiusLarge: radiusLarge ?? this.radiusLarge,
      radiusXLarge: radiusXLarge ?? this.radiusXLarge,
    );
  }

  @override
  VlvtThemeExtension lerp(ThemeExtension<VlvtThemeExtension>? other, double t) {
    if (other is! VlvtThemeExtension) {
      return this;
    }
    return VlvtThemeExtension(
      gold: Color.lerp(gold, other.gold, t)!,
      goldLight: Color.lerp(goldLight, other.goldLight, t)!,
      goldDark: Color.lerp(goldDark, other.goldDark, t)!,
      goldGradient: LinearGradient.lerp(goldGradient, other.goldGradient, t)!,
      goldGlow: Color.lerp(goldGlow, other.goldGlow, t)!,
      glassBackground: Color.lerp(glassBackground, other.glassBackground, t)!,
      glassBackgroundStrong: Color.lerp(glassBackgroundStrong, other.glassBackgroundStrong, t)!,
      glassBorder: Color.lerp(glassBorder, other.glassBorder, t)!,
      glassBlurSigma: lerpDouble(glassBlurSigma, other.glassBlurSigma, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceElevated: Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      surfaceInput: Color.lerp(surfaceInput, other.surfaceInput, t)!,
      borderSubtle: Color.lerp(borderSubtle, other.borderSubtle, t)!,
      borderDefault: Color.lerp(borderDefault, other.borderDefault, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      crimson: Color.lerp(crimson, other.crimson, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      info: Color.lerp(info, other.info, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      textOnGold: Color.lerp(textOnGold, other.textOnGold, t)!,
      // Decorations don't lerp, use current
      glassDecoration: t < 0.5 ? glassDecoration : other.glassDecoration,
      glassDecorationStrong: t < 0.5 ? glassDecorationStrong : other.glassDecorationStrong,
      glassDecorationGold: t < 0.5 ? glassDecorationGold : other.glassDecorationGold,
      surfaceDecoration: t < 0.5 ? surfaceDecoration : other.surfaceDecoration,
      surfaceElevatedDecoration: t < 0.5 ? surfaceElevatedDecoration : other.surfaceElevatedDecoration,
      buttonPrimaryDecoration: t < 0.5 ? buttonPrimaryDecoration : other.buttonPrimaryDecoration,
      buttonSecondaryDecoration: t < 0.5 ? buttonSecondaryDecoration : other.buttonSecondaryDecoration,
      buttonDangerDecoration: t < 0.5 ? buttonDangerDecoration : other.buttonDangerDecoration,
      // Shadows don't lerp cleanly, use current
      shadowSmall: t < 0.5 ? shadowSmall : other.shadowSmall,
      shadowMedium: t < 0.5 ? shadowMedium : other.shadowMedium,
      shadowLarge: t < 0.5 ? shadowLarge : other.shadowLarge,
      goldGlowShadow: t < 0.5 ? goldGlowShadow : other.goldGlowShadow,
      // Radius values lerp
      radiusSmall: lerpDouble(radiusSmall, other.radiusSmall, t)!,
      radiusMedium: lerpDouble(radiusMedium, other.radiusMedium, t)!,
      radiusLarge: lerpDouble(radiusLarge, other.radiusLarge, t)!,
      radiusXLarge: lerpDouble(radiusXLarge, other.radiusXLarge, t)!,
    );
  }

  /// Helper to lerp double values
  static double? lerpDouble(double? a, double? b, double t) {
    if (a == null && b == null) return null;
    a ??= 0.0;
    b ??= 0.0;
    return a + (b - a) * t;
  }
}

/// Extension on BuildContext for easy access to VlvtThemeExtension
extension VlvtThemeExtensionContext on BuildContext {
  /// Get the VLVT theme extension
  ///
  /// Usage:
  /// ```dart
  /// final vlvt = context.vlvt;
  /// Container(color: vlvt.gold);
  /// ```
  VlvtThemeExtension get vlvt => Theme.of(this).extension<VlvtThemeExtension>()!;

  /// Check if VLVT theme extension is available
  bool get hasVlvt => Theme.of(this).extension<VlvtThemeExtension>() != null;
}
