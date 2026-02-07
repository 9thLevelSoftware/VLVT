import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:async';
import '../services/auth_service.dart';
import '../constants/spacing.dart';
import '../widgets/vlvt_button.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../utils/error_handler.dart';

class VerificationPendingScreen extends StatefulWidget {
  final String email;

  const VerificationPendingScreen({
    super.key,
    required this.email,
  });

  @override
  State<VerificationPendingScreen> createState() => _VerificationPendingScreenState();
}

class _VerificationPendingScreenState extends State<VerificationPendingScreen> with SingleTickerProviderStateMixin {
  bool _isResending = false;
  int _cooldownSeconds = 0;
  Timer? _cooldownTimer;
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeIn),
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );

    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  void _startCooldown() {
    setState(() {
      _cooldownSeconds = 60;
    });

    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _cooldownSeconds--;
        if (_cooldownSeconds <= 0) {
          timer.cancel();
        }
      });
    });
  }

  Future<void> _resendVerificationEmail() async {
    if (_isResending || _cooldownSeconds > 0) return;

    setState(() => _isResending = true);

    try {
      final authService = context.read<AuthService>();
      final success = await authService.resendVerificationEmail(widget.email);

      if (mounted) {
        if (success) {
          _startCooldown();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Verification email sent! Please check your inbox.'),
              backgroundColor: VlvtColors.success,
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Failed to send verification email. Please try again.'),
              backgroundColor: VlvtColors.error,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        final error = ErrorHandler.handleError(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(error.message, style: VlvtTextStyles.labelMedium),
                const SizedBox(height: 4),
                Text(error.guidance, style: VlvtTextStyles.caption),
              ],
            ),
            backgroundColor: VlvtColors.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isResending = false);
      }
    }
  }

  void _backToLogin() {
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        behavior: HitTestBehavior.translucent,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                VlvtColors.primary,
                VlvtColors.primary.withValues(alpha: 0.7),
              ],
            ),
          ),
          child: SafeArea(
            child: FadeTransition(
              opacity: _fadeAnimation,
              child: SlideTransition(
                position: _slideAnimation,
                child: Padding(
                  padding: Spacing.paddingLg,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Email icon
                      Container(
                        padding: Spacing.paddingXl,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.email_outlined,
                          size: 100,
                          color: Colors.white,
                        ),
                      ),
                      Spacing.verticalXl,
                      // "Check your email" message
                      Text(
                        'Check your email',
                        textAlign: TextAlign.center,
                        style: VlvtTextStyles.displaySmall.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Spacing.verticalMd,
                      // Email address display
                      Text(
                        'We sent a verification link to:',
                        textAlign: TextAlign.center,
                        style: VlvtTextStyles.bodyMedium.copyWith(
                          color: Colors.white.withValues(alpha: 0.9),
                        ),
                      ),
                      Spacing.verticalSm,
                      Text(
                        widget.email,
                        textAlign: TextAlign.center,
                        style: VlvtTextStyles.h4.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Spacing.verticalMd,
                      // Instructions
                      Padding(
                        padding: Spacing.horizontalPaddingXl,
                        child: Text(
                          'Click the link in your email to verify your account and complete registration.',
                          textAlign: TextAlign.center,
                          style: VlvtTextStyles.bodyMedium.copyWith(
                            color: Colors.white.withValues(alpha: 0.8),
                          ),
                        ),
                      ),
                      Spacing.verticalXxl,
                      // Resend verification email button
                      VlvtButton.primary(
                        label: _cooldownSeconds > 0
                            ? 'Resend in $_cooldownSeconds seconds'
                            : 'Resend verification email',
                        onPressed: (_cooldownSeconds > 0 || _isResending) ? null : _resendVerificationEmail,
                        loading: _isResending,
                        expanded: true,
                      ),
                      Spacing.verticalMd,
                      // Back to login link
                      VlvtButton.text(
                        label: 'Back to login',
                        onPressed: _backToLogin,
                      ),
                      Spacing.verticalXl,
                      // Additional help text
                      Padding(
                        padding: Spacing.horizontalPaddingXl,
                        child: Text(
                          'Didn\'t receive the email? Check your spam folder or try resending.',
                          textAlign: TextAlign.center,
                          style: VlvtTextStyles.caption.copyWith(
                            color: Colors.white.withValues(alpha: 0.7),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
