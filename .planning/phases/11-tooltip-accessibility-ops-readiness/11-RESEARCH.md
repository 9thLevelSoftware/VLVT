# Phase 11: Tooltip Accessibility and Ops Readiness - Research

**Researched:** 2026-02-27
**Domain:** Flutter accessibility (tooltips/screen readers) + operational documentation
**Confidence:** HIGH

## Summary

Phase 11 has two independent tracks: (1) adding tooltip accessibility to all IconButtons so screen readers announce descriptive actions, and (2) creating a pre-beta operations checklist consolidating all operational prerequisites.

The accessibility track modifies the `VlvtIconButton` widget to accept a `tooltip` parameter and updates all ~35 `IconButton` instances across 19 files. The key technical challenge is avoiding duplicate screen reader announcements -- Flutter's `IconButton.tooltip` property already provides a semantic label, so wrapping an IconButton in a `Semantics` widget (as VlvtIconButton currently does in its non-outlined variant) creates duplicate TalkBack/VoiceOver announcements. The fix is to remove the redundant `Semantics` wrapper from VlvtIconButton when using Flutter's built-in `IconButton`, and use `tooltip:` as the sole accessibility mechanism. For the `outlined` variant (which uses `GestureDetector` instead of `IconButton`), `Semantics` with a `label:` must be used since `GestureDetector` has no built-in tooltip.

The ops track is documentation-only -- no code changes. It consolidates items already identified across STATE.md, PROJECT.md, and various phase summaries into a single actionable checklist.

**Primary recommendation:** Use `IconButton.tooltip` as the primary accessibility mechanism. Remove `Semantics` wrappers from around `IconButton` widgets to prevent duplicate announcements. Add `Semantics(label:)` only for custom tappable widgets (GestureDetector, Container+onTap) that lack built-in tooltip support.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| A11Y-01 | VlvtIconButton widget accepts and renders a tooltip parameter | VlvtIconButton currently has no tooltip param. Add `String? tooltip` field; pass to `IconButton.tooltip` in non-outlined variant; use in `Semantics.label` for outlined variant |
| A11Y-02 | All 20 identified IconButtons have descriptive action tooltips | Full inventory compiled: 35 IconButton instances across 19 files. ~17 already have tooltips; ~18 need tooltips added. Some use raw IconButton (not VlvtIconButton) |
| A11Y-03 | Tooltips do not create duplicate screen reader announcements | VlvtIconButton's non-outlined variant wraps `IconButton` in `Semantics(button: true)` -- this creates duplicate announcements. Remove wrapper; `IconButton.tooltip` handles semantics natively |
| OPS-01 | Pre-beta operations checklist documents all operational prerequisites | 8+ operational items identified across STATE.md, PROJECT.md, Phase 9 summaries, and CONCERNS.md. Consolidate into single checklist document |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flutter `IconButton` | SDK (3.38.3) | Built-in button with tooltip property | Tooltip property auto-provides semantic label for TalkBack/VoiceOver; no additional wrappers needed |
| Flutter `Semantics` | SDK (3.38.3) | Accessibility annotations for custom widgets | Used ONLY for GestureDetector/custom tappable widgets that lack built-in tooltip support |
| Flutter `Tooltip` | SDK (3.38.3) | Visual tooltip display on long-press | Automatically used by IconButton when tooltip property is set |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `MergeSemantics` | SDK (3.38.3) | Combine multiple semantic nodes into one | When a label + interactive control should be announced as one unit (e.g., bottom nav items) |
| `ExcludeSemantics` | SDK (3.38.3) | Remove decorative elements from accessibility tree | Already used in codebase for decorative images and animations |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `IconButton.tooltip` | `Semantics` wrapper around `IconButton` | Semantics wrapper creates duplicate announcements on Android 13+ (Flutter issues #147045, #148167). Use `tooltip:` only. |
| Manual `Tooltip` widget | `IconButton.tooltip` property | Manual Tooltip is redundant -- IconButton wraps itself in Tooltip when property is set |

**Installation:** No new dependencies needed. All accessibility features are SDK-built-in.

## Architecture Patterns

### Recommended VlvtIconButton Structure

```dart
/// An icon-only button for the VLVT design system.
class VlvtIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;
  final Color? color;
  final double size;
  final bool outlined;
  final String? tooltip;  // NEW: accessibility label

  const VlvtIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.color,
    this.size = 24,
    this.outlined = false,
    this.tooltip,         // NEW
  });

  @override
  Widget build(BuildContext context) {
    final iconColor = color ?? VlvtColors.gold;

    if (outlined) {
      // Outlined variant uses GestureDetector -- needs Semantics wrapper
      return Semantics(
        label: tooltip,
        button: true,
        enabled: onPressed != null,
        child: GestureDetector(
          onTap: onPressed,
          child: Container(/* ... existing outlined layout ... */),
        ),
      );
    }

    // Non-outlined variant: IconButton handles its own semantics via tooltip
    // Do NOT wrap in Semantics -- it causes duplicate announcements
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon),
      iconSize: size,
      color: iconColor,
      tooltip: tooltip,
    );
  }
}
```

### Pattern 1: IconButton with Tooltip (Standard Case)
**What:** Add `tooltip:` property to all `IconButton` widgets
**When to use:** Every `IconButton` in the app

```dart
// Source: Flutter API docs + DCM practical guide (2025)
IconButton(
  icon: const Icon(Icons.send),
  onPressed: _sendMessage,
  tooltip: 'Send message',  // Screen reader announces: "Send message, button"
)
```

### Pattern 2: Semantics for Custom Tappable Widgets
**What:** Wrap GestureDetector-based widgets in `Semantics`
**When to use:** Custom tappable elements that don't use Flutter material buttons

```dart
// Source: Flutter accessibility docs
Semantics(
  label: 'Sign in with Google',
  button: true,
  child: GestureDetector(
    onTap: _signInWithGoogle,
    child: /* custom button UI */,
  ),
)
```

### Pattern 3: Dynamic State Tooltips
**What:** Tooltip text changes based on widget state
**When to use:** Toggle buttons, stateful actions

```dart
// Source: DCM accessibility guide (2025)
IconButton(
  icon: Icon(isMuted ? Icons.volume_off : Icons.volume_up),
  onPressed: _toggleMute,
  tooltip: isMuted ? 'Unmute' : 'Mute',
)
```

### Anti-Patterns to Avoid

- **Wrapping IconButton in Semantics:** Creates duplicate announcements on Android 13+ with TalkBack. The tooltip property already provides the semantic label. (Flutter issues [#147045](https://github.com/flutter/flutter/issues/147045), [#148167](https://github.com/flutter/flutter/issues/148167))
- **Saying "button" in tooltip text:** Screen readers already append "button" to the announcement. "Send message" not "Send message button".
- **Empty or null tooltip on icon-only buttons:** TalkBack may announce just "button, double tap to activate" with no context for what the button does.
- **Adding both tooltip AND Semantics(label:) to same widget:** Results in the label being read twice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Screen reader labels for IconButton | Custom Semantics wrapper around IconButton | `IconButton.tooltip` property | IconButton already integrates with Tooltip widget which provides semantic label; custom wrappers create duplicate announcements |
| Visual tooltip on long-press | Custom overlay/popup | `IconButton.tooltip` property | Flutter's Tooltip handles positioning, animation, accessibility, and dismissal |
| Accessibility for bottom nav items | Custom screen reader logic | `Semantics(label:, button:, selected:)` | Already correctly implemented in main_screen.dart |

**Key insight:** Flutter's Material widgets (IconButton, FloatingActionButton, PopupMenuButton) already have built-in accessibility via their `tooltip` property. Custom wrappers actively harm accessibility by creating duplicate semantic nodes.

## Common Pitfalls

### Pitfall 1: Duplicate Screen Reader Announcements
**What goes wrong:** Wrapping `IconButton` in `Semantics(button: true)` causes TalkBack to read the button twice -- once for the Semantics node, once for the IconButton's own semantic node.
**Why it happens:** IconButton internally creates its own semantic node. Adding an outer Semantics creates a second node. TalkBack traverses both.
**How to avoid:** Use `IconButton.tooltip` as the sole accessibility mechanism. Remove any `Semantics` wrappers around `IconButton` widgets.
**Warning signs:** TalkBack says "button, double tap to activate" followed by the same label again when navigating to/from the button.

### Pitfall 2: VlvtIconButton's Existing Semantics Wrapper
**What goes wrong:** VlvtIconButton's non-outlined variant currently wraps `IconButton` in `Semantics(button: true, enabled: onPressed != null)`. This is the exact pattern that causes duplicate announcements.
**Why it happens:** The widget was created before the accessibility audit identified this as an anti-pattern.
**How to avoid:** Remove the `Semantics` wrapper from the non-outlined path. Let `IconButton.tooltip` handle accessibility.
**Warning signs:** Any VlvtIconButton without `outlined: true` is affected.

### Pitfall 3: Outlined VlvtIconButton Has No Label
**What goes wrong:** The outlined variant uses `GestureDetector` (not `IconButton`), and its current `Semantics` wrapper has no `label:` -- just `button: true`. Screen reader announces "button" with no description.
**Why it happens:** No tooltip/label mechanism exists for the outlined variant.
**How to avoid:** Pass the new `tooltip` parameter to `Semantics(label: tooltip)` in the outlined path.
**Warning signs:** Screen reader says just "button" without context.

### Pitfall 4: IconButtons in Tests Expect Semantics Wrapper
**What goes wrong:** Tests that find VlvtIconButton by looking for `Semantics` widget wrappers may break when the wrapper is removed.
**Why it happens:** Refactoring the widget tree structure affects widget test finders.
**How to avoid:** Update tests to use `find.byTooltip('label')` instead of `find.bySemanticsLabel('label')` for finding IconButtons. Note: `find.bySemanticsLabel` searches the `label` field, NOT the `tooltip` field (Flutter issue [#148167](https://github.com/flutter/flutter/issues/148167)).
**Warning signs:** Tests pass before refactor but fail after removing Semantics wrapper.

### Pitfall 5: TalkBack on Older Android Versions
**What goes wrong:** Flutter issue [#167174](https://github.com/flutter/flutter/issues/167174) (P2, open) reports TalkBack in certain Android versions does not read IconButton tooltips.
**Why it happens:** Bug in older TalkBack versions (pre-v16) with Flutter 3.29+.
**How to avoid:** Tooltip approach is still correct per Flutter docs. Test on real devices during beta validation. If TalkBack fails on target devices, fallback is `Semantics(label:, child: IconButton(...))`.
**Warning signs:** Tooltips work in VoiceOver (iOS) but not in TalkBack (Android).

## Code Examples

### Complete VlvtIconButton Refactor

```dart
// Source: Flutter IconButton API + Flutter issue #147045 resolution
class VlvtIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;
  final Color? color;
  final double size;
  final bool outlined;
  final String? tooltip;

  const VlvtIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.color,
    this.size = 24,
    this.outlined = false,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    final iconColor = color ?? VlvtColors.gold;

    if (outlined) {
      return Semantics(
        label: tooltip,
        button: true,
        enabled: onPressed != null,
        child: GestureDetector(
          onTap: onPressed,
          child: Container(
            width: size + 20,
            height: size + 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: iconColor.withValues(alpha: 0.5),
                width: 1.5,
              ),
            ),
            child: Icon(icon, size: size, color: iconColor),
          ),
        ),
      );
    }

    // No Semantics wrapper -- IconButton handles its own via tooltip
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon),
      iconSize: size,
      color: iconColor,
      tooltip: tooltip,
    );
  }
}
```

### Adding Tooltip to Existing Raw IconButton

```dart
// Before (no accessibility):
IconButton(
  icon: const Icon(Icons.arrow_back),
  onPressed: () => Navigator.pop(context),
)

// After (accessible):
IconButton(
  icon: const Icon(Icons.arrow_back),
  onPressed: () => Navigator.pop(context),
  tooltip: 'Go back',
)
```

### Tooltip Guidelines for VLVT

| Icon | Context | Tooltip Text |
|------|---------|-------------|
| `Icons.arrow_back` | AppBar leading | "Go back" |
| `Icons.close` | Modal/dialog close | "Close" |
| `Icons.send` | Chat input | "Send message" |
| `Icons.filter_list` | Discovery filter | "Filter profiles" |
| `Icons.search` | Chat search | "Search chats" |
| `Icons.sort` | Chat sort | "Sort chats" |
| `Icons.logout` | Profile/paywall | "Sign out" |
| `Icons.more_vert` | Chat options | "More options" |
| `Icons.share` | Invite share | "Share invite code" |
| `Icons.stop_circle_outlined` | After Hours | "End After Hours session" |
| `Icons.refresh` | Failed message | "Retry sending" |
| `Icons.close` (failed msg) | Failed message | "Delete failed message" |
| `Icons.calendar_today` | Chat date proposal | "Propose a date" |
| `Icons.star` / `Icons.star_border` | Feedback rating | "Rate N stars" (dynamic) |

## IconButton Inventory

### Complete List (35 instances across 19 files)

#### Already Have Tooltips (17 instances)
| File | Icon | Current Tooltip |
|------|------|----------------|
| `after_hours_chat_screen.dart:546` | arrow_back | "Go back" |
| `after_hours_tab_screen.dart:627` | stop_circle_outlined | "End After Hours session" |
| `chat_screen.dart:693` | more_vert | "More options" |
| `chat_screen.dart:991` | refresh | "Retry" |
| `chat_screen.dart:1051` | close | "Delete" |
| `chat_screen.dart:1103` | calendar_today | "Propose a Date" |
| `chats_screen.dart:623` | clear | "Clear search" |
| `chats_screen.dart:635` | search | "Search chats" |
| `chats_screen.dart:647` | sort | "Sort chats" |
| `discovery_screen.dart:762` | filter_list | "Filter profiles" |
| `discovery_screen.dart:783` | filter_list | "Filter profiles" |
| `discovery_screen.dart:825` | filter_list | "Filter profiles" |
| `discovery_screen.dart:931` | filter_list | "Filter profiles" |
| `profile_screen.dart:120` | logout | "Sign out" |
| `profile_screen.dart:141` | logout | "Sign out" |
| `register_screen.dart:261` | arrow_back | "Go back to sign in" |
| `profile_edit_screen.dart:425` | (InputChip) | "Add interest" |

#### Missing Tooltips (18 instances needing addition)
| File | Icon | Suggested Tooltip |
|------|------|-------------------|
| `after_hours_chat_screen.dart:894` | send | "Send message" |
| `after_hours_preferences_screen.dart:210` | close | "Close" |
| `after_hours_profile_screen.dart:380` | close | "Close" |
| `auth_screen.dart:466` | (OAuth - Apple) | Already has Semantics; not a raw IconButton |
| `chat_screen.dart:1120` | send | "Send message" |
| `feedback_widget.dart:207` | close | "Close" |
| `feedback_widget.dart:269` | star/star_border | "Rate N stars" (dynamic) |
| `forgot_password_screen.dart:150` | arrow_back | "Go back" |
| `id_verification_screen.dart:249` | close | "Close verification" |
| `invite_screen.dart:373` | share | "Share invite code" |
| `paywall_screen.dart:74` | arrow_back | "Go back" |
| `paywall_screen.dart:453` | arrow_back | "Go back" |
| `paywall_screen.dart:460` | logout | "Sign out" |
| `profile_detail_screen.dart:184` | arrow_back | "Go back" |
| `profile_edit_screen.dart:298` | close | "Discard changes" |
| `verification_screen.dart:183` | close | "Close verification" |
| `vlvt_button.dart` (VlvtIconButton outlined) | (varies) | Needs tooltip parameter added |
| `vlvt_button.dart` (VlvtIconButton non-outlined) | (varies) | Needs tooltip parameter + Semantics removal |

### Auth Screen Note
The `auth_screen.dart` OAuth buttons (`_buildOAuthIconButton`) are NOT standard `IconButton` widgets -- they use custom `Semantics + GestureDetector` and already have semantic labels ("Sign in with Google", "Sign in with Apple"). These are correctly implemented and should not be changed.

## Operations Checklist Inventory

### Items to Include in OPS-01 Checklist

Compiled from STATE.md, PROJECT.md, CONCERNS.md, Phase 9 summaries, and UPTIME-MONITORING.md:

| Category | Item | Source | Status |
|----------|------|--------|--------|
| **Security Keys** | Set `KYCAID_ENCRYPTION_KEY` in Railway for all services | PROJECT.md, CONCERNS.md | Not done |
| **Monitoring** | Configure UptimeRobot monitors for 3 service health endpoints | PROJECT.md, UPTIME-MONITORING.md | Not done |
| **External Services** | Configure Apple Developer Portal Services ID for Android Apple Sign-In | PROJECT.md, STATE.md | Not done (optional) |
| **Backup** | Execute backup restore test to validate runbook | PROJECT.md | Not done |
| **Backup** | Install AWS CLI and configure R2 access for backup operations | PROJECT.md | Not done |
| **Deployment** | Verify/set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` >= 15s | STATE.md, Phase 9 summaries | Not verified |
| **Deployment** | Verify Railway Custom Start Commands use `node dist/index.js` (not `npm start`) | STATE.md, PITFALLS research | Not verified |
| **Environment** | Verify all required env vars set in Railway per service (JWT_SECRET, DATABASE_URL, NODE_ENV, CORS_ORIGIN) | .env.railway.example | Should verify |

### Checklist Document Format

The checklist should be a runnable document -- each item has:
1. What to do (specific action)
2. Where to do it (Railway dashboard, CLI, etc.)
3. How to verify it worked (expected outcome)
4. Who is responsible

Recommended location: `docs/PRE-BETA-CHECKLIST.md` in the project root (accessible to ops, not just in .planning/).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Semantics` wrapper around `IconButton` | `IconButton.tooltip` property only | Flutter 3.19 (tooltip semantics order fix) | Prevents duplicate TalkBack announcements |
| Tooltip message at overlay root in semantics tree | Tooltip message as child of button in semantics tree | Flutter 3.19 (breaking change) | Tests expecting old order need updating |
| `find.bySemanticsLabel()` for tooltip text | `find.byTooltip()` for tooltip text | Flutter 3.x | `bySemanticsLabel` searches `label` not `tooltip` field |

**Deprecated/outdated:**
- Wrapping `IconButton` in `Semantics(button: true)`: Creates duplicate nodes since Flutter 3.19. Remove and use `tooltip:` property instead.

## Open Questions

1. **Exact count of "20 identified IconButtons" from success criteria**
   - What we know: The success criteria says "20 identified IconButtons" but the actual codebase has 35 `IconButton(` instances across 19 files. ~17 already have tooltips. The number "20" likely refers to the original accessibility audit count from Phase 4 which identified 20 buttons missing tooltips at the time.
   - What's unclear: Whether some IconButtons were added/fixed since the original audit count.
   - Recommendation: Use the current inventory (18 missing tooltips) rather than the historical "20" count. The success criteria intent is "all IconButtons have descriptive tooltips" regardless of exact count.

2. **VlvtIconButton adoption**
   - What we know: VlvtIconButton exists but is NOT used anywhere in screens. All 35 instances use raw Flutter `IconButton` directly.
   - What's unclear: Whether Phase 11 should migrate raw IconButtons to VlvtIconButton, or just add tooltips to existing raw IconButtons.
   - Recommendation: Focus on adding tooltips (the requirement). VlvtIconButton refactor is needed for A11Y-01 (widget accepts tooltip parameter), but mass migration of raw IconButtons to VlvtIconButton is optional and higher risk. Add tooltip parameter to VlvtIconButton AND add tooltips to raw IconButtons where they are.

3. **Feedback widget star buttons**
   - What we know: `feedback_widget.dart` has 5 dynamically generated star IconButtons with no tooltips.
   - What's unclear: Whether dynamic "Rate N stars" tooltips are sufficient or if a different pattern is needed.
   - Recommendation: Use `tooltip: 'Rate $starValue star${starValue == 1 ? "" : "s"}'` for each star button.

## Sources

### Primary (HIGH confidence)
- [Flutter IconButton API](https://api.flutter.dev/flutter/material/IconButton-class.html) -- `tooltip` property as semantic label
- [Flutter Tooltip Semantics Order Breaking Change](https://docs.flutter.dev/release/breaking-changes/tooltip-semantics-order) -- Semantics tree restructured in 3.19.0; tooltip message now child of button
- [Flutter Accessibility Docs](https://docs.flutter.dev/ui/accessibility/assistive-technologies) -- TalkBack/VoiceOver integration guidelines
- [Flutter Issue #147045](https://github.com/flutter/flutter/issues/147045) -- TalkBack duplicate announcement with Semantics wrapper; resolved with `excludeSemantics: true`
- [Flutter Issue #148167](https://github.com/flutter/flutter/issues/148167) -- `bySemanticsLabel` does not find tooltip text; tooltip stored separately from label
- VLVT codebase analysis -- 35 IconButton instances inventoried, 17 with tooltips, 18 without

### Secondary (MEDIUM confidence)
- [Practical Accessibility in Flutter (DCM, 2025)](https://dcm.dev/blog/2025/06/30/accessibility-flutter-practical-tips-tools-code-youll-actually-use) -- MergeSemantics, tooltip best practices, code examples
- [Flutter Accessibility Guide (Droids on Roids)](https://www.thedroidsonroids.com/blog/flutter-accessibility-guide-part-1) -- General Flutter accessibility patterns
- [Flutter Issue #167174](https://github.com/flutter/flutter/issues/167174) -- TalkBack tooltip not read on some Android versions (P2, open); works in TalkBack v16+

### Tertiary (LOW confidence)
- [Flutter Issue #105378](https://github.com/flutter/flutter/issues/105378) -- IconButton TalkBack reading order when only tooltip is set (no semanticLabel). Historical context; behavior may have changed in 3.19+.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Flutter SDK built-in; no third-party dependencies; well-documented API
- Architecture: HIGH -- VlvtIconButton refactor pattern verified against Flutter issues and official breaking change docs
- Pitfalls: HIGH -- Duplicate announcement issue documented in multiple Flutter issues with confirmed solutions; existing VLVT research from Phase 4 audit already identified the pattern
- Ops checklist: HIGH -- All items sourced from existing project documentation; no external research needed

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable -- Flutter SDK features, no fast-moving dependencies)
