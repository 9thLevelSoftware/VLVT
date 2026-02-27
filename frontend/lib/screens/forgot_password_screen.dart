import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../constants/spacing.dart';
import '../widgets/vlvt_input.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_loader.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../utils/error_handler.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen>
    with SingleTickerProviderStateMixin {
  bool _isLoading = false;
  bool _emailSent = false;
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();

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
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _sendResetLink() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isLoading = true);

    try {
      final authService = context.read<AuthService>();
      final success = await authService.forgotPassword(
        _emailController.text.trim(),
      );

      if (mounted) {
        if (success) {
          setState(() {
            _emailSent = true;
            _isLoading = false;
          });
        } else {
          setState(() => _isLoading = false);
          final error = ErrorHandler.handleError('Failed to send reset email');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.message),
              backgroundColor: VlvtColors.error,
              persist: false,
              action: SnackBarAction(
                label: 'Retry',
                textColor: VlvtColors.textPrimary,
                onPressed: _sendResetLink,
              ),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
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
    }
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
                Theme.of(context).brightness == Brightness.dark
                    ? VlvtColors.primaryDark
                    : VlvtColors.primary,
                Theme.of(context).brightness == Brightness.dark
                    ? VlvtColors.primaryDark.withValues(alpha: 0.7)
                    : VlvtColors.primary.withValues(alpha: 0.7),
              ],
            ),
          ),
          child: SafeArea(
            child: FadeTransition(
              opacity: _fadeAnimation,
              child: SlideTransition(
                position: _slideAnimation,
                child: Column(
                  children: [
                    // Back button - fixed at top
                    Padding(
                      padding: const EdgeInsets.only(left: 8, top: 8),
                      child: Align(
                        alignment: Alignment.topLeft,
                        child: IconButton(
                          icon:
                              const Icon(Icons.arrow_back, color: VlvtColors.textPrimary),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ),
                    ),
                    // Scrollable content
                    Expanded(
                      child: SingleChildScrollView(
                        padding: Spacing.paddingLg,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Spacing.verticalLg,
                            // Icon
                            Container(
                              padding: Spacing.paddingXl,
                              decoration: BoxDecoration(
                                color: VlvtColors.textPrimary.withValues(alpha: 0.15),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.lock_reset,
                                size: 80,
                                color: VlvtColors.textPrimary,
                              ),
                            ),
                            Spacing.verticalXl,
                            // Title
                            Text(
                              'Forgot Password?',
                              textAlign: TextAlign.center,
                              style: VlvtTextStyles.displaySmall.copyWith(
                                color: VlvtColors.textPrimary,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Spacing.verticalMd,
                            // Description
                            Padding(
                              padding: Spacing.horizontalPaddingXl,
                              child: Text(
                                _emailSent
                                    ? 'Check your email for a password reset link'
                                    : 'Enter your email address and we\'ll send you a link to reset your password',
                                textAlign: TextAlign.center,
                                style: VlvtTextStyles.bodyMedium.copyWith(
                                  color: VlvtColors.textSecondary,
                                ),
                              ),
                            ),
                            Spacing.verticalXxl,
                            // Content based on state
                            if (_emailSent)
                              // Success message
                              Container(
                                padding: Spacing.paddingXl,
                                decoration: BoxDecoration(
                                  color: VlvtColors.textPrimary.withValues(alpha: 0.2),
                                  borderRadius: Spacing.borderRadiusLg,
                                  border: Border.all(
                                    color: VlvtColors.textPrimary.withValues(alpha: 0.3),
                                    width: 2,
                                  ),
                                ),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.check_circle_outline,
                                      size: 64,
                                      color: VlvtColors.textPrimary,
                                    ),
                                    Spacing.verticalMd,
                                    Text(
                                      'Email Sent!',
                                      style: VlvtTextStyles.h3.copyWith(
                                        color: VlvtColors.textPrimary,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Spacing.verticalSm,
                                    Text(
                                      'We\'ve sent a password reset link to:',
                                      textAlign: TextAlign.center,
                                      style: VlvtTextStyles.bodyMedium.copyWith(
                                        color: VlvtColors.textSecondary,
                                      ),
                                    ),
                                    Spacing.verticalSm,
                                    Text(
                                      _emailController.text.trim(),
                                      textAlign: TextAlign.center,
                                      style: VlvtTextStyles.bodyMedium.copyWith(
                                        color: VlvtColors.textPrimary,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Spacing.verticalMd,
                                    Text(
                                      'Please check your inbox (and spam folder) for the reset link.',
                                      textAlign: TextAlign.center,
                                      style: VlvtTextStyles.bodySmall.copyWith(
                                        color: VlvtColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              )
                            else if (_isLoading)
                              // Loading indicator
                              Center(
                                child: Container(
                                  padding: Spacing.paddingXl,
                                  decoration: BoxDecoration(
                                    color: VlvtColors.textPrimary.withValues(alpha: 0.2),
                                    borderRadius: Spacing.borderRadiusLg,
                                  ),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const VlvtProgressIndicator(),
                                      Spacing.verticalMd,
                                      Text(
                                        'Sending reset link...',
                                        style:
                                            VlvtTextStyles.bodyMedium.copyWith(
                                          color: VlvtColors.textPrimary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              )
                            else
                              // Email input form
                              Form(
                                key: _formKey,
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    // Email input
                                    VlvtInput(
                                      controller: _emailController,
                                      keyboardType: TextInputType.emailAddress,
                                      autocorrect: false,
                                      hintText: 'Email',
                                      prefixIcon: Icons.email_outlined,
                                      validator: (value) {
                                        if (value == null ||
                                            value.trim().isEmpty) {
                                          return 'Please enter your email';
                                        }
                                        if (!value.contains('@') ||
                                            !value.contains('.')) {
                                          return 'Please enter a valid email';
                                        }
                                        return null;
                                      },
                                    ),
                                    Spacing.verticalMd,
                                    // Send Reset Link button
                                    VlvtButton.primary(
                                      label: 'Send Reset Link',
                                      onPressed: _sendResetLink,
                                      expanded: true,
                                    ),
                                  ],
                                ),
                              ),
                            Spacing.verticalXxl,
                            // Back to login link
                            VlvtButton.text(
                              label: 'Back to login',
                              onPressed: () => Navigator.of(context).pop(),
                            ),
                            Spacing.verticalLg,
                          ],
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
    );
  }
}
