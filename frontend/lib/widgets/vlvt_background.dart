import 'package:flutter/material.dart';
import '../theme/vlvt_colors.dart';

/// VlvtBackground - Premium mesh gradient background
///
/// Wraps scaffold bodies to provide depth and luxury feel
/// instead of flat solid dark backgrounds.
///
/// Usage:
/// ```dart
/// Scaffold(
///   body: VlvtBackground(
///     child: YourContent(),
///   ),
/// )
/// ```
class VlvtBackground extends StatelessWidget {
  final Widget child;

  /// Use a subtle gold tint in the gradient
  final bool useGoldAccent;

  /// Center point of the radial gradient (default: top center)
  final Alignment gradientCenter;

  /// Radius of the gradient spread
  final double gradientRadius;

  const VlvtBackground({
    super.key,
    required this.child,
    this.useGoldAccent = false,
    this.gradientCenter = const Alignment(0.0, -0.3),
    this.gradientRadius = 1.5,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: gradientCenter,
          radius: gradientRadius,
          colors: useGoldAccent
              ? [
                  VlvtColors.primaryDark.withValues(alpha: 0.8),
                  VlvtColors.gold.withValues(alpha: 0.05),
                  VlvtColors.background,
                ]
              : [
                  const Color(0xFF1A1A2E), // Slightly lighter purple/black
                  const Color(0xFF0D0D15), // Mid transition
                  VlvtColors.background, // Deep onyx (#050505)
                ],
          stops: useGoldAccent
              ? const [0.0, 0.4, 1.0]
              : const [0.0, 0.5, 1.0],
        ),
      ),
      child: child,
    );
  }

  /// Factory for discovery screen with top-weighted light
  factory VlvtBackground.discovery({required Widget child}) {
    return VlvtBackground(
      gradientCenter: const Alignment(0.0, -0.5),
      gradientRadius: 1.8,
      child: child,
    );
  }

  /// Factory for profile/detail screens with center focus
  factory VlvtBackground.centered({required Widget child}) {
    return VlvtBackground(
      gradientCenter: Alignment.center,
      gradientRadius: 1.2,
      child: child,
    );
  }

  /// Factory for premium screens with gold accent
  factory VlvtBackground.premium({required Widget child}) {
    return VlvtBackground(
      useGoldAccent: true,
      gradientCenter: const Alignment(0.0, -0.2),
      gradientRadius: 1.5,
      child: child,
    );
  }
}

/// Animated version with subtle pulse effect
class VlvtAnimatedBackground extends StatefulWidget {
  final Widget child;
  final bool useGoldAccent;

  const VlvtAnimatedBackground({
    super.key,
    required this.child,
    this.useGoldAccent = false,
  });

  @override
  State<VlvtAnimatedBackground> createState() => _VlvtAnimatedBackgroundState();
}

class _VlvtAnimatedBackgroundState extends State<VlvtAnimatedBackground>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _radiusAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 8),
      vsync: this,
    )..repeat(reverse: true);

    _radiusAnimation = Tween<double>(
      begin: 1.3,
      end: 1.7,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    ));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _radiusAnimation,
      builder: (context, child) {
        return VlvtBackground(
          useGoldAccent: widget.useGoldAccent,
          gradientRadius: _radiusAnimation.value,
          child: widget.child,
        );
      },
    );
  }
}
