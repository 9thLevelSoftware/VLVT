import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'dart:convert';

import '../config/app_config.dart';
import 'auth_service.dart';

/// Gesture prompt for verification
class GesturePrompt {
  final String id;
  final String instruction;
  final int timeLimit;

  GesturePrompt({
    required this.id,
    required this.instruction,
    required this.timeLimit,
  });

  factory GesturePrompt.fromJson(Map<String, dynamic> json) {
    return GesturePrompt(
      id: json['id'] as String,
      instruction: json['instruction'] as String,
      timeLimit: json['timeLimit'] as int,
    );
  }
}

/// Verification attempt record
class VerificationAttempt {
  final String id;
  final String status;
  final String? rejectionReason;
  final int? similarity;
  final DateTime createdAt;
  final DateTime? processedAt;

  VerificationAttempt({
    required this.id,
    required this.status,
    this.rejectionReason,
    this.similarity,
    required this.createdAt,
    this.processedAt,
  });

  factory VerificationAttempt.fromJson(Map<String, dynamic> json) {
    return VerificationAttempt(
      id: json['id'] as String,
      status: json['status'] as String,
      rejectionReason: json['rejectionReason'] as String?,
      similarity: json['similarity'] as int?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      processedAt: json['processedAt'] != null
          ? DateTime.parse(json['processedAt'] as String)
          : null,
    );
  }

  bool get isPending => status == 'pending';
  bool get isApproved => status == 'approved';
  bool get isRejected => status == 'rejected';
}

/// Service for managing user verification
class VerificationService extends ChangeNotifier {
  final AuthService _authService;

  bool _isVerified = false;
  DateTime? _verifiedAt;
  List<VerificationAttempt> _attempts = [];
  bool _isLoading = false;
  String? _error;
  GesturePrompt? _currentPrompt;

  VerificationService(this._authService);

  bool get isVerified => _isVerified;
  DateTime? get verifiedAt => _verifiedAt;
  List<VerificationAttempt> get attempts => _attempts;
  bool get isLoading => _isLoading;
  String? get error => _error;
  GesturePrompt? get currentPrompt => _currentPrompt;

  String get baseUrl => AppConfig.profileServiceUrl;

  Map<String, String> _getAuthHeaders() {
    final token = _authService.token;
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  /// Load verification status
  Future<void> loadStatus() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/verification/status'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          _isVerified = data['isVerified'] as bool;
          _verifiedAt = data['verifiedAt'] != null
              ? DateTime.parse(data['verifiedAt'] as String)
              : null;
          _attempts = (data['attempts'] as List)
              .map((a) => VerificationAttempt.fromJson(a as Map<String, dynamic>))
              .toList();
        }
      } else {
        _error = 'Failed to load verification status';
      }
    } catch (e) {
      debugPrint('Error loading verification status: $e');
      _error = e.toString();
    }

    _isLoading = false;
    notifyListeners();
  }

  /// Get a random gesture prompt for verification
  Future<GesturePrompt?> getPrompt() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/verification/prompt'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          _currentPrompt = GesturePrompt.fromJson(data['prompt'] as Map<String, dynamic>);
          _isLoading = false;
          notifyListeners();
          return _currentPrompt;
        }
      }

      _error = 'Failed to get verification prompt';
    } catch (e) {
      debugPrint('Error getting verification prompt: $e');
      _error = e.toString();
    }

    _isLoading = false;
    notifyListeners();
    return null;
  }

  /// Submit verification selfie
  Future<Map<String, dynamic>> submitVerification({
    required File selfieFile,
    required String gesturePrompt,
    int referencePhotoIndex = 0,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final uri = Uri.parse('$baseUrl/verification/submit');
      final request = http.MultipartRequest('POST', uri);

      // Add auth header
      final token = _authService.token;
      request.headers['Authorization'] = 'Bearer $token';

      // Add file
      final fileBytes = await selfieFile.readAsBytes();
      final multipartFile = http.MultipartFile.fromBytes(
        'selfie',
        fileBytes,
        filename: 'selfie.jpg',
        contentType: MediaType('image', 'jpeg'),
      );
      request.files.add(multipartFile);

      // Add fields
      request.fields['gesturePrompt'] = gesturePrompt;
      request.fields['referencePhotoIndex'] = referencePhotoIndex.toString();

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      final data = json.decode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        final verified = data['verified'] as bool;

        if (verified) {
          _isVerified = true;
          _verifiedAt = DateTime.now();
        }

        _isLoading = false;
        notifyListeners();

        return {
          'success': true,
          'verified': verified,
          'message': data['message'] as String,
          'similarity': data['similarity'] as int?,
          'ticketAwarded': data['ticketAwarded'] as bool? ?? false,
        };
      }

      _error = data['error'] ?? 'Verification failed';
      _isLoading = false;
      notifyListeners();

      return {
        'success': false,
        'error': _error,
      };
    } catch (e) {
      debugPrint('Error submitting verification: $e');
      _error = e.toString();
      _isLoading = false;
      notifyListeners();

      return {
        'success': false,
        'error': _error,
      };
    }
  }
}
