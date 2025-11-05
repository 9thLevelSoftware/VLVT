import 'package:flutter/foundation.dart';
import '../models/match.dart';
import '../models/profile.dart';
import '../models/message.dart';

class CacheEntry<T> {
  final T data;
  final DateTime timestamp;

  CacheEntry(this.data, this.timestamp);

  bool isExpired(Duration maxAge) {
    return DateTime.now().difference(timestamp) > maxAge;
  }
}

class CacheService extends ChangeNotifier {
  // Cache storage
  final Map<String, CacheEntry<List<Match>>> _matchesCache = {};
  final Map<String, CacheEntry<Profile>> _profilesCache = {};
  final Map<String, CacheEntry<List<Message>>> _messagesCache = {};
  final Map<String, CacheEntry<Message?>> _lastMessageCache = {};

  // Cache durations
  static const Duration matchesCacheDuration = Duration(minutes: 5);
  static const Duration profilesCacheDuration = Duration(minutes: 15);
  static const Duration messagesCacheDuration = Duration(minutes: 2);
  static const Duration lastMessageCacheDuration = Duration(minutes: 2);

  // Matches cache
  List<Match>? getCachedMatches(String userId) {
    final entry = _matchesCache[userId];
    if (entry != null && !entry.isExpired(matchesCacheDuration)) {
      debugPrint('Cache hit: matches for user $userId');
      return entry.data;
    }
    debugPrint('Cache miss: matches for user $userId');
    return null;
  }

  void cacheMatches(String userId, List<Match> matches) {
    _matchesCache[userId] = CacheEntry(matches, DateTime.now());
    debugPrint('Cached ${matches.length} matches for user $userId');
    notifyListeners();
  }

  void invalidateMatches(String userId) {
    _matchesCache.remove(userId);
    debugPrint('Invalidated matches cache for user $userId');
    notifyListeners();
  }

  // Profile cache
  Profile? getCachedProfile(String userId) {
    final entry = _profilesCache[userId];
    if (entry != null && !entry.isExpired(profilesCacheDuration)) {
      debugPrint('Cache hit: profile for user $userId');
      return entry.data;
    }
    debugPrint('Cache miss: profile for user $userId');
    return null;
  }

  void cacheProfile(String userId, Profile profile) {
    _profilesCache[userId] = CacheEntry(profile, DateTime.now());
    debugPrint('Cached profile for user $userId');
    notifyListeners();
  }

  void cacheProfiles(Map<String, Profile> profiles) {
    final timestamp = DateTime.now();
    profiles.forEach((userId, profile) {
      _profilesCache[userId] = CacheEntry(profile, timestamp);
    });
    debugPrint('Batch cached ${profiles.length} profiles');
    notifyListeners();
  }

  void invalidateProfile(String userId) {
    _profilesCache.remove(userId);
    debugPrint('Invalidated profile cache for user $userId');
    notifyListeners();
  }

  // Messages cache
  List<Message>? getCachedMessages(String matchId) {
    final entry = _messagesCache[matchId];
    if (entry != null && !entry.isExpired(messagesCacheDuration)) {
      debugPrint('Cache hit: messages for match $matchId');
      return entry.data;
    }
    debugPrint('Cache miss: messages for match $matchId');
    return null;
  }

  void cacheMessages(String matchId, List<Message> messages) {
    _messagesCache[matchId] = CacheEntry(messages, DateTime.now());
    debugPrint('Cached ${messages.length} messages for match $matchId');
    notifyListeners();
  }

  void invalidateMessages(String matchId) {
    _messagesCache.remove(matchId);
    debugPrint('Invalidated messages cache for match $matchId');
    notifyListeners();
  }

  // Last message cache
  Message? getCachedLastMessage(String matchId) {
    final entry = _lastMessageCache[matchId];
    if (entry != null && !entry.isExpired(lastMessageCacheDuration)) {
      debugPrint('Cache hit: last message for match $matchId');
      return entry.data;
    }
    debugPrint('Cache miss: last message for match $matchId');
    return null;
  }

  void cacheLastMessage(String matchId, Message? message) {
    _lastMessageCache[matchId] = CacheEntry(message, DateTime.now());
    debugPrint('Cached last message for match $matchId');
    notifyListeners();
  }

  void cacheLastMessages(Map<String, Message?> messages) {
    final timestamp = DateTime.now();
    messages.forEach((matchId, message) {
      _lastMessageCache[matchId] = CacheEntry(message, timestamp);
    });
    debugPrint('Batch cached ${messages.length} last messages');
    notifyListeners();
  }

  void invalidateLastMessage(String matchId) {
    _lastMessageCache.remove(matchId);
    debugPrint('Invalidated last message cache for match $matchId');
    notifyListeners();
  }

  // Clear all caches
  void clearAll() {
    _matchesCache.clear();
    _profilesCache.clear();
    _messagesCache.clear();
    _lastMessageCache.clear();
    debugPrint('Cleared all caches');
    notifyListeners();
  }

  // Clear specific user's data
  void clearUserData(String userId) {
    _matchesCache.remove(userId);
    _profilesCache.remove(userId);
    // Note: we don't clear messages as we'd need to know which matches belong to this user
    debugPrint('Cleared cache for user $userId');
    notifyListeners();
  }

  // Get cache statistics (useful for debugging)
  Map<String, dynamic> getCacheStats() {
    return {
      'matches': _matchesCache.length,
      'profiles': _profilesCache.length,
      'messages': _messagesCache.length,
      'lastMessages': _lastMessageCache.length,
    };
  }
}
