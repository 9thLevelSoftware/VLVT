import 'package:flutter/material.dart';
import 'vlvt_button.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';

/// Enhanced empty state widget with icons, helpful messaging, and CTAs
class EmptyStateWidget extends StatefulWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? secondaryActionLabel;
  final VoidCallback? onSecondaryAction;
  final Color? iconColor;
  final double iconSize;

  const EmptyStateWidget({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
    this.iconColor,
    this.iconSize = 100.0,
  });

  @override
  State<EmptyStateWidget> createState() => _EmptyStateWidgetState();
}

class _EmptyStateWidgetState extends State<EmptyStateWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _breathingController;
  late Animation<double> _breathingAnimation;

  @override
  void initState() {
    super.initState();
    _breathingController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    _breathingAnimation = Tween<double>(begin: 0.9, end: 1.0).animate(
      CurvedAnimation(parent: _breathingController, curve: Curves.easeInOut),
    );
    _breathingController.repeat(reverse: true);
  }

  @override
  void dispose() {
    _breathingController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Animated icon with continuous breathing effect
            AnimatedBuilder(
              animation: _breathingAnimation,
              builder: (context, child) {
                return Transform.scale(
                  scale: _breathingAnimation.value,
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: (widget.iconColor ?? theme.colorScheme.primary)
                          .withAlpha(isDark ? 38 : 26),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      widget.icon,
                      size: widget.iconSize,
                      color: widget.iconColor ?? theme.colorScheme.primary,
                    ),
                  ),
                );
              },
            ),

            const SizedBox(height: 32),

            // Title
            Text(
              widget.title,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: theme.textTheme.bodyLarge?.color,
              ),
              textAlign: TextAlign.center,
            ),

            const SizedBox(height: 12),

            // Message
            Text(
              widget.message,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.textTheme.bodyMedium?.color,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),

            const SizedBox(height: 32),

            // Primary action button
            if (widget.actionLabel != null && widget.onAction != null)
              VlvtButton.primary(
                label: widget.actionLabel!,
                onPressed: widget.onAction,
                icon: Icons.arrow_forward,
                expanded: true,
              ),

            // Secondary action button
            if (widget.secondaryActionLabel != null && widget.onSecondaryAction != null) ...[
              const SizedBox(height: 12),
              VlvtButton.secondary(
                label: widget.secondaryActionLabel!,
                onPressed: widget.onSecondaryAction,
                expanded: true,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Specific empty states for common scenarios
class DiscoveryEmptyState {
  /// P2: Concierge-style empty state with premium feel
  static Widget noProfiles({
    required BuildContext context,
    required bool hasFilters,
    required VoidCallback onAdjustFilters,
    required VoidCallback onShowAllProfiles,
    VoidCallback? onEnableNotifications,
    bool showNotificationPrompt = false,
  }) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Concierge avatar with gradient ring
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [
                    VlvtColors.gold,
                    VlvtColors.gold.withValues(alpha: 0.6),
                  ],
                ),
              ),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: VlvtColors.surface,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.diamond_outlined,
                  size: 64,
                  color: VlvtColors.gold,
                ),
              ),
            ),

            const SizedBox(height: 32),

            // Concierge greeting
            Text(
              hasFilters ? 'Curating Your Experience' : 'Your VLVT Concierge',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                fontFamily: 'Montserrat',
                color: VlvtColors.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),

            const SizedBox(height: 16),

            // Friendly message based on context
            Text(
              hasFilters
                  ? "We're searching for profiles that match your refined preferences. Quality over quantity—your perfect match may be just around the corner."
                  : "You've explored everyone available in your area for now. We're constantly welcoming new members to our exclusive community.",
              style: TextStyle(
                fontSize: 16,
                height: 1.6,
                color: VlvtColors.textSecondary,
                fontFamily: 'Montserrat',
              ),
              textAlign: TextAlign.center,
            ),

            const SizedBox(height: 32),

            // Notification prompt (if not yet enabled)
            if (showNotificationPrompt && onEnableNotifications != null) ...[
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: VlvtColors.gold.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: VlvtColors.gold.withValues(alpha: 0.3),
                  ),
                ),
                child: Column(
                  children: [
                    Icon(
                      Icons.notifications_active_outlined,
                      size: 32,
                      color: VlvtColors.gold,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Be the First to Know',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'Montserrat',
                        color: VlvtColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Get notified when new members join or when you receive a like.",
                      style: TextStyle(
                        fontSize: 14,
                        color: VlvtColors.textSecondary,
                        fontFamily: 'Montserrat',
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    VlvtButton.primary(
                      label: 'Enable Notifications',
                      onPressed: onEnableNotifications,
                      icon: Icons.notifications,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Action buttons
            if (hasFilters) ...[
              VlvtButton.primary(
                label: 'Adjust Preferences',
                onPressed: onAdjustFilters,
                icon: Icons.tune,
                expanded: true,
              ),
              const SizedBox(height: 12),
              VlvtButton.secondary(
                label: 'See Everyone',
                onPressed: onShowAllProfiles,
                expanded: true,
              ),
            ] else ...[
              VlvtButton.primary(
                label: 'Start Fresh',
                onPressed: onShowAllProfiles,
                icon: Icons.refresh,
                expanded: true,
              ),
            ],

            const SizedBox(height: 24),

            // Reassuring footer - improved contrast
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.verified_user_outlined,
                  size: 16,
                  color: VlvtColors.textSecondary,
                ),
                const SizedBox(width: 8),
                Text(
                  'New members are verified daily',
                  style: VlvtTextStyles.caption.copyWith(
                    color: VlvtColors.textSecondary,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class MatchesEmptyState {
  static Widget noMatches({
    required VoidCallback onGoToDiscovery,
  }) {
    return EmptyStateWidget(
      icon: Icons.favorite_border_rounded,
      iconColor: Colors.pink,
      iconSize: 120,
      title: 'No matches yet',
      message: 'Start swiping in the Discovery tab to find people you like. When you both like each other, you\'ll match!',
      actionLabel: 'Go to Discovery',
      onAction: onGoToDiscovery,
    );
  }

  static Widget noSearchResults() {
    return const EmptyStateWidget(
      icon: Icons.search_off_rounded,
      iconColor: VlvtColors.textMuted,
      title: 'No matches found',
      message: 'Try adjusting your search terms or clear filters to see all your matches.',
    );
  }
}

class ChatEmptyState {
  static Widget noMessages({
    required String matchedUserName,
  }) {
    return EmptyStateWidget(
      icon: Icons.chat_bubble_outline_rounded,
      iconColor: Colors.blue,
      title: 'Start the conversation!',
      message: 'You matched with $matchedUserName. Say hi and break the ice!',
    );
  }
}
