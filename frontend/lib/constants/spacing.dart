import 'package:flutter/widgets.dart';

/// Consistent spacing constants for the app
class Spacing {
  // Spacing values
  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 48.0;

  // SizedBox widgets for convenience
  static const Widget verticalXs = SizedBox(height: xs);
  static const Widget verticalSm = SizedBox(height: sm);
  static const Widget verticalMd = SizedBox(height: md);
  static const Widget verticalLg = SizedBox(height: lg);
  static const Widget verticalXl = SizedBox(height: xl);
  static const Widget verticalXxl = SizedBox(height: xxl);

  static const Widget horizontalXs = SizedBox(width: xs);
  static const Widget horizontalSm = SizedBox(width: sm);
  static const Widget horizontalMd = SizedBox(width: md);
  static const Widget horizontalLg = SizedBox(width: lg);
  static const Widget horizontalXl = SizedBox(width: xl);
  static const Widget horizontalXxl = SizedBox(width: xxl);

  // Padding
  static const EdgeInsets paddingXs = EdgeInsets.all(xs);
  static const EdgeInsets paddingSm = EdgeInsets.all(sm);
  static const EdgeInsets paddingMd = EdgeInsets.all(md);
  static const EdgeInsets paddingLg = EdgeInsets.all(lg);
  static const EdgeInsets paddingXl = EdgeInsets.all(xl);
  static const EdgeInsets paddingXxl = EdgeInsets.all(xxl);

  // Horizontal padding
  static const EdgeInsets horizontalPaddingXs = EdgeInsets.symmetric(horizontal: xs);
  static const EdgeInsets horizontalPaddingSm = EdgeInsets.symmetric(horizontal: sm);
  static const EdgeInsets horizontalPaddingMd = EdgeInsets.symmetric(horizontal: md);
  static const EdgeInsets horizontalPaddingLg = EdgeInsets.symmetric(horizontal: lg);
  static const EdgeInsets horizontalPaddingXl = EdgeInsets.symmetric(horizontal: xl);

  // Vertical padding
  static const EdgeInsets verticalPaddingXs = EdgeInsets.symmetric(vertical: xs);
  static const EdgeInsets verticalPaddingSm = EdgeInsets.symmetric(vertical: sm);
  static const EdgeInsets verticalPaddingMd = EdgeInsets.symmetric(vertical: md);
  static const EdgeInsets verticalPaddingLg = EdgeInsets.symmetric(vertical: lg);
  static const EdgeInsets verticalPaddingXl = EdgeInsets.symmetric(vertical: xl);

  // Border radius
  static const double radiusXs = 4.0;
  static const double radiusSm = 8.0;
  static const double radiusMd = 12.0;
  static const double radiusLg = 16.0;
  static const double radiusXl = 24.0;
  static const double radiusRound = 999.0;

  // BorderRadius
  static final BorderRadius borderRadiusXs = BorderRadius.circular(radiusXs);
  static final BorderRadius borderRadiusSm = BorderRadius.circular(radiusSm);
  static final BorderRadius borderRadiusMd = BorderRadius.circular(radiusMd);
  static final BorderRadius borderRadiusLg = BorderRadius.circular(radiusLg);
  static final BorderRadius borderRadiusXl = BorderRadius.circular(radiusXl);
  static final BorderRadius borderRadiusRound = BorderRadius.circular(radiusRound);
}
