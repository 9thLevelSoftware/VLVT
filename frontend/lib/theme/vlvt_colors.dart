import 'package:flutter/material.dart';

/// VLVT "Digital VIP" Color System
///
/// A luxurious dark color palette inspired by velvet ropes,
/// gold stanchions, and exclusive nightlife venues.
class VlvtColors {
  VlvtColors._();

  // ============================================
  // BACKGROUND COLORS
  // ============================================

  /// Main app background - rich onyx, softer than pure black
  static const Color background = Color(0xFF0D0D0D);

  /// Card and nav bar surfaces
  static const Color surface = Color(0xFF1A1A1A);

  /// Elevated surfaces (modals, raised cards)
  static const Color surfaceElevated = Color(0xFF242424);

  /// Subtle surface for inputs/fields
  static const Color surfaceInput = Color(0xFF1F1F1F);

  // ============================================
  // PRIMARY COLORS (Velvet Purple)
  // ============================================

  /// Primary brand color - royal velvet purple
  static const Color primary = Color(0xFF6B3FA0);

  /// Lighter variant for hover/highlight states
  static const Color primaryLight = Color(0xFF8B5FC0);

  /// Darker variant for pressed states
  static const Color primaryDark = Color(0xFF4A2870);

  // ============================================
  // GOLD (Metallic Accent)
  // ============================================

  /// Primary gold - for icons, borders, accents
  static const Color gold = Color(0xFFD4AF37);

  /// Light gold - gradient end color
  static const Color goldLight = Color(0xFFF2D26D);

  /// Dark gold - for pressed states
  static const Color goldDark = Color(0xFFB8960F);

  /// Gold gradient for primary buttons and highlights
  static const LinearGradient goldGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [gold, goldLight],
  );

  /// Horizontal gold gradient for buttons
  static const LinearGradient goldGradientHorizontal = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [gold, goldLight],
  );

  /// Gold gradient at 45 degrees
  static LinearGradient get goldGradient45 => const LinearGradient(
    begin: Alignment(-1, -1),
    end: Alignment(1, 1),
    colors: [gold, goldLight],
  );

  // ============================================
  // ACCENT COLORS
  // ============================================

  /// Red carpet crimson - notifications, alerts, new matches
  static const Color crimson = Color(0xFFC41E3A);

  /// Lighter crimson for hover
  static const Color crimsonLight = Color(0xFFE63950);

  /// Success green
  static const Color success = Color(0xFF2ECC71);

  /// Warning amber
  static const Color warning = Color(0xFFF39C12);

  // ============================================
  // TEXT COLORS
  // ============================================

  /// Primary text - white at 95% opacity
  static const Color textPrimary = Color(0xFFF2F2F2);

  /// Secondary text - white at 70% opacity
  static const Color textSecondary = Color(0xFFB3B3B3);

  /// Muted/hint text - white at 60% for WCAG AA contrast (was 50%)
  static const Color textMuted = Color(0xFF999999);

  /// Text on gold buttons
  static const Color textOnGold = Color(0xFF0D0D0D);

  /// Text on primary (purple) buttons
  static const Color textOnPrimary = Color(0xFFFFFFFF);

  // ============================================
  // BORDER & DIVIDER COLORS
  // ============================================

  /// Subtle border - white at 10%
  static Color get borderSubtle => Colors.white.withValues(alpha: 0.1);

  /// Default border - white at 20%
  static Color get border => Colors.white.withValues(alpha: 0.2);

  /// Strong border - white at 30%
  static Color get borderStrong => Colors.white.withValues(alpha: 0.3);

  /// Gold border for focus states
  static const Color borderGold = gold;

  /// Divider color
  static Color get divider => Colors.white.withValues(alpha: 0.1);

  // ============================================
  // GLASSMORPHISM COLORS
  // ============================================

  /// Glass background - white at 5%
  static Color get glassBackground => Colors.white.withValues(alpha: 0.05);

  /// Glass background stronger - white at 10%
  static Color get glassBackgroundStrong => Colors.white.withValues(alpha: 0.1);

  /// Glass border
  static Color get glassBorder => Colors.white.withValues(alpha: 0.2);

  // ============================================
  // GLOW EFFECTS
  // ============================================

  /// Gold glow for buttons and focus states
  static Color get goldGlow => gold.withValues(alpha: 0.4);

  /// Primary glow
  static Color get primaryGlow => primary.withValues(alpha: 0.4);

  /// Crimson glow for notifications
  static Color get crimsonGlow => crimson.withValues(alpha: 0.4);

  // ============================================
  // OVERLAY COLORS
  // ============================================

  /// Dark overlay for modals/dialogs
  static Color get overlay => Colors.black.withValues(alpha: 0.7);

  /// Lighter overlay
  static Color get overlayLight => Colors.black.withValues(alpha: 0.5);

  // ============================================
  // SEMANTIC COLORS (Context-aware)
  // ============================================

  /// Like action color
  static const Color like = success;

  /// Dislike/pass action color
  static const Color dislike = Color(0xFFE74C3C);

  /// Super like color
  static const Color superLike = Color(0xFF3498DB);

  /// Match notification color
  static const Color match = crimson;

  // ============================================
  // CHAT & MESSAGING
  // ============================================

  /// Message bubble for sent messages (current user)
  static const Color chatBubbleSent = primary;

  /// Message bubble for received messages
  static const Color chatBubbleReceived = surfaceElevated;

  /// Text color for sent message bubbles
  static const Color chatTextSent = textOnPrimary;

  /// Text color for received message bubbles
  static const Color chatTextReceived = textPrimary;

  /// Timestamp for sent messages - 85% for WCAG AA on purple background (was 70%)
  static Color get chatTimestampSent => Colors.white.withValues(alpha: 0.85);

  /// Timestamp for received messages
  static Color get chatTimestampReceived => textMuted;

  /// Typing indicator background
  static const Color typingIndicatorBackground = surfaceElevated;

  /// Typing indicator dots
  static const Color typingIndicatorDots = textMuted;

  // ============================================
  // STATUS COLORS (Complete set)
  // ============================================

  /// Info state - blue
  static const Color info = Color(0xFF3498DB);

  /// Error state (alias for crimson for semantic clarity)
  static const Color error = crimson;

  // ============================================
  // PREMIUM/SUBSCRIPTION
  // ============================================

  /// Premium UI elements (gold)
  static const Color premium = gold;

  /// Free tier UI elements
  static const Color freeTier = textMuted;
}
