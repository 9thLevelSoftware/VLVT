import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../theme/vlvt_decorations.dart';

/// Button variants for the VLVT design system.
enum VlvtButtonVariant {
  /// Gold gradient background - primary actions
  primary,

  /// Transparent with gold outline - secondary actions
  secondary,

  /// Crimson background - danger/destructive actions
  danger,

  /// Transparent with no outline - text-only actions
  text,
}

/// Button sizes for the VLVT design system.
enum VlvtButtonSize {
  small,
  medium,
  large,
}

/// A styled button for the VLVT design system.
///
/// Features gold gradients, haptic feedback, and glow effects.
class VlvtButton extends StatefulWidget {
  /// The button text.
  final String label;

  /// Called when the button is pressed.
  final VoidCallback? onPressed;

  /// The button variant (primary, secondary, danger, text).
  final VlvtButtonVariant variant;

  /// The button size.
  final VlvtButtonSize size;

  /// Optional icon to show before the label.
  final IconData? icon;

  /// Whether the button should expand to fill available width.
  final bool expanded;

  /// Whether the button is in a loading state.
  final bool loading;

  /// Whether to enable haptic feedback on tap.
  final bool haptics;

  const VlvtButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = VlvtButtonVariant.primary,
    this.size = VlvtButtonSize.medium,
    this.icon,
    this.expanded = false,
    this.loading = false,
    this.haptics = true,
  });

  /// Creates a primary (gold gradient) button.
  const VlvtButton.primary({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.expanded = false,
    this.loading = false,
    this.haptics = true,
  })  : variant = VlvtButtonVariant.primary,
        size = VlvtButtonSize.medium;

  /// Creates a secondary (outline) button.
  const VlvtButton.secondary({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.expanded = false,
    this.loading = false,
    this.haptics = true,
  })  : variant = VlvtButtonVariant.secondary,
        size = VlvtButtonSize.medium;

  /// Creates a danger (crimson) button.
  const VlvtButton.danger({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.expanded = false,
    this.loading = false,
    this.haptics = true,
  })  : variant = VlvtButtonVariant.danger,
        size = VlvtButtonSize.medium;

  /// Creates a text button.
  const VlvtButton.text({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.expanded = false,
    this.loading = false,
    this.haptics = false,
  })  : variant = VlvtButtonVariant.text,
        size = VlvtButtonSize.medium;

  @override
  State<VlvtButton> createState() => _VlvtButtonState();
}

class _VlvtButtonState extends State<VlvtButton> {
  bool _isPressed = false;

  EdgeInsets get _padding {
    switch (widget.size) {
      case VlvtButtonSize.small:
        return const EdgeInsets.symmetric(horizontal: 16, vertical: 8);
      case VlvtButtonSize.medium:
        return const EdgeInsets.symmetric(horizontal: 24, vertical: 14);
      case VlvtButtonSize.large:
        return const EdgeInsets.symmetric(horizontal: 32, vertical: 18);
    }
  }

  TextStyle get _textStyle {
    switch (widget.size) {
      case VlvtButtonSize.small:
        return VlvtTextStyles.labelSmall;
      case VlvtButtonSize.medium:
        return VlvtTextStyles.button;
      case VlvtButtonSize.large:
        return VlvtTextStyles.labelLarge;
    }
  }

  double get _iconSize {
    switch (widget.size) {
      case VlvtButtonSize.small:
        return 16;
      case VlvtButtonSize.medium:
        return 20;
      case VlvtButtonSize.large:
        return 24;
    }
  }

  Color get _textColor {
    if (widget.onPressed == null) {
      return VlvtColors.textMuted;
    }
    switch (widget.variant) {
      case VlvtButtonVariant.primary:
        return VlvtColors.textOnGold;
      case VlvtButtonVariant.secondary:
      case VlvtButtonVariant.text:
        return VlvtColors.gold;
      case VlvtButtonVariant.danger:
        return Colors.white;
    }
  }

  BoxDecoration? get _decoration {
    final disabled = widget.onPressed == null;

    switch (widget.variant) {
      case VlvtButtonVariant.primary:
        if (disabled) {
          return BoxDecoration(
            color: VlvtColors.surface,
            borderRadius: VlvtDecorations.borderRadiusMd,
          );
        }
        return BoxDecoration(
          gradient: _isPressed ? null : VlvtColors.goldGradient45,
          color: _isPressed ? VlvtColors.goldDark : null,
          borderRadius: VlvtDecorations.borderRadiusMd,
          boxShadow: _isPressed ? null : [VlvtDecorations.goldGlowSoft],
        );

      case VlvtButtonVariant.secondary:
        return BoxDecoration(
          color: _isPressed
              ? VlvtColors.gold.withValues(alpha: 0.1)
              : Colors.transparent,
          borderRadius: VlvtDecorations.borderRadiusMd,
          border: Border.all(
            color: disabled ? VlvtColors.textMuted : VlvtColors.gold,
            width: 1.5,
          ),
        );

      case VlvtButtonVariant.danger:
        return BoxDecoration(
          color: _isPressed ? VlvtColors.crimsonLight : VlvtColors.crimson,
          borderRadius: VlvtDecorations.borderRadiusMd,
        );

      case VlvtButtonVariant.text:
        return null;
    }
  }

  void _handleTapDown(TapDownDetails details) {
    setState(() => _isPressed = true);
  }

  void _handleTapUp(TapUpDetails details) {
    setState(() => _isPressed = false);
  }

  void _handleTapCancel() {
    setState(() => _isPressed = false);
  }

  void _handleTap() {
    if (widget.haptics && widget.variant != VlvtButtonVariant.text) {
      HapticFeedback.lightImpact();
    }
    widget.onPressed?.call();
  }

  @override
  Widget build(BuildContext context) {
    final content = Row(
      mainAxisSize: widget.expanded ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (widget.loading) ...[
          SizedBox(
            width: _iconSize,
            height: _iconSize,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: _textColor,
            ),
          ),
          const SizedBox(width: 8),
        ] else if (widget.icon != null) ...[
          Icon(
            widget.icon,
            size: _iconSize,
            color: _textColor,
          ),
          const SizedBox(width: 8),
        ],
        Flexible(
          child: Text(
            widget.label,
            style: _textStyle.copyWith(color: _textColor),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
        ),
      ],
    );

    final button = Semantics(
      label: widget.label,
      button: true,
      enabled: widget.onPressed != null && !widget.loading,
      child: GestureDetector(
        onTapDown: widget.onPressed != null ? _handleTapDown : null,
        onTapUp: widget.onPressed != null ? _handleTapUp : null,
        onTapCancel: widget.onPressed != null ? _handleTapCancel : null,
        onTap: widget.onPressed != null && !widget.loading ? _handleTap : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 100),
          padding: _padding,
          decoration: _decoration,
          child: content,
        ),
      ),
    );

    if (widget.expanded) {
      return SizedBox(
        width: double.infinity,
        child: button,
      );
    }

    return button;
  }
}

/// An icon-only button for the VLVT design system.
class VlvtIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;
  final Color? color;
  final double size;
  final bool outlined;

  const VlvtIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.color,
    this.size = 24,
    this.outlined = false,
  });

  @override
  Widget build(BuildContext context) {
    final iconColor = color ?? VlvtColors.gold;

    if (outlined) {
      return Semantics(
        button: true,
        enabled: onPressed != null,
        child: GestureDetector(
          onTap: onPressed,
          child: Container(
            width: size + 20,
            height: size + 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: iconColor.withValues(alpha: 0.5),
                width: 1.5,
              ),
            ),
            child: Icon(
              icon,
              size: size,
              color: iconColor,
            ),
          ),
        ),
      );
    }

    return Semantics(
      button: true,
      enabled: onPressed != null,
      child: IconButton(
        onPressed: onPressed,
        icon: Icon(icon),
        iconSize: size,
        color: iconColor,
      ),
    );
  }
}
