import 'package:flutter/foundation.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class SubscriptionService extends ChangeNotifier {
  bool _hasPremiumAccess = false;
  bool _isLoading = false;
  bool _isRevenueCatConfigured = false;

  // Demo mode limits
  static const int _maxDailyLikes = 5;
  static const int _maxDailyMessages = 10;

  int _likesUsedToday = 0;
  int _messagesUsedToday = 0;
  String _lastResetDate = '';

  bool get hasPremiumAccess => _hasPremiumAccess;
  bool get isLoading => _isLoading;
  bool get isDemoMode => !_hasPremiumAccess;
  bool get isRevenueCatConfigured => _isRevenueCatConfigured;

  // Initialize RevenueCat
  Future<void> initialize(String userId) async {
    try {
      _isLoading = true;
      notifyListeners();

      // Load demo mode data from shared preferences
      await _loadDemoData();

      // Check if RevenueCat API key is configured
      if (!AppConfig.isRevenueCatConfigured) {
        debugPrint('RevenueCat API key not configured. Running in demo-only mode.');
        _isRevenueCatConfigured = false;
        _isLoading = false;
        notifyListeners();
        return;
      }

      // Initialize RevenueCat with your API key from config
      final configuration = PurchasesConfiguration(
        AppConfig.revenueCatApiKey,
      );

      await Purchases.configure(configuration);
      await Purchases.logIn(userId);
      _isRevenueCatConfigured = true;

      // Check subscription status
      await checkSubscriptionStatus();

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('Error initializing RevenueCat: $e');
      _isRevenueCatConfigured = false;
      _isLoading = false;
      notifyListeners();
    }
  }
  
  Future<void> checkSubscriptionStatus() async {
    if (!_isRevenueCatConfigured) {
      _hasPremiumAccess = false;
      notifyListeners();
      return;
    }

    try {
      final customerInfo = await Purchases.getCustomerInfo();

      // Check for 'premium_access' entitlement
      _hasPremiumAccess = customerInfo.entitlements.all['premium_access']?.isActive ?? false;

      notifyListeners();
    } catch (e) {
      debugPrint('Error checking subscription status: $e');
      _hasPremiumAccess = false;
      notifyListeners();
    }
  }

  Future<void> purchaseSubscription() async {
    if (!_isRevenueCatConfigured) {
      debugPrint('RevenueCat not configured. Cannot purchase subscriptions.');
      return;
    }

    try {
      _isLoading = true;
      notifyListeners();

      // Get available offerings
      final offerings = await Purchases.getOfferings();

      if (offerings.current != null && offerings.current!.availablePackages.isNotEmpty) {
        // Purchase the first available package
        final package = offerings.current!.availablePackages.first;

        await Purchases.purchasePackage(package);

        // Check updated subscription status
        await checkSubscriptionStatus();
      }

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('Error purchasing subscription: $e');
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> restorePurchases() async {
    if (!_isRevenueCatConfigured) {
      debugPrint('RevenueCat not configured. Cannot restore purchases.');
      return;
    }

    try {
      _isLoading = true;
      notifyListeners();

      await Purchases.restorePurchases();
      await checkSubscriptionStatus();

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('Error restoring purchases: $e');
      _isLoading = false;
      notifyListeners();
    }
  }

  // Demo mode tracking methods
  Future<void> _loadDemoData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final today = _getTodayString();

      _lastResetDate = prefs.getString('demo_last_reset') ?? '';

      // Reset if it's a new day
      if (_lastResetDate != today) {
        _likesUsedToday = 0;
        _messagesUsedToday = 0;
        _lastResetDate = today;
        await _saveDemoData();
      } else {
        _likesUsedToday = prefs.getInt('demo_likes_used') ?? 0;
        _messagesUsedToday = prefs.getInt('demo_messages_used') ?? 0;
      }

      notifyListeners();
    } catch (e) {
      debugPrint('Error loading demo data: $e');
    }
  }

  Future<void> _saveDemoData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('demo_last_reset', _lastResetDate);
      await prefs.setInt('demo_likes_used', _likesUsedToday);
      await prefs.setInt('demo_messages_used', _messagesUsedToday);
    } catch (e) {
      debugPrint('Error saving demo data: $e');
    }
  }

  String _getTodayString() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  // Check if action is allowed in demo mode
  bool canLike() {
    if (_hasPremiumAccess) return true;
    return _likesUsedToday < _maxDailyLikes;
  }

  bool canSendMessage() {
    if (_hasPremiumAccess) return true;
    return _messagesUsedToday < _maxDailyMessages;
  }

  // Get remaining counts
  int getLikesRemaining() {
    if (_hasPremiumAccess) return -1; // -1 means unlimited
    return (_maxDailyLikes - _likesUsedToday).clamp(0, _maxDailyLikes);
  }

  int getMessagesRemaining() {
    if (_hasPremiumAccess) return -1; // -1 means unlimited
    return (_maxDailyMessages - _messagesUsedToday).clamp(0, _maxDailyMessages);
  }

  // Use actions (call these when user performs limited actions)
  Future<void> useLike() async {
    if (_hasPremiumAccess) return;

    final today = _getTodayString();
    if (_lastResetDate != today) {
      // New day, reset counts
      _likesUsedToday = 0;
      _messagesUsedToday = 0;
      _lastResetDate = today;
    }

    _likesUsedToday++;
    await _saveDemoData();
    notifyListeners();
  }

  Future<void> useMessage() async {
    if (_hasPremiumAccess) return;

    final today = _getTodayString();
    if (_lastResetDate != today) {
      // New day, reset counts
      _likesUsedToday = 0;
      _messagesUsedToday = 0;
      _lastResetDate = today;
    }

    _messagesUsedToday++;
    await _saveDemoData();
    notifyListeners();
  }

  // Enable demo mode explicitly (for when user clicks "Try Limited Version")
  void enableDemoMode() {
    // Demo mode is the default when not premium
    // This is just for clarity in the UI flow
    notifyListeners();
  }
}
