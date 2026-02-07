import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

import '../config/app_config.dart';
import 'auth_service.dart';

/// Ticket/invite code data model
class InviteCode {
  final String code;
  final DateTime createdAt;
  final bool used;
  final String? usedBy;
  final DateTime? usedAt;

  InviteCode({
    required this.code,
    required this.createdAt,
    required this.used,
    this.usedBy,
    this.usedAt,
  });

  factory InviteCode.fromJson(Map<String, dynamic> json) {
    return InviteCode(
      code: json['code'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      used: json['used'] as bool? ?? false,
      usedBy: json['usedBy'] as String?,
      usedAt: json['usedAt'] != null ? DateTime.parse(json['usedAt'] as String) : null,
    );
  }
}

/// Ticket ledger entry
class TicketTransaction {
  final int amount;
  final String reason;
  final String? referenceId;
  final DateTime createdAt;

  TicketTransaction({
    required this.amount,
    required this.reason,
    this.referenceId,
    required this.createdAt,
  });

  factory TicketTransaction.fromJson(Map<String, dynamic> json) {
    return TicketTransaction(
      amount: json['amount'] as int,
      reason: json['reason'] as String,
      referenceId: json['referenceId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  String get reasonDisplayText {
    switch (reason) {
      case 'verification':
        return 'Profile verified';
      case 'first_match':
        return 'First mutual match';
      case 'date_completed':
        return 'Date completed';
      case 'invite_created':
        return 'Created invite';
      case 'referral_bonus':
        return 'Referral bonus';
      case 'signup_bonus':
        return 'Welcome bonus';
      default:
        return reason;
    }
  }
}

/// Service for managing Golden Tickets
class TicketsService extends ChangeNotifier {
  final AuthService _authService;

  int _balance = 0;
  List<InviteCode> _codes = [];
  List<TicketTransaction> _history = [];
  bool _isLoading = false;
  String? _error;

  TicketsService(this._authService);

  int get balance => _balance;
  List<InviteCode> get codes => _codes;
  List<TicketTransaction> get history => _history;
  bool get isLoading => _isLoading;
  String? get error => _error;

  String get baseUrl => AppConfig.authServiceUrl;

  Map<String, String> _getAuthHeaders() {
    final token = _authService.token;
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  /// Load ticket balance, codes, and history
  Future<void> loadTickets() async {
    if (_isLoading) return;

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/auth/tickets'),
        headers: _getAuthHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          _balance = data['balance'] as int? ?? 0;
          _codes = (data['codes'] as List?)
              ?.map((c) => InviteCode.fromJson(c as Map<String, dynamic>))
              .toList() ?? [];
          _history = (data['history'] as List?)
              ?.map((h) => TicketTransaction.fromJson(h as Map<String, dynamic>))
              .toList() ?? [];
        }
      } else {
        _error = 'Failed to load tickets';
      }
    } catch (e) {
      // debugPrint('Error loading tickets: $e');
      _error = e.toString();
    }

    _isLoading = false;
    notifyListeners();
  }

  /// Create a new invite code (costs 1 ticket)
  Future<Map<String, dynamic>> createInviteCode() async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/tickets/create-code'),
        headers: _getAuthHeaders(),
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        _balance = data['balance'] as int? ?? _balance;

        // Add new code to list
        _codes.insert(0, InviteCode(
          code: data['code'] as String,
          createdAt: DateTime.now(),
          used: false,
        ));

        notifyListeners();

        return {
          'success': true,
          'code': data['code'],
          'shareUrl': data['shareUrl'],
          'balance': _balance,
        };
      }

      return {
        'success': false,
        'error': data['error'] ?? 'Failed to create invite code',
      };
    } catch (e) {
      // debugPrint('Error creating invite code: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Validate an invite code (for new users during signup)
  Future<Map<String, dynamic>> validateInviteCode(String code) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/tickets/validate'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'code': code}),
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return {
          'success': true,
          'valid': true,
          'invitedBy': data['invitedBy'],
        };
      }

      return {
        'success': false,
        'error': data['error'] ?? 'Invalid invite code',
      };
    } catch (e) {
      // debugPrint('Error validating invite code: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Redeem an invite code after signup
  Future<Map<String, dynamic>> redeemInviteCode(String code) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/tickets/redeem'),
        headers: _getAuthHeaders(),
        body: json.encode({'code': code}),
      );

      final data = json.decode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        // Reload tickets to get updated balance
        await loadTickets();

        return {
          'success': true,
          'message': data['message'],
          'ticketsEarned': data['ticketsEarned'],
        };
      }

      return {
        'success': false,
        'error': data['error'] ?? 'Failed to redeem invite code',
      };
    } catch (e) {
      // debugPrint('Error redeeming invite code: $e');
      return {'success': false, 'error': e.toString()};
    }
  }
}
