import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:provider/provider.dart';
import '../models/profile.dart';
import '../services/profile_api_service.dart';
import '../services/safety_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_loader.dart';
import '../widgets/verified_badge.dart';

/// Screen for viewing another user's profile in detail
class ProfileDetailScreen extends StatefulWidget {
  final Profile profile;
  final bool showLikeAction;
  final VoidCallback? onLike;

  const ProfileDetailScreen({
    super.key,
    required this.profile,
    this.showLikeAction = false,
    this.onLike,
  });

  @override
  State<ProfileDetailScreen> createState() => _ProfileDetailScreenState();
}

class _ProfileDetailScreenState extends State<ProfileDetailScreen> {
  late PageController _pageController;
  int _currentPhotoIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _handleMenuAction(BuildContext context, String action) async {
    final safetyService = context.read<SafetyService>();
    final scaffoldMessenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    switch (action) {
      case 'block':
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Block User'),
            content: const Text(
              'Are you sure you want to block this user? They won\'t be able to see your profile or message you.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: Text('Block', style: TextStyle(color: VlvtColors.error)),
              ),
            ],
          ),
        );
        if (confirmed == true && mounted) {
          try {
            await safetyService.blockUser(widget.profile.userId);
            if (mounted) {
              scaffoldMessenger.showSnackBar(
                const SnackBar(content: Text('User blocked')),
              );
              navigator.pop();
            }
          } catch (e) {
            if (mounted) {
              scaffoldMessenger.showSnackBar(
                const SnackBar(content: Text('Failed to block user')),
              );
            }
          }
        }
        break;
      case 'report':
        _showReportDialog(context, safetyService);
        break;
    }
  }

  void _showReportDialog(BuildContext context, SafetyService safetyService) {
    String? selectedReason;
    final detailsController = TextEditingController();
    final scaffoldMessenger = ScaffoldMessenger.of(context);

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Report User'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: 'Reason'),
              items: const [
                DropdownMenuItem(value: 'inappropriate', child: Text('Inappropriate content')),
                DropdownMenuItem(value: 'harassment', child: Text('Harassment')),
                DropdownMenuItem(value: 'spam', child: Text('Spam')),
                DropdownMenuItem(value: 'fake', child: Text('Fake profile')),
                DropdownMenuItem(value: 'other', child: Text('Other')),
              ],
              onChanged: (value) => selectedReason = value,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: detailsController,
              decoration: const InputDecoration(labelText: 'Details (optional)'),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              if (selectedReason != null) {
                Navigator.pop(dialogContext);
                try {
                  await safetyService.reportUser(
                    reportedUserId: widget.profile.userId,
                    reason: selectedReason!,
                    details: detailsController.text.isEmpty ? null : detailsController.text,
                  );
                  if (mounted) {
                    scaffoldMessenger.showSnackBar(
                      const SnackBar(content: Text('Report submitted')),
                    );
                  }
                } catch (e) {
                  if (mounted) {
                    scaffoldMessenger.showSnackBar(
                      const SnackBar(content: Text('Failed to submit report')),
                    );
                  }
                }
              } else {
                scaffoldMessenger.showSnackBar(
                  const SnackBar(content: Text('Please select a reason')),
                );
              }
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    ).then((_) => detailsController.dispose());
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.profile;
    final photos = profile.photos ?? [];
    final hasPhotos = photos.isNotEmpty;

    return Scaffold(
      backgroundColor: VlvtColors.background,
      body: CustomScrollView(
        slivers: [
          // Photo carousel with app bar
          SliverAppBar(
            expandedHeight: MediaQuery.of(context).size.height * 0.55,
            pinned: true,
            stretch: true,
            backgroundColor: VlvtColors.background,
            leading: IconButton(
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: VlvtColors.background.withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.arrow_back, color: VlvtColors.textPrimary),
              ),
              onPressed: () => Navigator.of(context).pop(),
            ),
            actions: [
              PopupMenuButton<String>(
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: VlvtColors.background.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.more_vert, color: VlvtColors.textPrimary),
                ),
                onSelected: (value) => _handleMenuAction(context, value),
                itemBuilder: (context) => [
                  const PopupMenuItem(value: 'block', child: Text('Block User')),
                  const PopupMenuItem(value: 'report', child: Text('Report User')),
                ],
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: hasPhotos
                  ? Stack(
                      fit: StackFit.expand,
                      children: [
                        PageView.builder(
                          controller: _pageController,
                          itemCount: photos.length,
                          onPageChanged: (index) {
                            setState(() {
                              _currentPhotoIndex = index;
                            });
                          },
                          itemBuilder: (context, index) {
                            final photoUrl = photos[index];
                            return CachedNetworkImage(
                              imageUrl: photoUrl.startsWith('http')
                                  ? photoUrl
                                  : '${context.read<ProfileApiService>().baseUrl}$photoUrl',
                              fit: BoxFit.cover,
                              placeholder: (context, url) => Container(
                                color: VlvtColors.surfaceElevated,
                                child: Center(
                                  child: AnimatedOpacity(
                                    opacity: 1.0,
                                    duration: const Duration(milliseconds: 300),
                                    child: const VlvtProgressIndicator(size: 24),
                                  ),
                                ),
                              ),
                              errorWidget: (context, url, error) => Container(
                                color: VlvtColors.surfaceElevated,
                                child: Icon(Icons.person, size: 80, color: VlvtColors.textMuted),
                              ),
                            );
                          },
                        ),
                        // Photo indicators
                        if (photos.length > 1)
                          Positioned(
                            top: MediaQuery.of(context).padding.top + 50,
                            left: 0,
                            right: 0,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: List.generate(photos.length, (index) {
                                return Container(
                                  margin: const EdgeInsets.symmetric(horizontal: 3),
                                  width: (MediaQuery.of(context).size.width - 32) / photos.length - 6,
                                  height: 3,
                                  decoration: BoxDecoration(
                                    color: index == _currentPhotoIndex
                                        ? VlvtColors.textPrimary
                                        : VlvtColors.textPrimary.withValues(alpha: 0.4),
                                    borderRadius: BorderRadius.circular(2),
                                  ),
                                );
                              }),
                            ),
                          ),
                        // Gradient overlay at bottom
                        Positioned(
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: 120,
                          child: Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.bottomCenter,
                                end: Alignment.topCenter,
                                colors: [
                                  VlvtColors.background.withValues(alpha: 0.8),
                                  VlvtColors.background.withValues(alpha: 0.0),
                                ],
                              ),
                            ),
                          ),
                        ),
                        // Name and age
                        Positioned(
                          bottom: 16,
                          left: 16,
                          right: 16,
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(
                                          '${profile.name ?? "User"}, ${profile.age ?? "?"}',
                                          style: TextStyle(
                                            color: VlvtColors.textPrimary,
                                            fontSize: 28,
                                            fontWeight: FontWeight.bold,
                                            fontFamily: 'Montserrat',
                                          ),
                                        ),
                                        if (profile.isVerified == true) ...[
                                          const SizedBox(width: 8),
                                          const VerifiedBadge(size: 24),
                                        ],
                                      ],
                                    ),
                                    if (profile.distance != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Row(
                                          children: [
                                            Icon(
                                              Icons.near_me,
                                              color: VlvtColors.textPrimary.withValues(alpha: 0.8),
                                              size: 16,
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              '${profile.distance!.toStringAsFixed(1)} km away',
                                              style: TextStyle(
                                                color: VlvtColors.textPrimary.withValues(alpha: 0.8),
                                                fontSize: 14,
                                                fontFamily: 'Montserrat',
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    )
                  : Container(
                      color: VlvtColors.surfaceElevated,
                      child: Center(
                        child: Icon(Icons.person, size: 100, color: VlvtColors.textMuted),
                      ),
                    ),
            ),
          ),

          // Profile details
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Bio
                  if (profile.bio != null && profile.bio!.isNotEmpty) ...[
                    Text(
                      'About',
                      style: VlvtTextStyles.h3.copyWith(color: VlvtColors.gold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      profile.bio!,
                      style: VlvtTextStyles.bodyMedium.copyWith(
                        color: VlvtColors.textPrimary,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Interests
                  if (profile.interests != null && profile.interests!.isNotEmpty) ...[
                    Text(
                      'Interests',
                      style: VlvtTextStyles.h3.copyWith(color: VlvtColors.gold),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: profile.interests!.map((interest) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: VlvtColors.surface,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: VlvtColors.border),
                          ),
                          child: Text(
                            interest,
                            style: VlvtTextStyles.labelMedium.copyWith(
                              color: VlvtColors.textPrimary,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Like action button
                  if (widget.showLikeAction && widget.onLike != null) ...[
                    const SizedBox(height: 16),
                    VlvtButton.primary(
                      label: 'Like Back',
                      icon: Icons.favorite,
                      onPressed: () {
                        HapticFeedback.mediumImpact();
                        widget.onLike!();
                        Navigator.of(context).pop(true);
                      },
                      expanded: true,
                    ),
                  ],

                  // Bottom padding for safe area
                  SizedBox(height: MediaQuery.of(context).padding.bottom + 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
