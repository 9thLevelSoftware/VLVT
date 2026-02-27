import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../constants/spacing.dart';
import '../services/auth_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../utils/error_handler.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_input.dart';
import '../widgets/vlvt_loader.dart';
import 'forgot_password_screen.dart';
import 'legal_document_viewer.dart';
import 'register_screen.dart';
import 'verification_pending_screen.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isLoading = false;

  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signInWithEmail() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isLoading = true);

    try {
      final authService = context.read<AuthService>();
      final result = await authService.signInWithEmail(
        _emailController.text.trim(),
        _passwordController.text,
      );

      if (mounted) {
        if (result['success'] == true) {
          // Success - navigation handled by AuthService
        } else if (result['code'] == 'EMAIL_NOT_VERIFIED') {
          // Navigate to VerificationPendingScreen
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => VerificationPendingScreen(
                email: _emailController.text.trim(),
              ),
            ),
          );
        } else {
          // Show error
          final error =
              ErrorHandler.handleError(result['error'] ?? 'Login failed');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(error.message),
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
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _signInWithApple() async {
    setState(() => _isLoading = true);

    try {
      final authService = context.read<AuthService>();
      final success = await authService.signInWithApple();

      if (!success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
                'Apple Sign-In failed. Please try again or use another method.'),
            backgroundColor: VlvtColors.error,
            duration: const Duration(seconds: 4),
            showCloseIcon: true,
            closeIconColor: VlvtColors.textPrimary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        // Check if user cancelled the sign-in
        final errorString = e.toString().toLowerCase();
        if (errorString.contains('cancel') ||
            errorString.contains('user denied')) {
          // User cancelled - no error message needed
          return;
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
                'Apple Sign-In is not available. Please use email or Google sign-in.'),
            backgroundColor: VlvtColors.error,
            duration: const Duration(seconds: 4),
            showCloseIcon: true,
            closeIconColor: VlvtColors.textPrimary,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() => _isLoading = true);

    try {
      final authService = context.read<AuthService>();
      final success = await authService.signInWithGoogle();

      if (!success && mounted) {
        final error = ErrorHandler.handleError('Failed to sign in with Google');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message),
            backgroundColor: VlvtColors.error,
            duration: const Duration(seconds: 6),
            persist: false,
            action: SnackBarAction(
              label: 'Retry',
              textColor: VlvtColors.textPrimary,
              onPressed: _signInWithGoogle,
            ),
          ),
        );
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
            duration: const Duration(seconds: 6),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      extendBody: true,
      resizeToAvoidBottomInset: true,
      backgroundColor: Colors.transparent,
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        behavior: HitTestBehavior.translucent,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Background image with blur effect (decorative)
            Positioned.fill(
              child: Semantics(
                excludeSemantics: true,
                child: ImageFiltered(
                  imageFilter: ImageFilter.blur(sigmaX: 3, sigmaY: 3),
                  child: Image.asset(
                    'assets/images/loginbackground.jpg',
                    fit: BoxFit.cover,
                    excludeFromSemantics: true,
                  ),
                ),
              ),
            ),
            // Dark overlay for better contrast (decorative)
            Positioned.fill(
              child: Semantics(
                excludeSemantics: true,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        VlvtColors.background.withValues(alpha: 0.4),
                        VlvtColors.background.withValues(alpha: 0.7),
                        const Color(0xFF1A0F2E).withValues(alpha: 0.9),
                      ],
                      stops: const [0.0, 0.5, 1.0],
                    ),
                  ),
                ),
              ),
            ),
            // Content with SafeArea
            Positioned.fill(
              child: SafeArea(
                bottom: false,
                child: SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.manual,
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Logo - larger size for better branding
                      Image.asset(
                        'assets/images/logo.png',
                        width: 340,
                        height: 340,
                        semanticLabel: 'VLVT logo',
                      ),
                      Spacing.verticalXl,
                      // Loading indicator or form
                      if (_isLoading)
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
                                const VlvtProgressIndicator(
                                  size: 40,
                                  strokeWidth: 3,
                                ),
                                Spacing.verticalMd,
                                Text(
                                  'Signing in...',
                                  style: VlvtTextStyles.bodyMedium.copyWith(
                                    color: VlvtColors.textPrimary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      else ...[
                        // Email/Password Login Form
                        Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // Email input - dark glassmorphism style
                              VlvtInput(
                                controller: _emailController,
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                autocorrect: false,
                                blur: false,
                                hintText: 'Email',
                                prefixIcon: Icons.email_outlined,
                                validator: (value) {
                                  if (value == null || value.trim().isEmpty) {
                                    return 'Please enter your email';
                                  }
                                  // RFC 5322 compliant email regex
                                  final emailRegex = RegExp(
                                    r'^[a-zA-Z0-9.!#$%&*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}[a-zA-Z0-9])?)*$',
                                  );
                                  if (!emailRegex.hasMatch(value.trim())) {
                                    return 'Please enter a valid email address';
                                  }
                                  return null;
                                },
                              ),
                              Spacing.verticalMd,
                              // Password input - dark glassmorphism style
                              VlvtInput(
                                controller: _passwordController,
                                obscureText: _obscurePassword,
                                textInputAction: TextInputAction.done,
                                autocorrect: false,
                                blur: false,
                                hintText: 'Password',
                                prefixIcon: Icons.lock_outlined,
                                suffixIcon: _obscurePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                                onSuffixTap: () {
                                  setState(() {
                                    _obscurePassword = !_obscurePassword;
                                  });
                                },
                                validator: (value) {
                                  if (value == null || value.isEmpty) {
                                    return 'Please enter your password';
                                  }
                                  if (value.length < 6) {
                                    return 'Password must be at least 6 characters';
                                  }
                                  return null;
                                },
                              ),
                              Spacing.verticalLg,
                              // Sign In button with glow effect
                              VlvtButton.primary(
                                label: 'Sign In',
                                onPressed: _signInWithEmail,
                                expanded: true,
                              ),
                              Spacing.verticalMd,
                              // Forgot password - centered under button
                              Center(
                                child: VlvtButton.text(
                                  label: 'Forgot password?',
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) =>
                                            const ForgotPasswordScreen(),
                                      ),
                                    );
                                  },
                                ),
                              ),
                              Spacing.verticalMd,
                              // Create account link - larger touch target
                              Center(
                                child: InkWell(
                                  onTap: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) =>
                                            const RegisterScreen(),
                                      ),
                                    );
                                  },
                                  borderRadius: BorderRadius.circular(8),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 12,
                                    ),
                                    child: RichText(
                                      text: TextSpan(
                                        style:
                                            VlvtTextStyles.bodyMedium.copyWith(
                                          color: VlvtColors.textSecondary,
                                        ),
                                        children: [
                                          const TextSpan(
                                              text: "Don't have an account? "),
                                          TextSpan(
                                            text: 'Get on the list',
                                            style: TextStyle(
                                              color: const Color(0xFFD4AF37),
                                              fontWeight: FontWeight.w600,
                                              decoration:
                                                  TextDecoration.underline,
                                              decorationColor:
                                                  const Color(0xFFD4AF37),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Spacing.verticalXl,
                        // Divider
                        Row(
                          children: [
                            Expanded(
                              child: Divider(
                                color: VlvtColors.textSecondary,
                                thickness: 1,
                              ),
                            ),
                            Padding(
                              padding: Spacing.horizontalPaddingMd,
                              child: Text(
                                'or continue with',
                                style: VlvtTextStyles.bodySmall.copyWith(
                                  color: VlvtColors.textSecondary,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Divider(
                                color: VlvtColors.textSecondary,
                                thickness: 1,
                              ),
                            ),
                          ],
                        ),
                        Spacing.verticalXl,
                        // OAuth buttons row - following brand guidelines
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // Google button - requires white background per guidelines
                            _buildGoogleButton(onPressed: _signInWithGoogle),
                            Spacing.horizontalLg,
                            // Apple button - white logo on dark/transparent
                            _buildOAuthIconButton(
                              onPressed: _signInWithApple,
                              assetPath: 'assets/images/apple_logo_white.png',
                              invertColor: true,
                              semanticLabel: 'Sign in with Apple',
                            ),
                          ],
                        ),
                        Spacing.verticalXl,
                        // Terms of service - separate tappable elements with 48dp touch targets
                        Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(
                              'By signing in, you agree to our ',
                              style: VlvtTextStyles.caption.copyWith(
                                color: VlvtColors.textSecondary,
                              ),
                            ),
                            SizedBox(
                              height: 48,
                              child: InkWell(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) =>
                                          const LegalDocumentViewer(
                                        documentType:
                                            LegalDocumentType.termsOfService,
                                      ),
                                    ),
                                  );
                                },
                                borderRadius: BorderRadius.circular(4),
                                child: Center(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 4),
                                    child: Text(
                                      'Terms',
                                      style: VlvtTextStyles.caption.copyWith(
                                        color: VlvtColors.textSecondary,
                                        decoration: TextDecoration.underline,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            Text(
                              ' & ',
                              style: VlvtTextStyles.caption.copyWith(
                                color: VlvtColors.textSecondary,
                              ),
                            ),
                            SizedBox(
                              height: 48,
                              child: InkWell(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) =>
                                          const LegalDocumentViewer(
                                        documentType:
                                            LegalDocumentType.privacyPolicy,
                                      ),
                                    ),
                                  );
                                },
                                borderRadius: BorderRadius.circular(4),
                                child: Center(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 4),
                                    child: Text(
                                      'Privacy Policy',
                                      style: VlvtTextStyles.caption.copyWith(
                                        color: VlvtColors.textSecondary,
                                        decoration: TextDecoration.underline,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        Spacing.verticalLg,
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Google button - requires white background with colored G logo per brand guidelines
  Widget _buildGoogleButton({required VoidCallback onPressed}) {
    return Semantics(
      label: 'Sign in with Google',
      button: true,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 2,
        shadowColor: VlvtColors.background.withValues(alpha: 0.2),
        child: InkWell(
          onTap: onPressed,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: 56,
            height: 56,
            child: Center(
              child: Image.asset(
                'assets/images/google_g_logo.png',
                width: 28,
                height: 28,
                excludeFromSemantics: true,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildOAuthIconButton({
    required VoidCallback onPressed,
    String? assetPath,
    IconData? icon,
    Color? iconColor,
    bool invertColor = false,
    String? semanticLabel,
  }) {
    return Semantics(
      label: semanticLabel ?? 'Sign in',
      button: true,
      child: Material(
        color: Colors.transparent,
        shape: CircleBorder(
          side: BorderSide(
            color: VlvtColors.textPrimary.withValues(alpha: 0.5),
            width: 1.5,
          ),
        ),
        child: InkWell(
          onTap: onPressed,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: 56,
            height: 56,
            child: Center(
              child: assetPath != null
                  ? (invertColor
                      ? ColorFiltered(
                          colorFilter: const ColorFilter.mode(
                            Colors.white,
                            BlendMode.srcIn,
                          ),
                          child: Image.asset(
                            assetPath,
                            width: 24,
                            height: 24,
                            excludeFromSemantics: true,
                          ),
                        )
                      : Image.asset(
                          assetPath,
                          width: 24,
                          height: 24,
                          excludeFromSemantics: true,
                        ))
                  : Icon(
                      icon,
                      size: 24,
                      color: iconColor ?? VlvtColors.textPrimary,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
