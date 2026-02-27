# Phase 10: Page Transitions - Research

**Researched:** 2026-02-27
**Domain:** Flutter custom page route transitions
**Confidence:** HIGH

## Summary

Phase 10 replaces all 23 `MaterialPageRoute` calls and standardizes 10 existing ad-hoc `PageRouteBuilder` usages into two shared route classes: `VlvtPageRoute` (slide-from-right) and `VlvtFadeRoute` (crossfade). The app currently uses vanilla Flutter Navigator (no go_router or other routing packages), so the implementation is purely creating two reusable `PageRouteBuilder` subclasses and performing a mechanical find-and-replace across ~15 files.

The project already has precedent for custom transitions: `profile_screen.dart`, `safety_settings_screen.dart`, `after_hours_tab_screen.dart`, and `discovery_screen.dart` all use inline `PageRouteBuilder` with `SlideTransition` or `FadeTransition`. The existing transitions already use `Curves.easeOutCubic` -- matching the requirement. The main work is extracting the inline pattern into reusable classes and applying them uniformly.

Hero animations exist in 4 locations (discovery profile cards, chats screen avatars, chat screen avatars) using the centralized `HeroTags` utility. Hero works natively with `PageRouteBuilder` -- the only requirement is that the route remains opaque (default) and uses standard Navigator push/pop. No special handling needed.

**Primary recommendation:** Create `VlvtPageRoute<T>` and `VlvtFadeRoute<T>` as classes extending `PageRouteBuilder<T>` in `lib/utils/vlvt_routes.dart`, then mechanically replace all 23 `MaterialPageRoute` calls and consolidate the 10 inline `PageRouteBuilder` calls.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-01 | Shared VlvtPageRoute provides slide-from-right transition for forward navigation | Create `VlvtPageRoute<T>` extending `PageRouteBuilder<T>` with `SlideTransition` from `Offset(1.0, 0.0)` to `Offset.zero` using `Curves.easeOutCubic` |
| UX-02 | Shared VlvtFadeRoute provides crossfade transition for modal/overlay screens | Create `VlvtFadeRoute<T>` extending `PageRouteBuilder<T>` with `FadeTransition` on `animation.value` |
| UX-03 | All ~22 plain MaterialPageRoute calls are replaced with VlvtPageRoute or VlvtFadeRoute | 23 `MaterialPageRoute` calls across 13 files + 10 inline `PageRouteBuilder` calls across 4 files; all need consolidation |
| UX-04 | Existing Hero animations continue to work with custom page routes | Hero works natively with `PageRouteBuilder` when `opaque: true` (default) -- verified via Flutter docs. 4 Hero usage sites: `discovery_profile_card.dart`, `chats_screen.dart`, `chat_screen.dart` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flutter SDK `PageRouteBuilder<T>` | 3.38.3 (current) | Base class for custom route transitions | Built-in, zero dependencies, full animation control, Hero-compatible |
| Flutter SDK `SlideTransition` | 3.38.3 | Animates position offset for slide effect | Built-in transition widget, uses `Animation<Offset>` directly |
| Flutter SDK `FadeTransition` | 3.38.3 | Animates opacity for crossfade effect | Built-in transition widget, uses `Animation<double>` directly |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `CurvedAnimation` | SDK built-in | Apply easing curves to animations | Wrap `animation` parameter in transitionsBuilder |
| `Tween<Offset>` | SDK built-in | Define start/end positions for slide | Chain with CurveTween for slide-from-right |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `PageRouteBuilder` | Extending `PageRoute` directly | More control but more boilerplate; `PageRouteBuilder` already exposes `transitionsBuilder` callback cleanly |
| `PageRouteBuilder` subclass | Inline `PageRouteBuilder` everywhere | Already proven in codebase (10 existing usages); subclass is DRYer |
| Custom route classes | `go_router` CustomTransitionPage | Would require rewriting all navigation; out of scope. No router package in project |

**Installation:** No new dependencies needed. All APIs are Flutter SDK built-ins.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── utils/
│   ├── hero_tags.dart       # (existing) Centralized hero tag generation
│   └── vlvt_routes.dart     # (NEW) VlvtPageRoute, VlvtFadeRoute
├── screens/                 # (existing) All screen files updated to use new routes
└── services/
    └── deep_link_service.dart  # (existing) Also updated
```

### Pattern 1: Reusable Route Class via PageRouteBuilder Extension
**What:** Create a named class that extends `PageRouteBuilder<T>` with the transition baked in.
**When to use:** When the same transition pattern is used across 10+ navigation sites.
**Example:**
```dart
// Source: https://api.flutter.dev/flutter/widgets/PageRouteBuilder-class.html
class VlvtPageRoute<T> extends PageRouteBuilder<T> {
  VlvtPageRoute({required Widget Function(BuildContext) builder})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) =>
              builder(context),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(1.0, 0.0),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutCubic,
              )),
              child: child,
            );
          },
        );
}
```

### Pattern 2: Crossfade Route for Modals/Overlays
**What:** A fade-in transition for modal-style screens (paywall, legal docs, after-hours overlays).
**When to use:** Screens that feel like overlays or popups rather than forward navigation.
**Example:**
```dart
class VlvtFadeRoute<T> extends PageRouteBuilder<T> {
  VlvtFadeRoute({required Widget Function(BuildContext) builder})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) =>
              builder(context),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
        );
}
```

### Pattern 3: Handling Generic Type Parameter `<T>` for Return Values
**What:** Several navigation calls use `Navigator.push<bool>` or `Navigator.push<Profile>` to return data from the pushed screen. The route class must be generic to preserve this.
**When to use:** All route classes.
**Example:**
```dart
// Usage: preserves return type
final shouldRefresh = await Navigator.push<bool>(
  context,
  VlvtPageRoute<bool>(builder: (_) => ChatScreen(match: match)),
);
```

### Pattern 4: pushAndRemoveUntil / pushReplacement Compatibility
**What:** `main.dart` uses `pushAndRemoveUntil` and `register_screen.dart` uses `pushReplacement`. These work with any `Route<T>` object, so `VlvtPageRoute` works directly.
**When to use:** No special handling needed. `VlvtPageRoute<T>` extends `PageRouteBuilder<T>` which extends `PageRoute<T>` which extends `Route<T>`.

### Anti-Patterns to Avoid
- **Setting `opaque: false` on VlvtPageRoute:** This would break Hero animations and waste resources keeping the previous route built. Keep default `opaque: true`.
- **Overriding `createOverlayEntries()`:** This breaks Hero, Focus, and Semantic support per Flutter issue #170913. Never needed for simple transition customization.
- **Adding transition duration to individual call sites:** Duration should be baked into the route class. Default 300ms from `PageRouteBuilder` is standard and matches existing behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide animation math | Manual offset calculation with AnimatedBuilder | `SlideTransition` + `Tween<Offset>` | Built-in widgets handle all edge cases (reverse, interrupted, dismissed) |
| Easing curves | Custom curve functions | `Curves.easeOutCubic` (built-in) | Mathematically correct, GPU-optimized, tested |
| Hero flight coordination | Manual overlay management | Default Hero behavior (automatic with PageRouteBuilder) | Hero internally uses overlay and animation controller syncing |
| Animation lifecycle | Manual AnimationController in routes | `PageRouteBuilder`'s built-in animation parameter | Controller lifecycle, disposal, reverse all handled |

**Key insight:** `PageRouteBuilder` already manages the full animation lifecycle including reverse transitions, interrupted transitions (swipe-back on iOS), and animation controller disposal. Custom AnimationControllers inside routes are unnecessary and create lifecycle bugs.

## Common Pitfalls

### Pitfall 1: Breaking Hero by Setting opaque: false
**What goes wrong:** Hero animations stop working. The source Hero widget remains visible instead of flying to the destination.
**Why it happens:** Hero uses the overlay system and assumes opaque routes. When `opaque: false`, the framework keeps the previous route built, and Hero's flight animation conflicts.
**How to avoid:** Never set `opaque: false` on `VlvtPageRoute`. It defaults to `true` in `PageRouteBuilder`.
**Warning signs:** Hero widgets "flicker" or appear in two places simultaneously during transition.

### Pitfall 2: Forgetting Generic Type Parameter
**What goes wrong:** `Navigator.push<bool>(context, VlvtPageRoute(...))` fails because the route doesn't carry the type parameter, so the return value is `dynamic` or `null`.
**Why it happens:** The route class is defined as `VlvtPageRoute` instead of `VlvtPageRoute<T>`.
**How to avoid:** Always define routes as `class VlvtPageRoute<T> extends PageRouteBuilder<T>`.
**Warning signs:** Static analysis warnings about type inference; `await Navigator.push<bool>` always returns null.

### Pitfall 3: Existing Slide-from-Bottom Transitions in safety_settings_screen.dart
**What goes wrong:** The safety settings screen currently has 3 inline `PageRouteBuilder` calls that slide from BOTTOM (`Offset(0.0, 1.0)`) for legal documents, not from the right.
**Why it happens:** These were deliberately designed as bottom-sheet-style transitions for legal/privacy content.
**How to avoid:** These should use `VlvtFadeRoute` (crossfade) per the requirements, since legal docs and consent screens are modal/overlay content. The existing bottom-slide is a reasonable alternative but doesn't match the phase spec.
**Warning signs:** None -- just a design decision to confirm.

### Pitfall 4: Test Flakiness from Changed Transition Timing
**What goes wrong:** Widget tests that use `pumpAndSettle()` may time out differently if transition durations change.
**Why it happens:** `pumpAndSettle()` waits for all animations to complete. If `VlvtPageRoute` has a different duration than `MaterialPageRoute`, test timing changes.
**How to avoid:** Keep the default 300ms duration (same as `MaterialPageRoute`). Both `PageRouteBuilder` and `MaterialPageRoute` default to 300ms, so no change is expected.
**Warning signs:** Tests that previously passed start timing out or failing on animation-related assertions.

### Pitfall 5: Missing a Navigation Call
**What goes wrong:** A `MaterialPageRoute` survives the migration, violating UX-03 ("all 22+ calls replaced").
**Why it happens:** Navigation calls are spread across 13+ files; easy to miss one.
**How to avoid:** After migration, run `grep -rn "MaterialPageRoute" lib/` and verify zero results. Also grep for inline `PageRouteBuilder` to ensure all are consolidated.
**Warning signs:** Inconsistent transition feel when navigating between screens.

## Code Examples

Verified patterns from official sources:

### Creating VlvtPageRoute (slide-from-right)
```dart
// Source: https://docs.flutter.dev/cookbook/animation/page-route-animation
// Source: https://api.flutter.dev/flutter/widgets/PageRouteBuilder-class.html
import 'package:flutter/material.dart';

/// Slide-from-right page transition for forward navigation.
/// Matches the app's design language with easeOutCubic curve.
class VlvtPageRoute<T> extends PageRouteBuilder<T> {
  VlvtPageRoute({
    required Widget Function(BuildContext) builder,
    super.settings,
    super.fullscreenDialog,
    super.maintainState = true,
  }) : super(
          pageBuilder: (context, animation, secondaryAnimation) =>
              builder(context),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(1.0, 0.0),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutCubic,
              )),
              child: child,
            );
          },
        );
}
```

### Creating VlvtFadeRoute (crossfade)
```dart
// Source: https://docs.flutter.dev/cookbook/animation/page-route-animation
/// Crossfade transition for modal/overlay screens.
class VlvtFadeRoute<T> extends PageRouteBuilder<T> {
  VlvtFadeRoute({
    required Widget Function(BuildContext) builder,
    super.settings,
    super.fullscreenDialog,
    super.maintainState = true,
  }) : super(
          pageBuilder: (context, animation, secondaryAnimation) =>
              builder(context),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
        );
}
```

### Replacing MaterialPageRoute (typical usage)
```dart
// BEFORE:
Navigator.push(
  context,
  MaterialPageRoute(builder: (context) => const ForgotPasswordScreen()),
);

// AFTER:
Navigator.push(
  context,
  VlvtPageRoute(builder: (_) => const ForgotPasswordScreen()),
);
```

### Replacing MaterialPageRoute with Return Type
```dart
// BEFORE:
final shouldRefresh = await Navigator.push<bool>(
  context,
  MaterialPageRoute(
    builder: (context) => ChatScreen(match: match),
  ),
);

// AFTER:
final shouldRefresh = await Navigator.push<bool>(
  context,
  VlvtPageRoute<bool>(builder: (_) => ChatScreen(match: match)),
);
```

### Replacing pushAndRemoveUntil
```dart
// BEFORE:
navigatorState.pushAndRemoveUntil(
  MaterialPageRoute(builder: (context) => MainScreen(initialTab: targetTab)),
  (route) => false,
);

// AFTER:
navigatorState.pushAndRemoveUntil(
  VlvtPageRoute(builder: (_) => MainScreen(initialTab: targetTab)),
  (route) => false,
);
```

### Replacing pushReplacement
```dart
// BEFORE:
Navigator.pushReplacement(
  context,
  MaterialPageRoute(
    builder: (context) => VerificationPendingScreen(email: email),
  ),
);

// AFTER:
Navigator.pushReplacement(
  context,
  VlvtPageRoute(builder: (_) => VerificationPendingScreen(email: email)),
);
```

### Consolidating Inline PageRouteBuilder (fade pattern)
```dart
// BEFORE (after_hours_tab_screen.dart, 4 occurrences):
Navigator.push(
  context,
  PageRouteBuilder<void>(
    pageBuilder: (context, animation, secondaryAnimation) =>
        AfterHoursChatScreen(match: match),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(opacity: animation, child: child);
    },
  ),
);

// AFTER:
Navigator.push(
  context,
  VlvtFadeRoute<void>(builder: (_) => AfterHoursChatScreen(match: match)),
);
```

### Consolidating Inline PageRouteBuilder (slide-from-right pattern)
```dart
// BEFORE (profile_screen.dart):
Navigator.of(context).push(
  PageRouteBuilder(
    pageBuilder: (context, animation, secondaryAnimation) =>
        const SafetySettingsScreen(),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(1.0, 0.0),
          end: Offset.zero,
        ).animate(CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
        )),
        child: child,
      );
    },
  ),
);

// AFTER:
Navigator.of(context).push(
  VlvtPageRoute(builder: (_) => const SafetySettingsScreen()),
);
```

## Complete Navigation Inventory

### MaterialPageRoute calls to replace (23 total)

| # | File | Line | Destination Screen | Nav Method | Return Type | Recommended Route |
|---|------|------|--------------------|------------|-------------|-------------------|
| 1 | `main.dart` | 107 | ChatScreen | push | void | VlvtPageRoute |
| 2 | `main.dart` | 125 | MainScreen | pushAndRemoveUntil | void | VlvtPageRoute |
| 3 | `deep_link_service.dart` | 102 | ResetPasswordScreen | push | void | VlvtPageRoute |
| 4 | `deep_link_service.dart` | 127 | MainScreen | push | void | VlvtPageRoute |
| 5 | `deep_link_service.dart` | 149 | ChatScreen | push | void | VlvtPageRoute |
| 6 | `auth_screen.dart` | 67 | VerificationPendingScreen | push | void | VlvtPageRoute |
| 7 | `auth_screen.dart` | 373 | ForgotPasswordScreen | push | void | VlvtPageRoute |
| 8 | `auth_screen.dart` | 388 | RegisterScreen | push | void | VlvtPageRoute |
| 9 | `auth_screen.dart` | 491 | LegalDocumentViewer (ToS) | push | void | VlvtFadeRoute |
| 10 | `auth_screen.dart` | 529 | LegalDocumentViewer (Privacy) | push | void | VlvtFadeRoute |
| 11 | `chats_screen.dart` | 556 | ChatScreen | push | bool | VlvtPageRoute |
| 12 | `chat_screen.dart` | 345 | ProfileEditScreen | push | void | VlvtPageRoute |
| 13 | `chat_screen.dart` | 782 | ProfileEditScreen | push | void | VlvtPageRoute |
| 14 | `discovery_screen.dart` | 670 | DiscoveryFiltersScreen | push | dynamic | VlvtFadeRoute |
| 15 | `discovery_screen.dart` | 701 | ProfileDetailScreen | push | void | VlvtPageRoute |
| 16 | `matches_screen.dart` | 671 | ChatScreen | push | bool | VlvtPageRoute |
| 17 | `matches_screen.dart` | 683 | ProfileDetailScreen | push | bool | VlvtPageRoute |
| 18 | `matches_screen.dart` | 712 | ProfileDetailScreen | push | void | VlvtPageRoute |
| 19 | `paywall_screen.dart` | 28 | PaywallScreen | push | void | VlvtFadeRoute |
| 20 | `profile_screen.dart` | 92 | ProfileEditScreen | push | Profile | VlvtPageRoute |
| 21 | `profile_screen.dart` | 481 | IdVerificationScreen | push | void | VlvtPageRoute |
| 22 | `register_screen.dart` | 143 | VerificationPendingScreen | pushReplacement | void | VlvtPageRoute |
| 23 | `search_screen.dart` | 138 | SearchResultsScreen | push | void | VlvtPageRoute |

### Inline PageRouteBuilder calls to consolidate (10 total)

| # | File | Line | Destination | Current Transition | Recommended Route |
|---|------|------|-------------|-------------------|-------------------|
| 1 | `after_hours_tab_screen.dart` | 169 | AfterHoursChatScreen | FadeTransition | VlvtFadeRoute |
| 2 | `after_hours_tab_screen.dart` | 322 | AfterHoursProfileScreen | FadeTransition | VlvtFadeRoute |
| 3 | `after_hours_tab_screen.dart` | 340 | AfterHoursPreferencesScreen | FadeTransition | VlvtFadeRoute |
| 4 | `after_hours_tab_screen.dart` | 579 | AfterHoursChatScreen | FadeTransition | VlvtFadeRoute |
| 5 | `discovery_screen.dart` | 946 | MatchesScreen | FadeTransition | VlvtFadeRoute |
| 6 | `profile_screen.dart` | 354 | SafetySettingsScreen | SlideTransition (right) | VlvtPageRoute |
| 7 | `profile_screen.dart` | 380 | InviteScreen | SlideTransition (right) | VlvtPageRoute |
| 8 | `safety_settings_screen.dart` | 443 | LegalDocumentViewer (Privacy) | SlideTransition (bottom) | VlvtFadeRoute |
| 9 | `safety_settings_screen.dart` | 472 | ConsentSettingsScreen | SlideTransition (bottom) | VlvtFadeRoute |
| 10 | `safety_settings_screen.dart` | 499 | LegalDocumentViewer (ToS) | SlideTransition (bottom) | VlvtFadeRoute |

### VlvtPageRoute vs VlvtFadeRoute Decision Logic

- **VlvtPageRoute** (slide-from-right): Standard forward navigation -- moving deeper into the app hierarchy (profiles, chats, settings, edit screens)
- **VlvtFadeRoute** (crossfade): Modal/overlay content -- paywall, legal documents, filters, after-hours overlays, consent settings

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `MaterialPageRoute` everywhere | Custom `PageRouteBuilder` subclasses per design system | Standard practice since Flutter 1.x | Consistent brand transitions |
| Inline `PageRouteBuilder` per call site | Shared route class extending `PageRouteBuilder` | Community best practice | DRY code, consistent timing |
| Platform-adaptive transitions (Material/Cupertino) | App-specific transitions | Design system maturity | Consistent cross-platform feel |

**Deprecated/outdated:**
- Nothing relevant -- `PageRouteBuilder`, `SlideTransition`, `FadeTransition` are stable APIs unchanged across Flutter 2.x/3.x

## Open Questions

1. **Discovery filters: slide or fade?**
   - What we know: `DiscoveryFiltersScreen` is currently `MaterialPageRoute` (default transition). It functions as a modal overlay (returns `true` when filters changed).
   - What's unclear: Is it conceptually "forward navigation" or "modal overlay"?
   - Recommendation: Use `VlvtFadeRoute` since it returns a result and acts as a transient overlay. Planner can override if desired.

2. **After Hours chat screens: should they eventually use VlvtPageRoute?**
   - What we know: Currently 4 After Hours navigations all use `FadeTransition` inline.
   - What's unclear: Whether the fade was a deliberate design choice or just the quickest custom transition available.
   - Recommendation: Keep as `VlvtFadeRoute` to match existing behavior and the After Hours "ephemeral" design feel.

## Sources

### Primary (HIGH confidence)
- [PageRouteBuilder class - Flutter API docs](https://api.flutter.dev/flutter/widgets/PageRouteBuilder-class.html) - Constructor parameters, default durations
- [MaterialPageRoute class - Flutter API docs](https://api.flutter.dev/flutter/material/MaterialPageRoute-class.html) - Class hierarchy, default behavior
- [Animate a page route transition - Flutter docs](https://docs.flutter.dev/cookbook/animation/page-route-animation) - Official cookbook pattern for custom transitions
- [Hero animations - Flutter docs](https://docs.flutter.dev/ui/animations/hero-animations) - Hero compatibility with PageRouteBuilder confirmed
- Codebase analysis - 23 MaterialPageRoute calls, 10 inline PageRouteBuilder calls, 4 Hero usage sites verified by grep

### Secondary (MEDIUM confidence)
- [Custom PageRoute breaks Hero/Focus/Semantics - Flutter issue #170913](https://github.com/flutter/flutter/issues/170913) - Confirms not to override createOverlayEntries
- [PageRouteBuilder reverseTransitionDuration - Flutter API](https://api.flutter.dev/flutter/widgets/PageRouteBuilder/reverseTransitionDuration.html) - Default 300ms same as forward

### Tertiary (LOW confidence)
- None -- all findings verified with official Flutter documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All APIs are stable Flutter SDK built-ins, verified via official docs
- Architecture: HIGH - Pattern (extending PageRouteBuilder) is standard Flutter practice with 10 existing inline examples already in the codebase
- Pitfalls: HIGH - Hero compatibility confirmed via official docs; opaque/type parameter issues documented in API reference

**Research date:** 2026-02-27
**Valid until:** 2026-06-27 (stable APIs, very slow change rate)
