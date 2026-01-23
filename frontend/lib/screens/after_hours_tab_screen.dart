/// After Hours Tab Screen
/// Entry point for After Hours mode with state-driven UI
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../services/after_hours_service.dart';
import '../services/after_hours_profile_service.dart';
import '../services/location_service.dart';
import '../widgets/after_hours/session_timer.dart';
import '../widgets/after_hours/searching_animation.dart';
import '../widgets/after_hours/session_expiry_banner.dart';
import '../widgets/after_hours/match_card_overlay.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_loader.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import 'after_hours_profile_screen.dart';
import 'after_hours_preferences_screen.dart';

/// Main tab screen for After Hours mode.
///
/// Displays different UI based on [AfterHoursState]:
/// - [inactive]: Setup checklist and session start flow
/// - [activating]: Loading indicator while starting session
/// - [searching]: Animated searching UI with nearby count
/// - [matched]: Match card overlay with swipe gestures
/// - [chatting]: In chat placeholder (full UI in Plan 06-05)
/// - [expiring]: Same as searching but with warning banner
/// - [expired]: Session ended with restart option
class AfterHoursTabScreen extends StatefulWidget {
  const AfterHoursTabScreen({super.key});

  @override
  State<AfterHoursTabScreen> createState() => _AfterHoursTabScreenState();
}

class _AfterHoursTabScreenState extends State<AfterHoursTabScreen>
    with WidgetsBindingObserver {
  int _selectedDuration = 30; // minutes
  bool _isStarting = false;

  /// Track if match card modal is displayed.
  /// Prevents duplicate modals when state change fires multiple times.
  bool _isMatchCardShowing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadSetupData();

    // Listen for match state to show overlay
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AfterHoursService>().addListener(_onServiceStateChanged);
    });
  }

  @override
  void dispose() {
    // Remove listener safely - need to check if context is still valid
    try {
      context.read<AfterHoursService>().removeListener(_onServiceStateChanged);
    } catch (e) {
      // Service may be disposed already during hot reload
      debugPrint('AfterHoursTabScreen: Could not remove listener: $e');
    }
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Refresh session status when app returns to foreground
      context.read<AfterHoursService>().refreshSessionStatus();
    }
  }

  /// Load profile and preferences data for setup checklist.
  Future<void> _loadSetupData() async {
    final profileService = context.read<AfterHoursProfileService>();
    await profileService.loadAll();
  }

  /// Handle service state changes to show/hide match card overlay.
  void _onServiceStateChanged() {
    if (!mounted) return;

    final service = context.read<AfterHoursService>();

    // Show match card when state becomes matched
    if (service.state == AfterHoursState.matched && service.currentMatch != null) {
      // Use boolean flag to prevent duplicate modals
      if (!_isMatchCardShowing) {
        _showMatchCard(service.currentMatch!);
      }
    }

    // Handle session expiry notification
    if (service.state == AfterHoursState.expired) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Your After Hours session has ended'),
          duration: Duration(seconds: 3),
        ),
      );
    }
  }

  /// Show the match card modal overlay.
  void _showMatchCard(AfterHoursMatch match) {
    // Set flag to prevent duplicate modals
    setState(() => _isMatchCardShowing = true);

    HapticFeedback.heavyImpact();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false, // Require explicit accept/decline
      enableDrag: false, // Disable default drag-to-dismiss
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scrollController) => MatchCardOverlay(
          match: match,
          onAccept: () {
            Navigator.pop(context);
            setState(() => _isMatchCardShowing = false);
            _acceptMatch(match);
          },
          onDecline: () {
            Navigator.pop(context);
            setState(() => _isMatchCardShowing = false);
            _declineMatch(match);
          },
        ),
      ),
    ).whenComplete(() {
      // Reset flag when modal closes (handles edge cases like back button)
      if (mounted) {
        setState(() => _isMatchCardShowing = false);
      }
    });
  }

  /// Accept the current match and transition to chatting.
  Future<void> _acceptMatch(AfterHoursMatch match) async {
    final service = context.read<AfterHoursService>();
    await service.acceptMatch();
    // Navigation to chat will be handled in Plan 06-05
  }

  /// Decline the current match and return to searching.
  Future<void> _declineMatch(AfterHoursMatch match) async {
    final service = context.read<AfterHoursService>();
    await service.declineMatch();
  }

  /// Start an After Hours session.
  Future<void> _startSession() async {
    setState(() => _isStarting = true);

    try {
      final locationService = context.read<LocationService>();
      final afterHoursService = context.read<AfterHoursService>();

      // Get current location
      final location = await locationService.getCurrentLocation();
      if (location == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Unable to get location. Please enable location services.'),
              backgroundColor: VlvtColors.error,
            ),
          );
        }
        setState(() => _isStarting = false);
        return;
      }

      // Start session
      await afterHoursService.startSession(
        durationMinutes: _selectedDuration,
        lat: location.latitude,
        lng: location.longitude,
      );

      HapticFeedback.mediumImpact();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to start session: $e'),
            backgroundColor: VlvtColors.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isStarting = false);
      }
    }
  }

  /// End the current session early with confirmation.
  Future<void> _endSession() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: VlvtColors.surface,
        title: Text('End Session?', style: VlvtTextStyles.h2),
        content: Text(
          'Your After Hours session will end and any active chats will close.',
          style: VlvtTextStyles.bodyMedium.copyWith(
            color: VlvtColors.textSecondary,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              'Cancel',
              style: TextStyle(color: VlvtColors.textSecondary),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              'End Session',
              style: TextStyle(color: VlvtColors.crimson),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await context.read<AfterHoursService>().endSession();
    }
  }

  /// Build the inactive state UI with setup checklist and start flow.
  Widget _buildInactiveContent(AfterHoursProfileService profileService) {
    if (profileService.isLoading) {
      return const Center(child: VlvtLoader());
    }

    final profile = profileService.profile;
    final preferences = profileService.preferences;
    final isProfileComplete = profile?.isComplete ?? false;
    final isPrefsComplete = preferences?.isComplete ?? false;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Center(
            child: Column(
              children: [
                const Icon(
                  Icons.nightlife,
                  size: 64,
                  color: VlvtColors.gold,
                ),
                const SizedBox(height: 16),
                Text(
                  'After Hours Mode',
                  style: VlvtTextStyles.h1,
                ),
                const SizedBox(height: 8),
                Text(
                  'Connect with people nearby right now',
                  style: VlvtTextStyles.bodyMedium.copyWith(
                    color: VlvtColors.textSecondary,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),

          // Setup checklist
          _buildSetupItem(
            title: 'After Hours Profile',
            subtitle: isProfileComplete ? 'Complete' : 'Add photo and bio',
            isComplete: isProfileComplete,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AfterHoursProfileScreen()),
            ).then((_) => _loadSetupData()),
          ),

          const SizedBox(height: 12),

          _buildSetupItem(
            title: 'Matching Preferences',
            subtitle: isPrefsComplete ? 'Complete' : 'Set your preferences',
            isComplete: isPrefsComplete,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AfterHoursPreferencesScreen()),
            ).then((_) => _loadSetupData()),
          ),

          const SizedBox(height: 32),

          // Duration selector (only shown when setup complete)
          if (isProfileComplete && isPrefsComplete) ...[
            Text(
              'Session Duration',
              style: VlvtTextStyles.labelLarge,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _buildDurationChip(15),
                const SizedBox(width: 8),
                _buildDurationChip(30),
                const SizedBox(width: 8),
                _buildDurationChip(60),
              ],
            ),

            const SizedBox(height: 32),

            // Start button
            VlvtButton.primary(
              label: _isStarting ? 'Starting...' : 'Start Session',
              onPressed: _isStarting ? null : _startSession,
              loading: _isStarting,
              expanded: true,
            ),

            const SizedBox(height: 16),

            Text(
              'Your location will be used to find nearby users. Location is fuzzed for privacy.',
              style: VlvtTextStyles.bodySmall.copyWith(
                color: VlvtColors.textMuted,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  /// Build a setup checklist item.
  Widget _buildSetupItem({
    required String title,
    required String subtitle,
    required bool isComplete,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: VlvtColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isComplete ? VlvtColors.success : VlvtColors.border,
            width: 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isComplete
                    ? VlvtColors.success.withValues(alpha: 0.2)
                    : VlvtColors.gold.withValues(alpha: 0.2),
              ),
              child: Icon(
                isComplete ? Icons.check : Icons.edit,
                color: isComplete ? VlvtColors.success : VlvtColors.gold,
                size: 20,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: VlvtTextStyles.labelLarge),
                  Text(
                    subtitle,
                    style: VlvtTextStyles.bodySmall.copyWith(
                      color: isComplete ? VlvtColors.success : VlvtColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right,
              color: VlvtColors.textMuted,
            ),
          ],
        ),
      ),
    );
  }

  /// Build a duration selection chip.
  Widget _buildDurationChip(int minutes) {
    final isSelected = _selectedDuration == minutes;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedDuration = minutes),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? VlvtColors.gold : VlvtColors.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? VlvtColors.gold : VlvtColors.border,
            ),
          ),
          child: Text(
            '$minutes min',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Montserrat',
              fontWeight: FontWeight.w600,
              color: isSelected ? VlvtColors.textOnGold : VlvtColors.textPrimary,
            ),
          ),
        ),
      ),
    );
  }

  /// Build the expired state UI with restart option.
  Widget _buildExpiredContent() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.timer_off,
              size: 64,
              color: VlvtColors.textMuted,
            ),
            const SizedBox(height: 24),
            Text(
              'Session Ended',
              style: VlvtTextStyles.h2,
            ),
            const SizedBox(height: 8),
            Text(
              'Your After Hours session has expired.',
              style: VlvtTextStyles.bodyMedium.copyWith(
                color: VlvtColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            VlvtButton.primary(
              label: 'Start New Session',
              onPressed: () {
                // Reset to inactive state to show setup screen
                context.read<AfterHoursService>().resetToInactive();
              },
            ),
          ],
        ),
      ),
    );
  }

  /// Build the main content based on current state.
  Widget _buildStateContent(
    AfterHoursState state,
    AfterHoursProfileService profileService,
    AfterHoursService afterHoursService,
  ) {
    switch (state) {
      case AfterHoursState.inactive:
        return _buildInactiveContent(profileService);

      case AfterHoursState.activating:
        return const Center(child: VlvtLoader());

      case AfterHoursState.searching:
        return Center(
          child: SearchingAnimation(
            nearbyCount: afterHoursService.nearbyCount,
          ),
        );

      case AfterHoursState.matched:
        // Match card shown as modal overlay
        // Keep showing searching animation behind the modal
        return Center(
          child: SearchingAnimation(
            nearbyCount: afterHoursService.nearbyCount,
          ),
        );

      case AfterHoursState.chatting:
        // Will navigate to chat screen in Plan 06-05
        return Center(
          child: Text('In chat...', style: VlvtTextStyles.bodyMedium),
        );

      case AfterHoursState.expiring:
        // Same as searching but with banner above
        return Center(
          child: SearchingAnimation(
            nearbyCount: afterHoursService.nearbyCount,
          ),
        );

      case AfterHoursState.expired:
        return _buildExpiredContent();
    }
  }

  @override
  Widget build(BuildContext context) {
    final afterHoursService = context.watch<AfterHoursService>();
    final profileService = context.watch<AfterHoursProfileService>();
    final state = afterHoursService.state;

    return Scaffold(
      backgroundColor: VlvtColors.background,
      appBar: AppBar(
        backgroundColor: VlvtColors.background,
        title: Text('After Hours', style: VlvtTextStyles.h2),
        centerTitle: true,
        elevation: 0,
        actions: [
          // Timer in app bar when session is active
          if (afterHoursService.isSessionActive && afterHoursService.expiresAt != null)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Center(
                child: SessionTimer(
                  expiresAt: afterHoursService.expiresAt!,
                  onWarning: () {
                    HapticFeedback.heavyImpact();
                  },
                ),
              ),
            ),
          // Stop button when session is active
          if (afterHoursService.isSessionActive)
            IconButton(
              icon: const Icon(Icons.stop_circle_outlined),
              onPressed: _endSession,
              tooltip: 'End Session',
            ),
        ],
      ),
      body: Column(
        children: [
          // Expiry warning banner
          if (state == AfterHoursState.expiring)
            SessionExpiryBanner(
              secondsRemaining: afterHoursService.remainingSeconds,
              onExtend: null, // TODO: Implement session extension in future
            ),

          // Main content based on state
          Expanded(
            child: _buildStateContent(state, profileService, afterHoursService),
          ),
        ],
      ),
    );
  }
}
