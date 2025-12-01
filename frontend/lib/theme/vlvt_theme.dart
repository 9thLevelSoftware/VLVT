import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'vlvt_colors.dart';
import 'vlvt_text_styles.dart';
import 'vlvt_decorations.dart';
import 'vlvt_theme_extension.dart';

/// VLVT "Digital VIP" Theme
///
/// A luxurious dark theme inspired by exclusive nightlife venues.
/// Features gold accents, glassmorphism, and elegant typography.
class VlvtTheme {
  VlvtTheme._();

  /// The main dark theme for VLVT
  static ThemeData get darkTheme => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,

    // VLVT Theme Extension for gold/glass tokens
    extensions: [VlvtThemeExtension.dark],

    // Color scheme
    colorScheme: const ColorScheme.dark(
      primary: VlvtColors.primary,
      onPrimary: VlvtColors.textOnPrimary,
      secondary: VlvtColors.gold,
      onSecondary: VlvtColors.textOnGold,
      tertiary: VlvtColors.crimson,
      surface: VlvtColors.surface,
      onSurface: VlvtColors.textPrimary,
      error: VlvtColors.crimson,
      onError: Colors.white,
    ),

    // Scaffold
    scaffoldBackgroundColor: VlvtColors.background,

    // AppBar
    appBarTheme: AppBarTheme(
      elevation: 0,
      centerTitle: true,
      backgroundColor: VlvtColors.background,
      foregroundColor: VlvtColors.textPrimary,
      iconTheme: const IconThemeData(color: VlvtColors.gold),
      titleTextStyle: VlvtTextStyles.h2.copyWith(
        fontFamily: VlvtTextStyles.fontFamilyDisplay,
        fontStyle: FontStyle.italic,
      ),
      systemOverlayStyle: SystemUiOverlayStyle.light,
    ),

    // Bottom navigation bar
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: VlvtColors.surface,
      selectedItemColor: VlvtColors.gold,
      unselectedItemColor: VlvtColors.textMuted,
      selectedLabelStyle: VlvtTextStyles.labelSmall.copyWith(
        color: VlvtColors.gold,
      ),
      unselectedLabelStyle: VlvtTextStyles.labelSmall.copyWith(
        color: VlvtColors.textMuted,
      ),
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    ),

    // Navigation bar (Material 3)
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: VlvtColors.surface,
      indicatorColor: VlvtColors.gold.withValues(alpha: 0.2),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: VlvtColors.gold);
        }
        return IconThemeData(color: VlvtColors.textMuted);
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return VlvtTextStyles.labelSmall.copyWith(color: VlvtColors.gold);
        }
        return VlvtTextStyles.labelSmall.copyWith(color: VlvtColors.textMuted);
      }),
    ),

    // Text theme
    textTheme: TextTheme(
      displayLarge: VlvtTextStyles.displayLarge,
      displayMedium: VlvtTextStyles.displayMedium,
      displaySmall: VlvtTextStyles.displaySmall,
      headlineLarge: VlvtTextStyles.h1,
      headlineMedium: VlvtTextStyles.h2,
      headlineSmall: VlvtTextStyles.h3,
      titleLarge: VlvtTextStyles.h2,
      titleMedium: VlvtTextStyles.h3,
      titleSmall: VlvtTextStyles.h4,
      bodyLarge: VlvtTextStyles.bodyLarge,
      bodyMedium: VlvtTextStyles.bodyMedium,
      bodySmall: VlvtTextStyles.bodySmall,
      labelLarge: VlvtTextStyles.labelLarge,
      labelMedium: VlvtTextStyles.labelMedium,
      labelSmall: VlvtTextStyles.labelSmall,
    ),

    // Input decoration
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: VlvtColors.glassBackgroundStrong,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      hintStyle: VlvtTextStyles.inputHint,
      labelStyle: VlvtTextStyles.inputHint,
      prefixIconColor: VlvtColors.gold,
      suffixIconColor: VlvtColors.gold,
      border: OutlineInputBorder(
        borderRadius: VlvtDecorations.borderRadiusMd,
        borderSide: BorderSide(color: VlvtColors.borderStrong, width: 1),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: VlvtDecorations.borderRadiusMd,
        borderSide: BorderSide(color: VlvtColors.borderStrong, width: 1),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: VlvtDecorations.borderRadiusMd,
        borderSide: const BorderSide(color: VlvtColors.gold, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: VlvtDecorations.borderRadiusMd,
        borderSide: const BorderSide(color: VlvtColors.crimson, width: 1),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: VlvtDecorations.borderRadiusMd,
        borderSide: const BorderSide(color: VlvtColors.crimson, width: 2),
      ),
      errorStyle: VlvtTextStyles.error,
    ),

    // Elevated button (primary)
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: VlvtColors.gold,
        foregroundColor: VlvtColors.textOnGold,
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: VlvtDecorations.borderRadiusMd,
        ),
        elevation: 0,
        textStyle: VlvtTextStyles.button,
      ),
    ),

    // Outlined button (secondary)
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: VlvtColors.gold,
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: VlvtDecorations.borderRadiusMd,
        ),
        side: const BorderSide(color: VlvtColors.gold, width: 1.5),
        textStyle: VlvtTextStyles.button,
      ),
    ),

    // Text button
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: VlvtColors.gold,
        textStyle: VlvtTextStyles.labelMedium,
      ),
    ),

    // Floating action button
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: VlvtColors.gold,
      foregroundColor: VlvtColors.textOnGold,
      elevation: 4,
    ),

    // Card
    cardTheme: CardThemeData(
      color: VlvtColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: VlvtDecorations.borderRadiusLg,
        side: BorderSide(color: VlvtColors.borderSubtle, width: 1),
      ),
    ),

    // Dialog
    dialogTheme: DialogThemeData(
      backgroundColor: VlvtColors.surfaceElevated,
      shape: RoundedRectangleBorder(
        borderRadius: VlvtDecorations.borderRadiusLg,
      ),
      titleTextStyle: VlvtTextStyles.h2,
      contentTextStyle: VlvtTextStyles.bodyMedium,
    ),

    // Bottom sheet
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: VlvtColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(VlvtDecorations.radiusXLarge),
        ),
      ),
    ),

    // Snackbar
    snackBarTheme: SnackBarThemeData(
      backgroundColor: VlvtColors.surfaceElevated,
      contentTextStyle: VlvtTextStyles.bodyMedium,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: VlvtDecorations.borderRadiusMd,
      ),
    ),

    // Chip
    chipTheme: ChipThemeData(
      backgroundColor: VlvtColors.surface,
      selectedColor: VlvtColors.gold.withValues(alpha: 0.2),
      labelStyle: VlvtTextStyles.labelSmall,
      side: BorderSide(color: VlvtColors.borderStrong, width: 1),
      shape: RoundedRectangleBorder(
        borderRadius: VlvtDecorations.borderRadiusSm,
      ),
    ),

    // Switch
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return VlvtColors.gold;
        }
        return VlvtColors.textMuted;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return VlvtColors.gold.withValues(alpha: 0.3);
        }
        return VlvtColors.surface;
      }),
    ),

    // Slider
    sliderTheme: SliderThemeData(
      activeTrackColor: VlvtColors.gold,
      inactiveTrackColor: VlvtColors.surface,
      thumbColor: VlvtColors.gold,
      overlayColor: VlvtColors.gold.withValues(alpha: 0.2),
    ),

    // Progress indicator
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: VlvtColors.gold,
      linearTrackColor: VlvtColors.surface,
    ),

    // Divider
    dividerTheme: DividerThemeData(
      color: VlvtColors.divider,
      thickness: 1,
    ),

    // Icon
    iconTheme: const IconThemeData(
      color: VlvtColors.textPrimary,
      size: 24,
    ),

    // Tab bar
    tabBarTheme: TabBarThemeData(
      labelColor: VlvtColors.gold,
      unselectedLabelColor: VlvtColors.textMuted,
      labelStyle: VlvtTextStyles.labelMedium,
      unselectedLabelStyle: VlvtTextStyles.labelMedium,
      indicator: const UnderlineTabIndicator(
        borderSide: BorderSide(color: VlvtColors.gold, width: 2),
      ),
    ),

    // List tile
    listTileTheme: ListTileThemeData(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      tileColor: Colors.transparent,
      iconColor: VlvtColors.gold,
      textColor: VlvtColors.textPrimary,
      subtitleTextStyle: VlvtTextStyles.bodySmall.copyWith(
        color: VlvtColors.textSecondary,
      ),
    ),

    // Checkbox
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return VlvtColors.gold;
        }
        return Colors.transparent;
      }),
      checkColor: WidgetStateProperty.all(VlvtColors.textOnGold),
      side: BorderSide(color: VlvtColors.borderStrong, width: 2),
    ),

    // Radio
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return VlvtColors.gold;
        }
        return VlvtColors.textMuted;
      }),
    ),
  );

  /// Light theme (fallback - same as dark for now)
  /// VLVT is designed as dark-first, but this provides compatibility
  static ThemeData get lightTheme => darkTheme;
}
