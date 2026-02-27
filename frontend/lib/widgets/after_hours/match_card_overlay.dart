/// Match Card Overlay Widget
/// Shows After Hours match as modal with swipe gestures
library;

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/after_hours_service.dart';
import '../../theme/vlvt_colors.dart';
import '../../theme/vlvt_text_styles.dart';
import '../../widgets/vlvt_button.dart';
import '../../widgets/vlvt_loader.dart';

/// Modal match card with Tinder-style swipe gestures for After Hours mode.
///
/// Features:
/// - Photo with gradient overlay for text readability
/// - Name, age, distance, bio display
/// - Swipe right = accept (CHAT indicator)
/// - Swipe left = decline (PASS indicator)
/// - Chat/Decline buttons
/// - Auto-decline timer display
/// - Haptic feedback on actions
class MatchCardOverlay extends StatefulWidget {
  final AfterHoursMatch match;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const MatchCardOverlay({
    super.key,
    required this.match,
    required this.onAccept,
    required this.onDecline,
  });

  @override
  State<MatchCardOverlay> createState() => _MatchCardOverlayState();
}

class _MatchCardOverlayState extends State<MatchCardOverlay>
    with SingleTickerProviderStateMixin {
  // Swipe state
  Offset _cardPosition = Offset.zero;
  double _cardRotation = 0.0;
  bool _isDragging = false;

  // Animation
  late AnimationController _swipeAnimationController;
  late Animation<Offset> _swipeAnimation;

  // Auto-decline timer
  Timer? _autoDeclineTimer;
  Duration _timeRemaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _swipeAnimationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );

    // Initialize swipe animation with default value
    _swipeAnimation = Tween<Offset>(
      begin: Offset.zero,
      end: Offset.zero,
    ).animate(_swipeAnimationController);

    // Initialize auto-decline timer if deadline set
    if (widget.match.autoDeclineAt != null) {
      _timeRemaining = widget.match.autoDeclineAt!.difference(DateTime.now());
      if (_timeRemaining.isNegative) {
        _timeRemaining = Duration.zero;
      }
      _startAutoDeclineTimer();
    }
  }

  @override
  void dispose() {
    _swipeAnimationController.dispose();
    _autoDeclineTimer?.cancel();
    super.dispose();
  }

  void _startAutoDeclineTimer() {
    _autoDeclineTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      setState(() {
        _timeRemaining = widget.match.autoDeclineAt!.difference(DateTime.now());
        if (_timeRemaining.isNegative || _timeRemaining == Duration.zero) {
          _timeRemaining = Duration.zero;
          timer.cancel();
          // Auto-dismiss overlay when timer reaches zero
          widget.onDecline();
        }
      });
    });
  }

  void _onPanStart(DragStartDetails details) {
    HapticFeedback.selectionClick();
    setState(() {
      _isDragging = true;
    });
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (!_isDragging) return;

    setState(() {
      _cardPosition += details.delta;
      // Calculate rotation based on horizontal position (max 20 degrees)
      _cardRotation = (_cardPosition.dx / 1000).clamp(-0.35, 0.35);
    });
  }

  void _onPanEnd(DragEndDetails details) {
    if (!_isDragging) return;

    final screenWidth = MediaQuery.of(context).size.width;
    final threshold = screenWidth * 0.25; // 25% of screen width

    setState(() {
      _isDragging = false;
    });

    // Check if swiped far enough
    if (_cardPosition.dx.abs() > threshold) {
      final swipeRight = _cardPosition.dx > 0;

      // Animate card off screen
      final targetX = swipeRight ? screenWidth * 1.5 : -screenWidth * 1.5;
      _swipeAnimation = Tween<Offset>(
        begin: _cardPosition,
        end: Offset(targetX, _cardPosition.dy),
      ).animate(CurvedAnimation(
        parent: _swipeAnimationController,
        curve: Curves.easeOut,
      ));

      _swipeAnimationController.forward(from: 0).then((_) {
        if (swipeRight) {
          HapticFeedback.mediumImpact();
          widget.onAccept();
        } else {
          HapticFeedback.lightImpact();
          widget.onDecline();
        }
      });
    } else {
      // Snap back to center
      _swipeAnimation = Tween<Offset>(
        begin: _cardPosition,
        end: Offset.zero,
      ).animate(CurvedAnimation(
        parent: _swipeAnimationController,
        curve: Curves.elasticOut,
      ));

      _swipeAnimationController.forward(from: 0).then((_) {
        if (mounted) {
          setState(() {
            _cardPosition = Offset.zero;
            _cardRotation = 0.0;
          });
          _swipeAnimationController.reset();
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final minutes = _timeRemaining.inMinutes;
    final seconds = _timeRemaining.inSeconds % 60;

    return Container(
      decoration: const BoxDecoration(
        color: VlvtColors.background,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: VlvtColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Auto-decline timer (shows user how long they have to respond)
          if (widget.match.autoDeclineAt != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: _timeRemaining.inSeconds <= 60
                      ? VlvtColors.crimson.withValues(alpha: 0.2)
                      : VlvtColors.gold.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.timer,
                      size: 14,
                      color: _timeRemaining.inSeconds <= 60
                          ? VlvtColors.crimson
                          : VlvtColors.gold,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '$minutes:${seconds.toString().padLeft(2, '0')} to respond',
                      style: TextStyle(
                        fontFamily: 'Montserrat',
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _timeRemaining.inSeconds <= 60
                            ? VlvtColors.crimson
                            : VlvtColors.gold,
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Match card
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: GestureDetector(
                onPanStart: _onPanStart,
                onPanUpdate: _onPanUpdate,
                onPanEnd: _onPanEnd,
                child: AnimatedBuilder(
                  animation: _swipeAnimationController,
                  builder: (context, child) {
                    final position = _swipeAnimationController.isAnimating
                        ? _swipeAnimation.value
                        : _cardPosition;

                    return Transform.translate(
                      offset: position,
                      child: Transform.rotate(
                        angle: _cardRotation,
                        child: Stack(
                          children: [
                            child!,
                            // Swipe indicators
                            if (_isDragging || _swipeAnimationController.isAnimating) ...[
                              if (position.dx > 40)
                                Positioned(
                                  top: 40,
                                  left: 24,
                                  child: Transform.rotate(
                                    angle: -0.4,
                                    child: _buildSwipeLabel('CHAT', VlvtColors.success),
                                  ),
                                ),
                              if (position.dx < -40)
                                Positioned(
                                  top: 40,
                                  right: 24,
                                  child: Transform.rotate(
                                    angle: 0.4,
                                    child: _buildSwipeLabel('PASS', VlvtColors.crimson),
                                  ),
                                ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                  child: _buildMatchCard(),
                ),
              ),
            ),
          ),

          // Action buttons
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: Row(
              children: [
                Expanded(
                  child: VlvtButton.secondary(
                    label: 'Decline',
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      widget.onDecline();
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: VlvtButton.primary(
                    label: 'Chat',
                    onPressed: () {
                      HapticFeedback.mediumImpact();
                      widget.onAccept();
                    },
                  ),
                ),
              ],
            ),
          ),

          // Safe area padding
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }

  Widget _buildMatchCard() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: VlvtColors.background.withValues(alpha: 0.2),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Photo
            if (widget.match.photoUrl != null && widget.match.photoUrl!.isNotEmpty)
              CachedNetworkImage(
                imageUrl: widget.match.photoUrl!,
                fit: BoxFit.cover,
                placeholder: (context, url) => Container(
                  color: VlvtColors.surface,
                  child: const Center(child: VlvtProgressIndicator(size: 32)),
                ),
                errorWidget: (context, url, error) => Container(
                  color: VlvtColors.surface,
                  child: const Icon(Icons.person, size: 80, color: VlvtColors.textMuted),
                ),
              )
            else
              Container(
                color: VlvtColors.surface,
                child: const Icon(Icons.person, size: 80, color: VlvtColors.textMuted),
              ),

            // Gradient overlay for text readability
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                height: 200,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      VlvtColors.background.withValues(alpha: 0.8),
                    ],
                  ),
                ),
              ),
            ),

            // Profile info
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        widget.match.name,
                        style: VlvtTextStyles.h2.copyWith(
                          color: VlvtColors.textPrimary,
                          shadows: [
                            Shadow(
                              color: VlvtColors.background.withValues(alpha: 0.5),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${widget.match.age}',
                        style: VlvtTextStyles.h3.copyWith(
                          color: VlvtColors.textPrimary.withValues(alpha: 0.9),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(
                        Icons.location_on,
                        size: 14,
                        color: VlvtColors.textPrimary.withValues(alpha: 0.8),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${widget.match.distance.toStringAsFixed(1)} km away',
                        style: VlvtTextStyles.bodySmall.copyWith(
                          color: VlvtColors.textPrimary.withValues(alpha: 0.8),
                        ),
                      ),
                    ],
                  ),
                  if (widget.match.bio != null && widget.match.bio!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      widget.match.bio!,
                      style: VlvtTextStyles.bodyMedium.copyWith(
                        color: VlvtColors.textPrimary.withValues(alpha: 0.9),
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSwipeLabel(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: color, width: 3),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontFamily: 'Montserrat',
          fontSize: 24,
          fontWeight: FontWeight.bold,
          color: color,
          shadows: [
            Shadow(
              color: VlvtColors.background.withValues(alpha: 0.3),
              blurRadius: 4,
            ),
          ],
        ),
      ),
    );
  }
}
