class Profile {
  final String userId;
  final String? name;
  final int? age;
  final String? bio;
  final List<String>? photos;
  final List<String>? interests;
  final double? distance; // Distance in kilometers from current user
  final bool isVerified; // Whether user has completed selfie verification
  final bool isNewUser; // Whether user was created in last 48 hours

  Profile({
    required this.userId,
    this.name,
    this.age,
    this.bio,
    this.photos,
    this.interests,
    this.distance,
    this.isVerified = false,
    this.isNewUser = false,
  });

  factory Profile.fromJson(Map<String, dynamic> json) {
    return Profile(
      userId: json['userId'] as String,
      name: json['name'] as String?,
      age: json['age'] as int?,
      bio: json['bio'] as String?,
      photos: json['photos'] != null
          ? List<String>.from(json['photos'] as List)
          : null,
      interests: json['interests'] != null
          ? List<String>.from(json['interests'] as List)
          : null,
      distance: json['distance'] != null
          ? (json['distance'] as num).toDouble()
          : null,
      isVerified: json['isVerified'] as bool? ?? false,
      isNewUser: json['isNewUser'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userId': userId,
      if (name != null) 'name': name,
      if (age != null) 'age': age,
      if (bio != null) 'bio': bio,
      if (photos != null) 'photos': photos,
      if (interests != null) 'interests': interests,
      if (distance != null) 'distance': distance,
      'isVerified': isVerified,
      'isNewUser': isNewUser,
    };
  }
}
