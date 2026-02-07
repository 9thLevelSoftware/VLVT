import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/after_hours_profile_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../widgets/vlvt_loader.dart';
import '../widgets/vlvt_card.dart';

/// Screen for setting After Hours matching preferences
///
/// Allows users to configure:
/// - Gender preference (male, female, any)
/// - Age range (min/max)
/// - Maximum distance for matching
class AfterHoursPreferencesScreen extends StatefulWidget {
  const AfterHoursPreferencesScreen({super.key});

  @override
  State<AfterHoursPreferencesScreen> createState() =>
      _AfterHoursPreferencesScreenState();
}

class _AfterHoursPreferencesScreenState
    extends State<AfterHoursPreferencesScreen> {
  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorMessage;

  // Form state
  String? _genderSeeking;
  int _minAge = 18;
  int _maxAge = 99;
  double _maxDistanceKm = 50;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  /// Load existing preferences
  Future<void> _loadPreferences() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final service = context.read<AfterHoursProfileService>();
      final prefs = await service.getPreferences();

      if (mounted) {
        setState(() {
          if (prefs != null) {
            _genderSeeking = prefs.genderSeeking;
            _minAge = prefs.minAge ?? 18;
            _maxAge = prefs.maxAge ?? 99;
            _maxDistanceKm = prefs.maxDistanceKm ?? 50;
          }
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to load preferences. Please try again.';
        });
      }
    }
  }

  /// Save preferences
  Future<void> _savePreferences() async {
    // Validate gender seeking is selected
    if (_genderSeeking == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Please select who you want to see'),
          backgroundColor: VlvtColors.error,
        ),
      );
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final service = context.read<AfterHoursProfileService>();

      // Create or update preferences
      AfterHoursPreferences? result;
      if (service.preferences?.id != null) {
        result = await service.updatePreferences(
          genderSeeking: _genderSeeking,
          minAge: _minAge,
          maxAge: _maxAge,
          maxDistanceKm: _maxDistanceKm,
        );
      } else {
        result = await service.createPreferences(
          genderSeeking: _genderSeeking,
          minAge: _minAge,
          maxAge: _maxAge,
          maxDistanceKm: _maxDistanceKm,
        );
      }

      if (result != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Preferences saved successfully'),
            backgroundColor: VlvtColors.success,
          ),
        );
        Navigator.of(context).pop(true); // Return true to indicate success
      } else if (mounted) {
        setState(() {
          _errorMessage = 'Failed to save preferences. Please try again.';
        });
      }
    } catch (e) {
      // debugPrint('Error saving preferences: $e');
      if (mounted) {
        setState(() {
          _errorMessage = 'An error occurred. Please try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  /// Build gender selection options
  Widget _buildGenderOptions() {
    return Row(
      children: [
        _buildGenderChip('male', 'Men', Icons.male),
        const SizedBox(width: 8),
        _buildGenderChip('female', 'Women', Icons.female),
        const SizedBox(width: 8),
        _buildGenderChip('any', 'Everyone', Icons.people),
      ],
    );
  }

  /// Build individual gender chip
  Widget _buildGenderChip(String value, String label, IconData icon) {
    final isSelected = _genderSeeking == value;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() {
            _genderSeeking = value;
          });
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: isSelected
                ? VlvtColors.gold.withValues(alpha: 0.15)
                : VlvtColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? VlvtColors.gold : VlvtColors.border,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                color: isSelected ? VlvtColors.gold : VlvtColors.textSecondary,
                size: 28,
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: VlvtTextStyles.labelMedium.copyWith(
                  color:
                      isSelected ? VlvtColors.gold : VlvtColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VlvtColors.background,
      appBar: AppBar(
        backgroundColor: VlvtColors.background,
        title: Text(
          'After Hours Preferences',
          style: VlvtTextStyles.h3,
        ),
        leading: IconButton(
          icon: Icon(Icons.close, color: VlvtColors.textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _savePreferences,
            child: _isSaving
                ? const VlvtProgressIndicator(size: 20, strokeWidth: 2)
                : Text(
                    'Save',
                    style: VlvtTextStyles.labelLarge.copyWith(
                      color: VlvtColors.gold,
                    ),
                  ),
          ),
        ],
      ),
      body: _isLoading
          ? Center(child: VlvtLoader())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Error message
                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: VlvtColors.error.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: VlvtColors.error),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.error_outline, color: VlvtColors.error),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: VlvtTextStyles.bodySmall.copyWith(
                                color: VlvtColors.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Gender seeking section
                  Text(
                    'Show me',
                    style: VlvtTextStyles.labelLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Who do you want to meet tonight?',
                    style: VlvtTextStyles.bodySmall.copyWith(
                      color: VlvtColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _buildGenderOptions(),

                  const SizedBox(height: 32),
                  Divider(color: VlvtColors.divider),
                  const SizedBox(height: 24),

                  // Age range section
                  Text(
                    'Age range',
                    style: VlvtTextStyles.labelLarge,
                  ),
                  const SizedBox(height: 16),
                  VlvtSurfaceCard(
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              '$_minAge - $_maxAge years',
                              style: VlvtTextStyles.h2.copyWith(
                                color: VlvtColors.gold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        SliderTheme(
                          data: SliderThemeData(
                            activeTrackColor: VlvtColors.gold,
                            inactiveTrackColor:
                                VlvtColors.gold.withValues(alpha: 0.2),
                            thumbColor: VlvtColors.gold,
                            overlayColor: VlvtColors.gold.withValues(alpha: 0.1),
                            rangeThumbShape: const RoundRangeSliderThumbShape(
                              enabledThumbRadius: 12,
                            ),
                          ),
                          child: RangeSlider(
                            values: RangeValues(
                              _minAge.toDouble(),
                              _maxAge.toDouble(),
                            ),
                            min: 18,
                            max: 99,
                            divisions: 81,
                            labels: RangeLabels(
                              _minAge.toString(),
                              _maxAge.toString(),
                            ),
                            onChanged: (values) {
                              setState(() {
                                _minAge = values.start.round();
                                _maxAge = values.end.round();
                              });
                            },
                          ),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              '18',
                              style: VlvtTextStyles.caption,
                            ),
                            Text(
                              '99',
                              style: VlvtTextStyles.caption,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),
                  Divider(color: VlvtColors.divider),
                  const SizedBox(height: 24),

                  // Distance section
                  Text(
                    'Maximum distance',
                    style: VlvtTextStyles.labelLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'How far are you willing to travel?',
                    style: VlvtTextStyles.bodySmall.copyWith(
                      color: VlvtColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 16),
                  VlvtSurfaceCard(
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              '${_maxDistanceKm.round()} km',
                              style: VlvtTextStyles.h2.copyWith(
                                color: VlvtColors.gold,
                              ),
                            ),
                            if (_maxDistanceKm >= 100)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: VlvtColors.gold.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  'Max',
                                  style: VlvtTextStyles.labelSmall.copyWith(
                                    color: VlvtColors.gold,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        SliderTheme(
                          data: SliderThemeData(
                            activeTrackColor: VlvtColors.gold,
                            inactiveTrackColor:
                                VlvtColors.gold.withValues(alpha: 0.2),
                            thumbColor: VlvtColors.gold,
                            overlayColor: VlvtColors.gold.withValues(alpha: 0.1),
                            thumbShape: const RoundSliderThumbShape(
                              enabledThumbRadius: 12,
                            ),
                          ),
                          child: Slider(
                            value: _maxDistanceKm,
                            min: 1,
                            max: 100,
                            divisions: 99,
                            label: '${_maxDistanceKm.round()} km',
                            onChanged: (value) {
                              setState(() {
                                _maxDistanceKm = value;
                              });
                            },
                          ),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              '1 km',
                              style: VlvtTextStyles.caption,
                            ),
                            Text(
                              '100 km',
                              style: VlvtTextStyles.caption,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 32),

                  // Info banner
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: VlvtColors.gold.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: VlvtColors.gold.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline,
                          color: VlvtColors.gold,
                          size: 24,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'These preferences are separate from your main discovery settings and only apply to After Hours sessions.',
                            style: VlvtTextStyles.bodySmall.copyWith(
                              color: VlvtColors.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 32),
                ],
              ),
            ),
    );
  }
}
