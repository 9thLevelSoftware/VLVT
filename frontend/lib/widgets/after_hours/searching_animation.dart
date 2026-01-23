/// Searching Animation Widget
/// Shows pulsing radar-style animation while searching for matches
library;

import 'package:flutter/material.dart';
import '../../theme/vlvt_colors.dart';
import '../../theme/vlvt_text_styles.dart';

/// An animated searching indicator for After Hours mode.
///
/// Displays a pulsing radar-style animation with:
/// - Expanding/fading rings
/// - Central nightlife icon
/// - Nearby user count
class SearchingAnimation extends StatefulWidget {
  /// The number of nearby users currently active.
  final int nearbyCount;

  const SearchingAnimation({
    super.key,
    required this.nearbyCount,
  });

  @override
  State<SearchingAnimation> createState() => _SearchingAnimationState();
}

class _SearchingAnimationState extends State<SearchingAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat();

    _scaleAnimation = Tween<double>(begin: 0.5, end: 1.5).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    _opacityAnimation = Tween<double>(begin: 0.8, end: 0.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 200,
          height: 200,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Pulsing rings
              AnimatedBuilder(
                animation: _controller,
                builder: (context, child) {
                  return Transform.scale(
                    scale: _scaleAnimation.value,
                    child: Opacity(
                      opacity: _opacityAnimation.value,
                      child: Container(
                        width: 150,
                        height: 150,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: VlvtColors.gold,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
              // Second ring with offset timing
              AnimatedBuilder(
                animation: _controller,
                builder: (context, child) {
                  // Offset the second ring by half a cycle
                  final offsetValue = (_controller.value + 0.5) % 1.0;
                  final scale = 0.5 + (offsetValue * 1.0); // 0.5 to 1.5
                  final opacity = 0.8 * (1.0 - offsetValue);

                  return Transform.scale(
                    scale: scale,
                    child: Opacity(
                      opacity: opacity,
                      child: Container(
                        width: 150,
                        height: 150,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: VlvtColors.gold,
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
              // Center icon
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: VlvtColors.gold.withValues(alpha: 0.2),
                ),
                child: const Icon(
                  Icons.nightlife,
                  size: 40,
                  color: VlvtColors.gold,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Searching nearby...',
          style: VlvtTextStyles.h3,
        ),
        const SizedBox(height: 8),
        Text(
          '${widget.nearbyCount} ${widget.nearbyCount == 1 ? 'person' : 'people'} nearby',
          style: VlvtTextStyles.bodyMedium.copyWith(
            color: VlvtColors.textSecondary,
          ),
        ),
      ],
    );
  }
}
