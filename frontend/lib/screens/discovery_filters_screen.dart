import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/discovery_preferences_service.dart';
import '../theme/vlvt_colors.dart';
import '../widgets/vlvt_button.dart';
import '../widgets/vlvt_card.dart';

class DiscoveryFiltersScreen extends StatefulWidget {
  const DiscoveryFiltersScreen({super.key});

  @override
  State<DiscoveryFiltersScreen> createState() => _DiscoveryFiltersScreenState();
}

class _DiscoveryFiltersScreenState extends State<DiscoveryFiltersScreen> {
  late int _minAge;
  late int _maxAge;
  late double _maxDistance;
  late List<String> _selectedInterests;
  late bool _verifiedOnly;

  // Available interests
  final List<String> _availableInterests = [
    'Travel',
    'Music',
    'Sports',
    'Movies',
    'Reading',
    'Cooking',
    'Gaming',
    'Fitness',
    'Art',
    'Photography',
    'Dancing',
    'Hiking',
    'Technology',
    'Fashion',
    'Food',
    'Pets',
    'Yoga',
    'Wine',
    'Coffee',
    'Nature',
  ];

  @override
  void initState() {
    super.initState();
    final prefsService = context.read<DiscoveryPreferencesService>();
    final filters = prefsService.filters;

    _minAge = filters.minAge;
    _maxAge = filters.maxAge;
    _maxDistance = filters.maxDistance;
    _selectedInterests = List.from(filters.selectedInterests);
    _verifiedOnly = filters.verifiedOnly;
  }

  Future<void> _applyFilters() async {
    final prefsService = context.read<DiscoveryPreferencesService>();
    final newFilters = DiscoveryFilters(
      minAge: _minAge,
      maxAge: _maxAge,
      maxDistance: _maxDistance,
      selectedInterests: _selectedInterests,
      verifiedOnly: _verifiedOnly,
    );

    await prefsService.updateFilters(newFilters);

    if (mounted) {
      Navigator.pop(context, true); // Return true to indicate filters changed
    }
  }

  Future<void> _clearFilters() async {
    final prefsService = context.read<DiscoveryPreferencesService>();
    await prefsService.clearFilters();

    setState(() {
      _minAge = 18;
      _maxAge = 99;
      _maxDistance = 50.0;
      _selectedInterests.clear();
      _verifiedOnly = false;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Filters cleared')),
      );
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Discovery Filters'),
        actions: [
          VlvtButton.text(
            label: 'Clear All',
            onPressed: _clearFilters,
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Age Range Section
              const Text(
                'Age Range',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              VlvtSurfaceCard(
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '$_minAge - $_maxAge years',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    RangeSlider(
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
                      onChanged: (RangeValues values) {
                        setState(() {
                          _minAge = values.start.round();
                          _maxAge = values.end.round();
                        });
                      },
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Distance Section
              const Text(
                'Maximum Distance',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              VlvtSurfaceCard(
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${_maxDistance.round()} km',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Slider(
                      value: _maxDistance,
                      min: 1,
                      max: 200,
                      divisions: 199,
                      label: '${_maxDistance.round()} km',
                      onChanged: (double value) {
                        setState(() {
                          _maxDistance = value;
                        });
                      },
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Verified Only Section
              const Text(
                'Verification',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              VlvtSurfaceCard(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.verified,
                                color: VlvtColors.gold,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              const Text(
                                'Verified Users Only',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Show only profiles with verified selfies',
                            style: TextStyle(
                              fontSize: 12,
                              color: VlvtColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: _verifiedOnly,
                      onChanged: (value) {
                        setState(() {
                          _verifiedOnly = value;
                        });
                      },
                      activeTrackColor: VlvtColors.gold.withValues(alpha: 0.5),
                      activeThumbColor: VlvtColors.gold,
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Interests Section
              const Text(
                'Interests',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              VlvtSurfaceCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _selectedInterests.isEmpty
                          ? 'No interests selected'
                          : '${_selectedInterests.length} selected',
                      style: TextStyle(
                        fontSize: 14,
                        color: VlvtColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _availableInterests.map((interest) {
                        final isSelected = _selectedInterests.contains(interest);
                        return FilterChip(
                          label: Text(interest),
                          selected: isSelected,
                          onSelected: (selected) {
                            setState(() {
                              if (selected) {
                                _selectedInterests.add(interest);
                              } else {
                                _selectedInterests.remove(interest);
                              }
                            });
                          },
                          selectedColor: Colors.deepPurple.shade200,
                          checkmarkColor: Colors.white,
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 32),

              // Apply Button
              VlvtButton.primary(
                label: 'Apply Filters',
                onPressed: _applyFilters,
                expanded: true,
              ),

              const SizedBox(height: 16),

              // Info text
              Center(
                child: Text(
                  'Filters help you find more compatible matches',
                  style: TextStyle(
                    fontSize: 14,
                    color: VlvtColors.textMuted,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
