import 'package:flutter/material.dart';

/// Slide-from-right page transition for forward navigation.
/// Uses easeOutCubic curve to match the app's design language.
class VlvtPageRoute<T> extends PageRouteBuilder<T> {
  VlvtPageRoute({
    required Widget Function(BuildContext) builder,
    super.settings,
    super.fullscreenDialog,
    super.maintainState = true,
  }) : super(
          pageBuilder: (context, animation, secondaryAnimation) =>
              builder(context),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(1.0, 0.0),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutCubic,
              )),
              child: child,
            );
          },
        );
}

/// Crossfade transition for modal and overlay screens
/// (paywall, legal documents, filters, after-hours overlays).
class VlvtFadeRoute<T> extends PageRouteBuilder<T> {
  VlvtFadeRoute({
    required Widget Function(BuildContext) builder,
    super.settings,
    super.fullscreenDialog,
    super.maintainState = true,
  }) : super(
          pageBuilder: (context, animation, secondaryAnimation) =>
              builder(context),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
        );
}
