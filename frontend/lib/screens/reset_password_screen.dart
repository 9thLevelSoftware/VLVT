import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../constants/spacing.dart';
import '../widgets/vlvt_input.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_loader.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';

class ResetPasswordScreen extends StatefulWidget {
  final String token;

  const ResetPasswordScreen({
    super.key,
    required this.token,
  });

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _isLoading = false;
  bool _resetSuccessful = false;
  String? _errorMessage;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
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

  Future<void> _resetPassword() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final authService = context.read<AuthService>();
      final result = await authService.resetPassword(
        widget.token,
        _passwordController.text,
      );

      if (mounted) {
        if (result['success'] == true) {
          setState(() {
            _resetSuccessful = true;
            _isLoading = false;
          });
        } else {
          setState(() {
            _errorMessage = result['message'] ?? 'Failed to reset password';
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'An error occurred. Please try again.';
          _isLoading = false;
        });
      }
    }
  }

  void _backToLogin() {
    // Pop back to the login screen
    Navigator.of(context).popUntil((route) => route.isFirst);
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
            child: SingleChildScrollView(
              padding: Spacing.paddingLg,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: MediaQuery.of(context).size.height -
                      MediaQuery.of(context).padding.top -
                      MediaQuery.of(context).padding.bottom -
                      48, // Account for padding
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Title
                  Text(
                    _resetSuccessful ? 'Password Reset!' : 'Reset Password',
                    textAlign: TextAlign.center,
                    style: VlvtTextStyles.displaySmall.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Spacing.verticalMd,
                  Text(
                    _resetSuccessful
                        ? 'Your password has been successfully reset. You can now sign in with your new password.'
                        : 'Enter your new password below',
                    textAlign: TextAlign.center,
                    style: VlvtTextStyles.bodyMedium.copyWith(
                      color: Colors.white.withValues(alpha: 0.9),
                    ),
                  ),
                  Spacing.verticalXl,
                  // Success state
                  if (_resetSuccessful)
                    Column(
                      children: [
                        Container(
                          padding: Spacing.paddingXl,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: Spacing.borderRadiusLg,
                          ),
                          child: Icon(
                            Icons.check_circle,
                            color: Colors.white,
                            size: 64,
                          ),
                        ),
                        Spacing.verticalXl,
                        VlvtButton.primary(
                          label: 'Back to Login',
                          onPressed: _backToLogin,
                          expanded: true,
                        ),
                      ],
                    )
                  // Loading state
                  else if (_isLoading)
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
                            const VlvtProgressIndicator(),
                            Spacing.verticalMd,
                            Text(
                              'Resetting your password...',
                              style: VlvtTextStyles.bodyMedium.copyWith(
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  // Form state
                  else
                    Form(
                      key: _formKey,
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Error message
                          if (_errorMessage != null) ...[
                            Container(
                              padding: Spacing.paddingMd,
                              decoration: BoxDecoration(
                                color: Colors.red.withValues(alpha: 0.2),
                                borderRadius: Spacing.borderRadiusMd,
                              ),
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.error_outline,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _errorMessage!,
                                      style: VlvtTextStyles.bodySmall.copyWith(
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Spacing.verticalMd,
                          ],
                          // Password input
                          VlvtInput(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            autocorrect: false,
                            hintText: 'New Password',
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
                          Spacing.verticalXl,
                          // Reset password button
                          VlvtButton.primary(
                            label: 'Reset Password',
                            onPressed: _resetPassword,
                            expanded: true,
                          ),
                          Spacing.verticalMd,
                          // Back to login link
                          Center(
                            child: VlvtButton.text(
                              label: 'Back to Login',
                              onPressed: _backToLogin,
                            ),
                          ),
                        ],
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
