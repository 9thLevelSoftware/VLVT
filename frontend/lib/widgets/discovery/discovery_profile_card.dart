import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/profile.dart';
import '../../services/profile_api_service.dart';
import '../../services/location_service.dart';
import '../../theme/vlvt_colors.dart';
import '../../theme/vlvt_text_styles.dart';
import '../verified_badge.dart';
import '../vlvt_loader.dart';

/// A full-bleed photo card with overlaid profile info for the discovery screen.
/// Tapping opens ProfileDetailScreen for the full profile view.
class DiscoveryProfileCard extends StatelessWidget {
  final Profile profile;
  final int currentPhotoIndex;
  final PageController? photoPageController;
  final Alignment parallaxAlignment;
  final ValueChanged<int>? onPhotoChanged;

  const DiscoveryProfileCard({
    super.key,
    required this.profile,
    required this.currentPhotoIndex,
    this.photoPageController,
    this.parallaxAlignment = Alignment.center,
    this.onPhotoChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 8,
      color: VlvtColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: VlvtColors.gold.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Full-bleed photo carousel (or fallback icon)
          if (profile.photos != null && profile.photos!.isNotEmpty)
            _PhotoCarousel(
              profile: profile,
              photoPageController: photoPageController,
              parallaxAlignment: parallaxAlignment,
              onPhotoChanged: onPhotoChanged,
            )
          else
            Container(
              color: VlvtColors.primary.withValues(alpha: 0.4),
              child: const Center(
                child: Icon(Icons.person, size: 120, color: Colors.white),
              ),
            ),

          // Bar-style photo indicators at top
          if (profile.photos != null && profile.photos!.length > 1)
            Positioned(
              top: 12,
              left: 12,
              right: 12,
              child: _PhotoBarIndicators(
                count: profile.photos!.length,
                currentIndex: currentPhotoIndex,
              ),
            ),

          // Gradient overlay at bottom
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              height: 200,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.8),
                    Colors.black.withValues(alpha: 0.4),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.6, 1.0],
                ),
              ),
            ),
          ),

          // Profile info overlay at bottom
          Positioned(
            bottom: 16,
            left: 16,
            right: 16,
            child: _OverlayInfo(profile: profile),
          ),
        ],
      ),
    );
  }
}

class _PhotoCarousel extends StatelessWidget {
  final Profile profile;
  final PageController? photoPageController;
  final Alignment parallaxAlignment;
  final ValueChanged<int>? onPhotoChanged;

  const _PhotoCarousel({
    required this.profile,
    this.photoPageController,
    required this.parallaxAlignment,
    this.onPhotoChanged,
  });

  @override
  Widget build(BuildContext context) {
    final profileService = context.read<ProfileApiService>();

    return PageView.builder(
      controller: photoPageController,
      onPageChanged: (index) {
        HapticFeedback.selectionClick();
        onPhotoChanged?.call(index);
      },
      itemCount: profile.photos!.length,
      itemBuilder: (context, index) {
        final photoUrl = profile.photos![index];
        return Hero(
          tag: 'discovery_${profile.userId}',
          child: CachedNetworkImage(
            imageUrl: photoUrl.startsWith('http')
                ? photoUrl
                : '${profileService.baseUrl}$photoUrl',
            fit: BoxFit.cover,
            alignment: parallaxAlignment,
            memCacheWidth: 800,
            placeholder: (context, url) => ExcludeSemantics(
              child: Container(
                color: Colors.white.withValues(alpha: 0.2),
                child: const Center(
                  child: VlvtProgressIndicator(size: 32),
                ),
              ),
            ),
            errorWidget: (context, url, error) => Container(
              color: Colors.white.withValues(alpha: 0.2),
              child: const Icon(
                Icons.broken_image,
                size: 80,
                color: Colors.white70,
              ),
            ),
          ),
        );
      },
    );
  }
}

class _PhotoBarIndicators extends StatelessWidget {
  final int count;
  final int currentIndex;

  const _PhotoBarIndicators({
    required this.count,
    required this.currentIndex,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(count, (index) {
        return Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 2),
            height: 3,
            decoration: BoxDecoration(
              color: index == currentIndex
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        );
      }),
    );
  }
}

class _OverlayInfo extends StatelessWidget {
  final Profile profile;

  const _OverlayInfo({required this.profile});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Name, age, verified badge
        Row(
          children: [
            Flexible(
              child: Text(
                '${profile.name ?? 'Anonymous'}, ${profile.age ?? '?'}',
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
                style: VlvtTextStyles.displayMedium.copyWith(
                  color: Colors.white,
                  shadows: [
                    Shadow(
                      color: Colors.black.withValues(alpha: 0.5),
                      blurRadius: 4,
                    ),
                  ],
                ),
              ),
            ),
            if (profile.isVerified) ...[
              const SizedBox(width: 8),
              const VerifiedIcon(size: 24),
            ],
          ],
        ),

        // Distance
        if (profile.distance != null) ...[
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(
                Icons.location_on_outlined,
                size: 14,
                color: Colors.white.withValues(alpha: 0.8),
              ),
              const SizedBox(width: 4),
              Text(
                LocationService.formatDistance(profile.distance! * 1000),
                style: VlvtTextStyles.bodySmall.copyWith(
                  color: Colors.white.withValues(alpha: 0.8),
                ),
              ),
            ],
          ),
        ],

        // Bio snippet
        if (profile.bio != null && profile.bio!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            profile.bio!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: VlvtTextStyles.bodyMedium.copyWith(
              color: Colors.white.withValues(alpha: 0.9),
            ),
          ),
        ],

        // View profile hint
        const SizedBox(height: 8),
        Row(
          children: [
            Icon(
              Icons.keyboard_arrow_up,
              size: 16,
              color: Colors.white.withValues(alpha: 0.6),
            ),
            const SizedBox(width: 4),
            Text(
              'Tap for full profile',
              style: VlvtTextStyles.labelSmall.copyWith(
                color: Colors.white.withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
