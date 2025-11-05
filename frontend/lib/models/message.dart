enum MessageStatus {
  sending,
  sent,
  delivered,
  read,
  failed
}

class Message {
  final String id;
  final String matchId;
  final String senderId;
  final String text;
  final DateTime timestamp;
  final MessageStatus status;
  final String? error;

  Message({
    required this.id,
    required this.matchId,
    required this.senderId,
    required this.text,
    required this.timestamp,
    this.status = MessageStatus.sent,
    this.error,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    MessageStatus status = MessageStatus.sent;
    if (json['status'] != null) {
      status = MessageStatus.values.firstWhere(
        (e) => e.toString() == 'MessageStatus.${json['status']}',
        orElse: () => MessageStatus.sent,
      );
    }

    return Message(
      id: json['id'] as String,
      matchId: json['matchId'] as String,
      senderId: json['senderId'] as String,
      text: json['text'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      status: status,
      error: json['error'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'matchId': matchId,
      'senderId': senderId,
      'text': text,
      'timestamp': timestamp.toIso8601String(),
      'status': status.toString().split('.').last,
      if (error != null) 'error': error,
    };
  }

  Message copyWith({
    String? id,
    String? matchId,
    String? senderId,
    String? text,
    DateTime? timestamp,
    MessageStatus? status,
    String? error,
  }) {
    return Message(
      id: id ?? this.id,
      matchId: matchId ?? this.matchId,
      senderId: senderId ?? this.senderId,
      text: text ?? this.text,
      timestamp: timestamp ?? this.timestamp,
      status: status ?? this.status,
      error: error ?? this.error,
    );
  }
}
