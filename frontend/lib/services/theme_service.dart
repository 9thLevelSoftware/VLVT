import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/vlvt_theme.dart';

/// Service for managing app theme (light/dark mode)
class ThemeService extends ChangeNotifier {
  static const String _themePreferenceKey = 'theme_mode';

  ThemeMode _themeMode = ThemeMode.system;
  bool _isInitialized = false;

  ThemeMode get themeMode => _themeMode;
  bool get isInitialized => _isInitialized;

  /// Whether dark mode is currently active
  bool get isDarkMode {
    return _themeMode == ThemeMode.dark ||
        (_themeMode == ThemeMode.system &&
         WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark);
  }

  /// Initialize theme from stored preference
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final savedThemeIndex = prefs.getInt(_themePreferenceKey);

      if (savedThemeIndex != null && savedThemeIndex >= 0 && savedThemeIndex < ThemeMode.values.length) {
        _themeMode = ThemeMode.values[savedThemeIndex];
      }

      _isInitialized = true;
      notifyListeners();
    } catch (e) {
      // debugPrint('Error loading theme preference: $e');
      _isInitialized = true;
    }
  }

  /// Set theme mode and persist preference
  Future<void> setThemeMode(ThemeMode mode) async {
    if (_themeMode == mode) return;

    _themeMode = mode;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_themePreferenceKey, mode.index);
    } catch (e) {
      // debugPrint('Error saving theme preference: $e');
    }
  }

  /// Toggle between light and dark mode
  Future<void> toggleTheme() async {
    if (_themeMode == ThemeMode.light) {
      await setThemeMode(ThemeMode.dark);
    } else if (_themeMode == ThemeMode.dark) {
      await setThemeMode(ThemeMode.light);
    } else {
      // If system mode, switch to dark
      await setThemeMode(ThemeMode.dark);
    }
  }

  /// Reset to system default
  Future<void> useSystemTheme() async {
    await setThemeMode(ThemeMode.system);
  }
}

/// Light and dark theme definitions
/// Now uses the VLVT "Digital VIP" theme system
class AppThemes {
  // Private constructor to prevent instantiation
  AppThemes._();

  /// Light theme - uses VlvtTheme (dark-first design)
  static ThemeData get lightTheme => VlvtTheme.lightTheme;

  /// Dark theme - the primary VLVT "Digital VIP" theme
  static ThemeData get darkTheme => VlvtTheme.darkTheme;
}
