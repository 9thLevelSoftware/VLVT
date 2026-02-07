import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../services/after_hours_profile_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../widgets/vlvt_input.dart';
import '../widgets/vlvt_loader.dart';

/// Screen for creating and editing the After Hours profile
///
/// The After Hours profile is separate from the main profile and includes:
/// - A dedicated photo (different from main profile photos)
/// - A bio describing what the user is looking for tonight
///
/// Name and age are inherited from the main profile automatically.
class AfterHoursProfileScreen extends StatefulWidget {
  const AfterHoursProfileScreen({super.key});

  @override
  State<AfterHoursProfileScreen> createState() => _AfterHoursProfileScreenState();
}

class _AfterHoursProfileScreenState extends State<AfterHoursProfileScreen> {
  final _bioController = TextEditingController();
  final _imagePicker = ImagePicker();

  bool _isLoading = true;
  bool _isSaving = false;
  bool _isUploadingPhoto = false;
  String? _currentPhotoUrl;
  File? _selectedImage;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _bioController.dispose();
    super.dispose();
  }

  /// Load existing profile data
  Future<void> _loadProfile() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final service = context.read<AfterHoursProfileService>();
      final profile = await service.getProfile();

      if (mounted) {
        setState(() {
          if (profile != null) {
            _bioController.text = profile.bio ?? '';
            _currentPhotoUrl = profile.photoUrl;
          }
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Failed to load profile. Please try again.';
        });
      }
    }
  }

  /// Pick an image from gallery or camera
  Future<void> _pickImage() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: VlvtColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Select Photo Source',
                style: VlvtTextStyles.h3,
              ),
              const SizedBox(height: 24),
              ListTile(
                leading: Icon(Icons.camera_alt, color: VlvtColors.gold),
                title: Text('Camera', style: VlvtTextStyles.bodyMedium),
                onTap: () => Navigator.pop(context, ImageSource.camera),
              ),
              ListTile(
                leading: Icon(Icons.photo_library, color: VlvtColors.gold),
                title: Text('Gallery', style: VlvtTextStyles.bodyMedium),
                onTap: () => Navigator.pop(context, ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );

    if (source == null) return;

    try {
      final pickedFile = await _imagePicker.pickImage(
        source: source,
        maxWidth: 1080,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (pickedFile != null) {
        setState(() {
          _selectedImage = File(pickedFile.path);
        });
      }
    } catch (e) {
      // debugPrint('Error picking image: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to select image'),
            backgroundColor: VlvtColors.error,
          ),
        );
      }
    }
  }

  /// Save the profile
  Future<void> _saveProfile() async {
    // Validate bio
    final bio = _bioController.text.trim();
    if (bio.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Please enter a bio'),
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

      // Upload photo first if a new one was selected
      if (_selectedImage != null) {
        setState(() {
          _isUploadingPhoto = true;
        });

        final photoUrl = await service.uploadPhoto(_selectedImage!);
        if (photoUrl != null) {
          _currentPhotoUrl = photoUrl;
          _selectedImage = null;
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Failed to upload photo'),
                backgroundColor: VlvtColors.error,
              ),
            );
          }
          // Continue anyway - photo is optional for saving
        }

        setState(() {
          _isUploadingPhoto = false;
        });
      }

      // Create or update profile
      AfterHoursProfile? result;
      if (service.profile?.id != null) {
        // Update existing profile
        result = await service.updateProfile(bio: bio);
      } else {
        // Create new profile
        result = await service.createProfile(bio: bio);
      }

      if (result != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Profile saved successfully'),
            backgroundColor: VlvtColors.success,
          ),
        );
        Navigator.of(context).pop(true); // Return true to indicate success
      } else if (mounted) {
        setState(() {
          _errorMessage = 'Failed to save profile. Please try again.';
        });
      }
    } catch (e) {
      // debugPrint('Error saving profile: $e');
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

  /// Build the photo section
  Widget _buildPhotoSection() {
    return GestureDetector(
      onTap: _isUploadingPhoto ? null : _pickImage,
      child: Container(
        width: 200,
        height: 200,
        margin: const EdgeInsets.symmetric(vertical: 24),
        decoration: BoxDecoration(
          color: VlvtColors.surface,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(
            color: VlvtColors.gold,
            width: 2,
          ),
          boxShadow: [
            BoxShadow(
              color: VlvtColors.goldGlow,
              blurRadius: 20,
              spreadRadius: 2,
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(100),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Show selected image, current photo, or placeholder
              if (_selectedImage != null)
                Image.file(
                  _selectedImage!,
                  fit: BoxFit.cover,
                )
              else if (_currentPhotoUrl != null && _currentPhotoUrl!.isNotEmpty)
                CachedNetworkImage(
                  imageUrl: _currentPhotoUrl!,
                  fit: BoxFit.cover,
                  placeholder: (context, url) => Container(
                    color: VlvtColors.surface,
                    child: Center(
                      child: VlvtProgressIndicator(size: 24),
                    ),
                  ),
                  errorWidget: (context, url, error) => _buildPhotoPlaceholder(),
                )
              else
                _buildPhotoPlaceholder(),

              // Upload indicator or edit overlay
              if (_isUploadingPhoto)
                Container(
                  color: VlvtColors.overlay,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        VlvtProgressIndicator(size: 32),
                        const SizedBox(height: 8),
                        Text(
                          'Uploading...',
                          style: VlvtTextStyles.labelSmall.copyWith(
                            color: VlvtColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          VlvtColors.background.withValues(alpha: 0.8),
                        ],
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.camera_alt,
                          color: VlvtColors.gold,
                          size: 18,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _currentPhotoUrl != null || _selectedImage != null
                              ? 'Change'
                              : 'Add Photo',
                          style: VlvtTextStyles.labelSmall.copyWith(
                            color: VlvtColors.gold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Build placeholder for no photo
  Widget _buildPhotoPlaceholder() {
    return Container(
      color: VlvtColors.surfaceElevated,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.person,
              size: 64,
              color: VlvtColors.textMuted,
            ),
            const SizedBox(height: 8),
            Text(
              'Tap to add',
              style: VlvtTextStyles.labelSmall.copyWith(
                color: VlvtColors.textMuted,
              ),
            ),
          ],
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
          'After Hours Profile',
          style: VlvtTextStyles.h3,
        ),
        leading: IconButton(
          icon: Icon(Icons.close, color: VlvtColors.textPrimary),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _saveProfile,
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
          : GestureDetector(
              onTap: () => FocusScope.of(context).unfocus(),
              behavior: HitTestBehavior.translucent,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
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
                      const SizedBox(height: 16),
                    ],

                    // Photo section
                    _buildPhotoSection(),

                    // Bio section
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'After Hours Bio',
                            style: VlvtTextStyles.labelLarge,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Describe what you\'re looking for tonight',
                            style: VlvtTextStyles.bodySmall.copyWith(
                              color: VlvtColors.textMuted,
                            ),
                          ),
                          const SizedBox(height: 12),
                          VlvtInput(
                            controller: _bioController,
                            hintText: 'Looking for someone to...',
                            maxLines: 4,
                            maxLength: 500,
                            textCapitalization: TextCapitalization.sentences,
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Info banner
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 8),
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
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'About After Hours Profiles',
                                  style: VlvtTextStyles.labelMedium.copyWith(
                                    color: VlvtColors.gold,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Your After Hours profile is separate from your main profile and is only visible during active sessions. Your name and age are automatically included from your main profile.',
                                  style: VlvtTextStyles.bodySmall.copyWith(
                                    color: VlvtColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
    );
  }
}
