import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../services/deep_link_service.dart';
import '../services/tickets_service.dart';
import '../constants/spacing.dart';
import '../widgets/vlvt_input.dart';
import '../widgets/vlvt_button.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../utils/error_handler.dart';
import '../widgets/vlvt_loader.dart';
import 'verification_pending_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _inviteCodeController = TextEditingController();
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _isLoading = false;
  bool _inviteCodeValid = false;
  String? _inviteCodeError;

  @override
  void initState() {
    super.initState();
    // Pre-populate invite code from deep link if available
    if (DeepLinkService.pendingInviteCode != null) {
      _inviteCodeController.text = DeepLinkService.pendingInviteCode!;
      _validateInviteCode();
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _inviteCodeController.dispose();
    super.dispose();
  }

  Future<void> _validateInviteCode() async {
    final code = _inviteCodeController.text.trim();
    if (code.isEmpty) {
      setState(() {
        _inviteCodeValid = false;
        _inviteCodeError = null;
      });
      return;
    }

    final ticketsService = context.read<TicketsService>();
    final result = await ticketsService.validateInviteCode(code);

    if (mounted) {
      setState(() {
        if (result['success'] == true && result['valid'] == true) {
          _inviteCodeValid = true;
          _inviteCodeError = null;
        } else {
          _inviteCodeValid = false;
          _inviteCodeError = result['error'] ?? 'Invalid invite code';
        }
      });
    }
  }

  bool _validatePassword(String password) {
    // Must be at least 12 characters
    if (password.length < 12) return false;

    // Must contain at least one letter
    if (!password.contains(RegExp(r'[a-zA-Z]'))) return false;

    // Must contain at least one number
    if (!password.contains(RegExp(r'[0-9]'))) return false;

    // Must contain at least one special character
    if (!password.contains(RegExp(r'[!@#$%^&*(),.?":{}|<>]'))) return false;

    return true;
  }

  String _getPasswordRequirements(String password) {
    final requirements = <String>[];

    if (password.length < 12) {
      requirements.add('At least 12 characters');
    }
    if (!password.contains(RegExp(r'[a-zA-Z]'))) {
      requirements.add('At least one letter');
    }
    if (!password.contains(RegExp(r'[0-9]'))) {
      requirements.add('At least one number');
    }
    if (!password.contains(RegExp(r'[!@#$%^&*(),.?":{}|<>]'))) {
      requirements.add('At least one special character (!@#\$%^&* etc.)');
    }

    if (requirements.isEmpty) {
      return 'Password meets all requirements';
    }

    return 'Required: ${requirements.join(', ')}';
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isLoading = true);

    try {
      final authService = context.read<AuthService>();
      final inviteCode = _inviteCodeController.text.trim();
      final result = await authService.registerWithEmail(
        _emailController.text.trim(),
        _passwordController.text,
        inviteCode: inviteCode.isNotEmpty ? inviteCode : null,
      );

      // Clear pending invite code after registration attempt
      DeepLinkService.clearPendingInviteCode();

      if (mounted) {
        if (result['success'] == true) {
          // Navigate to VerificationPendingScreen
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => VerificationPendingScreen(
                email: _emailController.text.trim(),
              ),
            ),
          );
        } else {
          // Show error
          final error = ErrorHandler.handleError(result['error'] ?? 'Registration failed');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(error.message, style: VlvtTextStyles.labelMedium),
                  if (result['details'] != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      result['details'].toString(),
                      style: VlvtTextStyles.caption,
                    ),
                  ],
                ],
              ),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      extendBody: true,
      backgroundColor: Colors.transparent,
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        behavior: HitTestBehavior.translucent,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Background image with blur effect (matching AuthScreen)
            Positioned.fill(
              child: ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 3, sigmaY: 3),
                child: Image.asset(
                  'assets/images/loginbackground.jpg',
                  fit: BoxFit.cover,
                ),
              ),
            ),
            // Dark overlay for better contrast
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.4),
                      Colors.black.withValues(alpha: 0.7),
                      const Color(0xFF1A0F2E).withValues(alpha: 0.9),
                    ],
                    stops: const [0.0, 0.5, 1.0],
                  ),
                ),
              ),
            ),
            // Content
            Positioned.fill(
              child: SafeArea(
                bottom: false,
                child: SingleChildScrollView(
                  padding: Spacing.paddingLg,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Back button
                      Align(
                        alignment: Alignment.topLeft,
                        child: IconButton(
                          icon: const Icon(Icons.arrow_back, color: Colors.white),
                          onPressed: () => Navigator.pop(context),
                          tooltip: 'Go back to sign in',
                        ),
                      ),
                      Spacing.verticalXl,
                      // Title
                      Text(
                        'Create Account',
                        textAlign: TextAlign.center,
                        style: VlvtTextStyles.displaySmall.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Spacing.verticalMd,
                      Text(
                        'Join VLVT and start making meaningful connections',
                        textAlign: TextAlign.center,
                        style: VlvtTextStyles.bodyMedium.copyWith(
                          color: Colors.white.withValues(alpha: 0.9),
                        ),
                      ),
                      Spacing.verticalXl,
                  // Loading indicator or form
                  if (_isLoading)
                    Center(
                      child: Container(
                        padding: Spacing.paddingXl,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
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
                              'Creating your account...',
                              style: VlvtTextStyles.bodyMedium.copyWith(
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    Form(
                      key: _formKey,
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Email input
                          VlvtInput(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            autocorrect: false,
                            hintText: 'Email',
                            prefixIcon: Icons.email_outlined,
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Please enter your email';
                              }
                              if (!value.contains('@') || !value.contains('.')) {
                                return 'Please enter a valid email';
                              }
                              return null;
                            },
                          ),
                          Spacing.verticalMd,
                          // Password input
                          VlvtInput(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            autocorrect: false,
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
                            onChanged: (value) {
                              // Trigger rebuild to update password requirements display
                              setState(() {});
                            },
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter a password';
                              }
                              if (!_validatePassword(value)) {
                                return 'Password does not meet requirements';
                              }
                              return null;
                            },
                          ),
                          // Password requirements display
                          if (_passwordController.text.isNotEmpty) ...[
                            Spacing.verticalSm,
                            Container(
                              padding: Spacing.paddingMd,
                              decoration: BoxDecoration(
                                color: _validatePassword(_passwordController.text)
                                    ? Colors.green.withValues(alpha: 0.2)
                                    : Colors.white.withValues(alpha: 0.15),
                                borderRadius: Spacing.borderRadiusMd,
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    _validatePassword(_passwordController.text)
                                        ? Icons.check_circle
                                        : Icons.info_outline,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _getPasswordRequirements(_passwordController.text),
                                      style: VlvtTextStyles.caption.copyWith(
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          Spacing.verticalMd,
                          // Confirm password input
                          VlvtInput(
                            controller: _confirmPasswordController,
                            obscureText: _obscureConfirmPassword,
                            autocorrect: false,
                            hintText: 'Confirm Password',
                            prefixIcon: Icons.lock_outlined,
                            suffixIcon: _obscureConfirmPassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            onSuffixTap: () {
                              setState(() {
                                _obscureConfirmPassword = !_obscureConfirmPassword;
                              });
                            },
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please confirm your password';
                              }
                              if (value != _passwordController.text) {
                                return 'Passwords do not match';
                              }
                              return null;
                            },
                          ),
                          Spacing.verticalMd,
                          // Invite code input (optional)
                          VlvtInput(
                            controller: _inviteCodeController,
                            autocorrect: false,
                            hintText: 'Invite Code (optional)',
                            prefixIcon: Icons.confirmation_number_outlined,
                            suffixIcon: _inviteCodeValid
                                ? Icons.check_circle
                                : (_inviteCodeError != null ? Icons.error : null),
                            onChanged: (value) {
                              // Debounce validation
                              Future.delayed(const Duration(milliseconds: 500), () {
                                if (_inviteCodeController.text == value) {
                                  _validateInviteCode();
                                }
                              });
                            },
                          ),
                          // Invite code status display
                          if (_inviteCodeController.text.isNotEmpty) ...[
                            Spacing.verticalSm,
                            Container(
                              padding: Spacing.paddingMd,
                              decoration: BoxDecoration(
                                color: _inviteCodeValid
                                    ? Colors.green.withValues(alpha: 0.2)
                                    : (_inviteCodeError != null
                                        ? Colors.red.withValues(alpha: 0.2)
                                        : Colors.white.withValues(alpha: 0.15)),
                                borderRadius: Spacing.borderRadiusMd,
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    _inviteCodeValid
                                        ? Icons.check_circle
                                        : (_inviteCodeError != null
                                            ? Icons.error
                                            : Icons.hourglass_empty),
                                    color: Colors.white,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _inviteCodeValid
                                          ? 'Valid invite code!'
                                          : (_inviteCodeError ?? 'Validating...'),
                                      style: VlvtTextStyles.caption.copyWith(
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          Spacing.verticalXl,
                          // Register button
                          VlvtButton.primary(
                            label: 'Create Account',
                            onPressed: _register,
                            expanded: true,
                          ),
                          Spacing.verticalMd,
                          // Sign in link - larger touch target
                          Center(
                            child: InkWell(
                              onTap: () => Navigator.pop(context),
                              borderRadius: BorderRadius.circular(8),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'Already have an account? ',
                                      style: VlvtTextStyles.bodyMedium.copyWith(
                                        color: Colors.white.withValues(alpha: 0.8),
                                      ),
                                    ),
                                    Text(
                                      'Sign in',
                                      style: VlvtTextStyles.bodyMedium.copyWith(
                                        color: VlvtColors.gold,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          Spacing.verticalXl,
                        ],
                      ),
                    ),
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
}
