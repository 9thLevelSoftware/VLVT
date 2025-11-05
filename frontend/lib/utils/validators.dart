/// Form validation utilities
class Validators {
  /// Email validation
  static String? email(String? value) {
    if (value == null || value.isEmpty) {
      return 'Email is required';
    }

    final emailRegex = RegExp(
      r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
    );

    if (!emailRegex.hasMatch(value)) {
      return 'Please enter a valid email';
    }

    return null;
  }

  /// Name validation
  static String? name(String? value) {
    if (value == null || value.isEmpty) {
      return 'Name is required';
    }

    if (value.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }

    if (value.trim().length > 50) {
      return 'Name must be less than 50 characters';
    }

    return null;
  }

  /// Age validation (18+)
  static String? age(String? value) {
    if (value == null || value.isEmpty) {
      return 'Age is required';
    }

    final age = int.tryParse(value);

    if (age == null) {
      return 'Please enter a valid age';
    }

    if (age < 18) {
      return 'You must be at least 18 years old';
    }

    if (age > 120) {
      return 'Please enter a valid age';
    }

    return null;
  }

  /// Bio validation with length constraints
  static String? bio(String? value, {int minLength = 10, int maxLength = 500}) {
    if (value == null || value.isEmpty) {
      return 'Bio is required';
    }

    final trimmedValue = value.trim();

    if (trimmedValue.length < minLength) {
      return 'Bio must be at least $minLength characters';
    }

    if (trimmedValue.length > maxLength) {
      return 'Bio must be less than $maxLength characters';
    }

    return null;
  }

  /// Optional bio validation (can be empty)
  static String? optionalBio(String? value, {int maxLength = 500}) {
    if (value == null || value.isEmpty) {
      return null; // Optional field
    }

    final trimmedValue = value.trim();

    if (trimmedValue.length > maxLength) {
      return 'Bio must be less than $maxLength characters';
    }

    return null;
  }

  /// Message validation
  static String? message(String? value, {int maxLength = 1000}) {
    if (value == null || value.isEmpty) {
      return 'Message cannot be empty';
    }

    final trimmedValue = value.trim();

    if (trimmedValue.isEmpty) {
      return 'Message cannot be empty';
    }

    if (trimmedValue.length > maxLength) {
      return 'Message must be less than $maxLength characters';
    }

    return null;
  }

  /// Generic required field validation
  static String? required(String? value, String fieldName) {
    if (value == null || value.isEmpty) {
      return '$fieldName is required';
    }

    if (value.trim().isEmpty) {
      return '$fieldName is required';
    }

    return null;
  }

  /// Character count helper for text fields
  static String characterCount(String value, int maxLength) {
    return '${value.length}/$maxLength';
  }

  /// Check if value is within length constraints
  static bool isWithinLength(String? value, int minLength, int maxLength) {
    if (value == null) return false;
    final length = value.trim().length;
    return length >= minLength && length <= maxLength;
  }

  /// Password validation (if needed in future)
  static String? password(String? value, {int minLength = 8}) {
    if (value == null || value.isEmpty) {
      return 'Password is required';
    }

    if (value.length < minLength) {
      return 'Password must be at least $minLength characters';
    }

    // Check for at least one letter and one number
    final hasLetter = RegExp(r'[a-zA-Z]').hasMatch(value);
    final hasNumber = RegExp(r'[0-9]').hasMatch(value);

    if (!hasLetter || !hasNumber) {
      return 'Password must contain letters and numbers';
    }

    return null;
  }

  /// Phone number validation (if needed in future)
  static String? phoneNumber(String? value) {
    if (value == null || value.isEmpty) {
      return 'Phone number is required';
    }

    // Remove common formatting characters
    final cleanedValue = value.replaceAll(RegExp(r'[\s\-\(\)]'), '');

    // Check if it's a valid phone number (10-15 digits)
    final phoneRegex = RegExp(r'^[0-9]{10,15}$');

    if (!phoneRegex.hasMatch(cleanedValue)) {
      return 'Please enter a valid phone number';
    }

    return null;
  }

  /// URL validation (if needed for profile links)
  static String? url(String? value) {
    if (value == null || value.isEmpty) {
      return null; // Optional
    }

    final urlRegex = RegExp(
      r'^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$',
    );

    if (!urlRegex.hasMatch(value)) {
      return 'Please enter a valid URL';
    }

    return null;
  }
}
