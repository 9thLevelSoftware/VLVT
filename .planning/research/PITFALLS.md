# Domain Pitfalls: Adding Resilient DB Pools, Graceful Shutdown, Accessibility, and Page Transitions

**Domain:** Operational resilience and UX polish additions to existing dating app
**Researched:** 2026-02-27
**Confidence:** HIGH (verified against node-postgres source/issues, Flutter official docs, Railway docs, existing VLVT codebase)

---

## Critical Pitfalls

Mistakes that crash production services, cause data loss, or break existing functionality.

---

### Pitfall 1: pool.on('error') Does NOT Catch All Connection Errors

**What goes wrong:** You add `pool.on('error', handler)` and assume all database errors are caught. When Railway restarts PostgreSQL or a network partition occurs, your process still crashes with an unhandled error because checked-out clients emit errors independently of the pool.

**Why it happens:** The `pool.on('error')` handler ONLY fires for errors on **idle** clients sitting in the pool. When a client is checked out via `pool.connect()` and the connection drops, the error goes to the client, not the pool. If the client has no error handler, Node.js emits an unhandled error and crashes the process.

**VLVT-specific risk:** All three services (auth, chat, profile) currently use `pool.on('error')` at line ~199/262/288 respectively. They log the error but do NOT handle errors on checked-out clients. Any long-lived client checkout (like during a complex transaction in profile updates or batch operations) is vulnerable.

**Current code pattern that's incomplete:**
```typescript
// This ONLY catches idle client errors
pool.on('error', (err, client) => {
  logger.error('Unexpected database connection error', {
    error: err.message,
    stack: err.stack
  });
});
```

**Warning signs:**
- Process crashes with "unhandled error" after database restarts
- Sentry errors showing "connection terminated unexpectedly" without pool.on('error') logging
- Intermittent crashes during Railway cold starts or database maintenance windows

**Prevention:**
1. When using `pool.connect()` to get a client, ALWAYS attach an error handler to the client before using it
2. Prefer `pool.query()` over `pool.connect()` where possible -- pool.query internally handles client errors
3. Wrap all `pool.connect()` patterns in a helper that auto-attaches error handlers:

```typescript
async function getClient(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);

  // Attach error handler to prevent unhandled errors
  client.on('error', (err) => {
    logger.error('Client error (will be destroyed on release)', { error: err.message });
  });

  // Auto-destroy on release if error occurred
  let hasError = false;
  client.on('error', () => { hasError = true; });
  client.release = () => release(hasError);

  return client;
}
```

**Confidence:** HIGH -- verified via [node-postgres issue #2641](https://github.com/brianc/node-postgres/issues/2641), [issue #3202](https://github.com/brianc/node-postgres/issues/3202), and [official pooling docs](https://node-postgres.com/features/pooling).

---

### Pitfall 2: pool.end() Called During Shutdown Hangs Forever If Clients Are Checked Out

**What goes wrong:** Your graceful shutdown calls `pool.end()`, but there are checked-out clients (from in-flight requests). `pool.end()` waits for ALL checked-out clients to be returned before resolving. If any request is stuck or slow, the shutdown hangs until your force-kill timeout fires, causing an ungraceful exit anyway.

**Why it happens:** `pool.end()` is designed to "wait for all checked-out clients to be returned and then shut down all the clients and the pool timers." If a client is checked out and the code holding it doesn't release it (perhaps because it's mid-query or waiting on something else), `pool.end()` will never resolve.

**VLVT-specific risk:**
- **auth-service** has NO graceful shutdown handler at all -- it just calls `app.listen()` with no SIGTERM handling
- **profile-service** calls `process.exit(0)` directly after closing schedulers -- it never calls `pool.end()`, leaving connections orphaned
- **chat-service** has the most complete shutdown but never calls `pool.end()` either -- it closes the HTTP server but doesn't drain the database pool

All three services will leave orphaned database connections on every deployment.

**Warning signs:**
- Railway deploy logs showing "Process exited with signal SIGKILL" (force-killed after SIGTERM timeout)
- PostgreSQL showing "idle in transaction" connections from terminated processes
- Connection pool exhaustion after several rapid redeployments
- Health check showing database latency spikes after deployments

**Prevention:**
1. Close the HTTP server FIRST (stop accepting new requests)
2. Wait for in-flight requests to complete (with timeout)
3. THEN call `pool.end()` with a timeout wrapper
4. Force exit as last resort

```typescript
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  // 1. Stop accepting new requests
  server.close();

  // 2. Close pool with timeout
  const poolEnd = pool.end().catch(err =>
    logger.error('Error ending pool', { error: err.message })
  );

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Shutdown timeout')), 8000)
  );

  try {
    await Promise.race([poolEnd, timeout]);
  } catch {
    logger.warn('Pool did not drain in time, forcing exit');
  }

  process.exit(0);
};
```

**Confidence:** HIGH -- verified via [node-postgres pooling docs](https://node-postgres.com/features/pooling) and [issue #3287](https://github.com/brianc/node-postgres/issues/3287).

---

### Pitfall 3: Calling pool.end() More Than Once Throws an Error

**What goes wrong:** Both SIGTERM and SIGINT handlers call `pool.end()`. If both signals arrive (common during development with Ctrl+C, or if Railway sends SIGTERM followed by SIGKILL-preceded SIGTERM retry), the second call throws "Called end on pool more than once," which becomes an unhandled rejection that crashes the process.

**Why it happens:** node-postgres intentionally throws on double `pool.end()` calls as a design decision -- it's considered a programming error, not a recoverable condition.

**VLVT-specific risk:** The chat-service already registers both SIGTERM and SIGINT handlers that would both attempt cleanup. The profile-service registers them separately with identical logic. If signal handlers are updated to include `pool.end()`, both handlers calling it creates a race condition.

**Prevention:**
1. Use a shutdown guard flag:
```typescript
let isShuttingDown = false;
const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  // ... cleanup
};
```
2. Never call `pool.end()` from error event handlers or unhandledRejection handlers -- they can fire multiple times

**Confidence:** HIGH -- verified via [node-postgres issue #1858](https://github.com/brianc/node-postgres/issues/1858).

---

### Pitfall 4: Railway Kills Process Before Shutdown Completes When Started Via npm

**What goes wrong:** Services started via `npm start` or `yarn start` don't receive SIGTERM properly on Railway. The package manager intercepts the signal, forwards it to the child process, but immediately exits itself. Railway sees the parent process exit and kills the container, terminating the Node.js process mid-shutdown.

**Why it happens:** npm/yarn become PID 1 in the container. When they receive SIGTERM, they forward it to child processes but do NOT wait for them to exit. Railway sees PID 1 exit and terminates the container.

**VLVT-specific risk:** All three services likely use `npm start` in their Railway deploy configuration. Any graceful shutdown logic added will be ineffective if the start command isn't changed to invoke Node directly.

**Warning signs:**
- Shutdown logs never appear in Railway despite SIGTERM handlers being registered
- `pool.end()` never completes
- "Process exited unexpectedly" in Railway deployment logs

**Prevention:**
1. Change Railway Custom Start Command from `npm start` to `node dist/index.js` (or equivalent compiled output path)
2. Verify this is configured for ALL three services
3. Test by checking Railway logs for shutdown log messages during a redeploy

**Confidence:** HIGH -- verified via [Railway SIGTERM documentation](https://docs.railway.com/deployments/troubleshooting/nodejs-sigterm).

---

### Pitfall 5: Custom PageRouteBuilder Breaks Existing Hero Animations

**What goes wrong:** You replace `MaterialPageRoute` with a custom `PageRouteBuilder` or `VlvtPageRoute` for consistent transitions. The Hero animations between chats_screen (avatar) and chat_screen (avatar) stop working because the custom route doesn't maintain the same opaque/fullscreen properties that Hero requires.

**Why it happens:** Hero animations require the route to be a `PageRoute` (not just a `Route`) and the route must have `opaque: true` and `maintainState: true`. If your custom route class doesn't extend `PageRoute` or overrides these incorrectly, the Hero animation framework skips the animation entirely with no error -- it just silently stops working.

**VLVT-specific risk:** The app has active Hero animations on:
- `discovery_profile_card.dart` line 136: `Hero(tag: 'discovery_${profile.userId}')`
- `chats_screen.dart` line 473: `Hero(tag: 'avatar_$otherUserId')`
- `chat_screen.dart` line 608: `Hero(tag: 'avatar_$_otherUserId')`

The chat avatar Hero animation (chats_screen -> chat_screen) uses `MaterialPageRoute` today. If this is switched to a custom route class, the avatar fly-in animation will silently break.

**Warning signs:**
- Profile images that used to animate between screens now just appear/disappear
- No errors in console -- Hero silently degrades to no animation
- Regression only noticed by visual inspection, not tests

**Prevention:**
1. Custom route class MUST extend `MaterialPageRoute` or `PageRoute`, not just `PageRouteBuilder`
2. Verify `opaque: true` and `maintainState: true` are preserved
3. Test Hero animations explicitly after migration:
   - Discovery card -> profile detail (discovery Hero tag)
   - Chat list -> chat screen (avatar Hero tag)
4. If using `PageRouteBuilder`, wrap in a class that properly sets these properties:

```dart
class VlvtPageRoute<T> extends PageRoute<T> {
  final WidgetBuilder builder;
  final Duration transitionDuration;

  VlvtPageRoute({
    required this.builder,
    this.transitionDuration = const Duration(milliseconds: 300),
    super.settings,
  });

  @override
  bool get opaque => true;

  @override
  bool get maintainState => true;

  @override
  Widget buildPage(BuildContext context, Animation<double> animation,
      Animation<double> secondaryAnimation) {
    return builder(context);
  }

  @override
  Widget buildTransitions(BuildContext context, Animation<double> animation,
      Animation<double> secondaryAnimation, Widget child) {
    return FadeTransition(opacity: animation, child: child);
  }
}
```

**Confidence:** HIGH -- verified via [Flutter Hero animation docs](https://docs.flutter.dev/cookbook/animation/page-route-animation) and [Flutter issue #25261](https://github.com/flutter/flutter/issues/25261).

---

## Moderate Pitfalls

Mistakes that cause bugs, poor UX, or maintenance headaches but won't crash production.

---

### Pitfall 6: Adding Tooltip to IconButton That Already Has Semantics Wrapper Creates Duplicate Announcements

**What goes wrong:** You add `tooltip: 'Settings'` to an IconButton, but the IconButton is already wrapped in a `Semantics(label: 'Settings')` widget. TalkBack/VoiceOver announces the element twice -- once for the Semantics label, once for the tooltip -- confusing screen reader users.

**VLVT-specific risk:** The codebase already has Semantics wrappers in several places:
- `discovery_action_buttons.dart` lines 33, 54, 78: Semantics wrapping action buttons
- `vlvt_button.dart` lines 276, 327, 352: Semantics on custom buttons
- `main_screen.dart` line 265: Semantics on navigation items
- `matches_screen.dart` lines 279, 496: Semantics on match cards

If tooltips are added to the 20 IconButtons identified in the audit, any that already have a Semantics ancestor will create duplicate announcements.

**Warning signs:**
- TalkBack reads "Settings button. Settings." -- the label twice in different forms
- Accessibility Scanner flags "Duplicate content description" warnings
- Screen reader users report confusing navigation

**Prevention:**
1. Audit each IconButton BEFORE adding tooltip -- check if it or an ancestor already has Semantics
2. If Semantics wrapper exists, REMOVE it and use tooltip instead (tooltip provides both visual and semantic accessibility)
3. Never combine `Semantics(label: X)` parent with `IconButton(tooltip: X)` child for the same element
4. Run Android Accessibility Scanner after changes to catch duplicates
5. Use `flutter test --tags accessibility` if accessibility tests exist

**Confidence:** HIGH -- verified via [Flutter issue #148167](https://github.com/flutter/flutter/issues/148167) and practical Flutter accessibility guides.

---

### Pitfall 7: Tooltip Semantics Traversal Order Change (Flutter 3.19+ Breaking Change)

**What goes wrong:** If the app has accessibility tests that assert the semantics tree structure when tooltips are visible, they fail after upgrading to Flutter 3.19+ because the tooltip message node moved from being a root-level sibling to being a child of the tooltip's child node.

**Why it happens:** Flutter PR #134921 changed the semantics tree so that `Tooltip.message` is visited immediately after `Tooltip.child` during accessibility focus traversal, rather than appearing as a separate overlay entry.

**VLVT-specific risk:** The project uses Flutter 3.38+ (based on `RadioGroup<T>` usage noted in project memory). The breaking change from 3.19 is already in effect. If existing accessibility tests reference tooltip positions in the semantics tree, they may already be broken or may break when new tooltip tests are added with incorrect assumptions about tree structure.

**Prevention:**
1. When writing tests for tooltips, use `containsSemantics(tooltip: 'X')` rather than asserting specific tree positions
2. Do NOT use `find.bySemanticsLabel()` to find tooltips -- use `find.byTooltip()` instead
3. Review the [Flutter breaking change guide](https://docs.flutter.dev/release/breaking-changes/tooltip-semantics-order) for expected tree structure

**Confidence:** HIGH -- verified via [Flutter official breaking changes docs](https://docs.flutter.dev/release/breaking-changes/tooltip-semantics-order).

---

### Pitfall 8: Tooltip on Android Not Read by TalkBack Without Proper Configuration

**What goes wrong:** You add tooltips to all 20 IconButtons, but TalkBack only says "Button" without reading the tooltip text. The tooltip is visually correct but completely invisible to screen readers.

**Why it happens:** Two conditions must be met for TalkBack to read tooltips:
1. `Tooltip(excludeFromSemantics: false)` -- this is the default, but if someone sets it to true, the tooltip becomes invisible to screen readers
2. The child Icon widget needs a `semanticLabel` -- if the Icon's semanticLabel is null and the tooltip is the only accessibility info, TalkBack may not announce it correctly on some Android versions

**VLVT-specific risk:** IconButton's `tooltip` property wraps the button in a `Tooltip` widget internally. This should work correctly IF the Icon inside has no conflicting `semanticLabel`. However, if Icons were previously given `semanticLabel` properties as a different accessibility approach, and then tooltips are also added, TalkBack behavior becomes unpredictable.

**Prevention:**
1. When adding `tooltip:` to IconButton, also check the Icon child's `semanticLabel`
2. If Icon has a semanticLabel, set it to `null` and let the tooltip handle accessibility
3. Test with TalkBack on a real Android device (emulator TalkBack is unreliable for this)
4. Verify with: Settings > Accessibility > TalkBack, then swipe through the screen

**Confidence:** MEDIUM -- verified via [Flutter issue #162509](https://github.com/flutter/flutter/issues/162509), but behavior varies across Android versions.

---

### Pitfall 9: Inconsistent Transition Directions When Mixing MaterialPageRoute and Custom Routes

**What goes wrong:** Some screens use `MaterialPageRoute` (slide from right on iOS, fade on Android), while others use custom `PageRouteBuilder` with `FadeTransition`. The app feels inconsistent -- some screens slide in, others fade in. Worse, `Navigator.pop()` plays the reverse of whichever transition was used to push, so the back animation doesn't match expectations.

**VLVT-specific risk:** The codebase currently has a MIX of both patterns:
- `MaterialPageRoute` used in: auth_screen.dart (6 places), chats_screen.dart, chat_screen.dart, matches_screen.dart, discovery_screen.dart, paywall_screen.dart, deep_link_service.dart
- `PageRouteBuilder` with FadeTransition used in: after_hours_tab_screen.dart (4 places), discovery_screen.dart (1 place)

If the migration is partial -- only updating some routes to VlvtPageRoute while leaving others as MaterialPageRoute -- the user experience becomes jarring. Navigating from a fade-transition screen and popping back plays a fade-out, while navigating from a slide-transition screen and popping back plays a slide-out.

**Prevention:**
1. Migrate ALL routes in a single pass, not incrementally
2. Use `grep -r "MaterialPageRoute\|PageRouteBuilder" frontend/lib/` to find all instances
3. Count expected: ~25 MaterialPageRoute + ~5 PageRouteBuilder = ~30 total routes to migrate
4. Create VlvtPageRoute and VlvtFadeRoute first, then do a search-and-replace pass
5. Test navigation chains: push A -> push B -> pop to A -> pop to root -- all should have consistent animation

**Confidence:** HIGH -- directly observable from codebase analysis.

---

### Pitfall 10: Navigator.pop() Return Values Break When Route Type Changes

**What goes wrong:** Several screens use `Navigator.push<bool>()` and `Navigator.pop(context, true)` to communicate results back. When you change the route class, if the generic type parameter is lost or the pop semantics change, the calling screen silently receives `null` instead of the expected return value.

**VLVT-specific risk:** Multiple screens rely on pop return values:
- `discovery_screen.dart` line 668: `final result = await Navigator.push<bool>(...)` -- expects bool result
- `matches_screen.dart` line 669: `final shouldRefresh = await Navigator.push<bool>(...)` -- refresh control
- `matches_screen.dart` line 681: `final didLike = await Navigator.push<bool>(...)` -- like result
- `chats_screen.dart` line 554: `await Navigator.push<bool>(...)` -- navigation result

If the custom route class doesn't properly preserve the `<T>` generic type, these `await` calls may return `null` or throw, breaking the refresh/navigation logic.

**Prevention:**
1. Custom route class must be generic: `class VlvtPageRoute<T> extends PageRoute<T>`
2. Test all screens that use `Navigator.push<bool>` or `Navigator.push<T>` after migration
3. Specifically test: go to chat screen -> perform action -> pop back -> verify parent screen updates correctly

**Confidence:** HIGH -- directly observable from codebase analysis showing typed push/pop patterns.

---

### Pitfall 11: Shared Module (vlvt/shared) Growing Beyond Its Purpose When Adding DB Resilience

**What goes wrong:** To avoid duplicating the resilient pool logic across three services, you put `createResilientPool()` in `@vlvt/shared`. This makes sense. But then you also put service-specific health check logic, reconnection policies, and pool monitoring there. Now every change to pool behavior requires rebuilding shared and redeploying ALL three services.

**Why it happens:** The "I was taught to share" antipattern -- developers default to putting shared code in a shared library because it reduces duplication. But shared libraries in microservices create tight coupling. A bug in the shared pool module crashes all three services simultaneously instead of just one.

**VLVT-specific risk:** `@vlvt/shared` already has 22+ exports including middleware, auth, rate limiting, CSRF, FCM, audit logging, API versioning, and more. It's already a heavy shared dependency. Adding pool management would increase the blast radius further.

**Prevention:**
1. Put pool creation and configuration in shared -- this is infrastructure utility code that rarely changes
2. Do NOT put retry policies, reconnection timing, or service-specific health check thresholds in shared
3. Each service should own its own pool instance and its own shutdown sequence
4. Consider: if you change the reconnection delay from 5s to 10s for chat-service only, can you do it without touching shared?
5. Rule of thumb: shared module = "how to create" (factory). Service = "how to configure and use" (policy)

**Confidence:** MEDIUM -- this is an architectural judgment call; the existing shared module works well for its current scope, but pool resilience sits on the boundary between "utility" and "policy."

---

## Minor Pitfalls

Issues that waste time or cause confusion but have small user impact.

---

### Pitfall 12: pool.on('error') Handler That Calls process.exit() Prevents Automatic Recovery

**What goes wrong:** The node-postgres documentation example shows `process.exit(-1)` inside the pool error handler. Developers copy this pattern. Now, when a single idle client loses its connection (which is recoverable -- the pool creates new clients automatically), the entire process exits unnecessarily.

**Why it happens:** The original documentation example was a conservative safety measure. But the pg Pool is designed to recover from individual client failures. The pool removes the errored client and creates a new one on the next query. Exiting on every idle client error turns a self-healing situation into a service restart.

**VLVT-specific risk:** The current code does NOT call `process.exit()` in the error handler (it only logs), which is actually correct. The risk is that during the v2.0 resilience work, someone "improves" the handler by adding exit behavior based on the official docs example.

**Prevention:**
1. Log the error and let the pool self-heal for transient errors
2. Only exit on FATAL errors that indicate the pool cannot recover (e.g., authentication failures, SSL configuration errors)
3. Track consecutive error count -- exit only if errors exceed a threshold (e.g., 5 errors in 60 seconds)

**Confidence:** HIGH -- verified via [node-postgres issue #2641](https://github.com/brianc/node-postgres/issues/2641) where the maintainer confirmed pool self-heals from individual client errors.

---

### Pitfall 13: Health Check SELECT 1 During Reconnection Window Returns False Positive "degraded"

**What goes wrong:** Health checks use `pool.query('SELECT 1')` to verify database connectivity. During a reconnection window (after database restart), this query fails, and the health check marks the service as degraded. UptimeRobot triggers an alert. 30 seconds later, the pool has automatically reconnected and everything is fine. You now have alert noise on every database maintenance window.

**VLVT-specific risk:** All three services have health check endpoints using `pool.query('SELECT 1')`. Railway database maintenance causes brief connection drops. UptimeRobot is configured to monitor these endpoints. Without hysteresis, every maintenance window generates false alerts.

**Prevention:**
1. Health check should retry once before marking degraded:
```typescript
try {
  await pool.query('SELECT 1');
  health.checks.database.status = 'ok';
} catch (firstError) {
  // Retry after 1 second to handle transient reconnection
  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    await pool.query('SELECT 1');
    health.checks.database.status = 'ok'; // Recovered
  } catch {
    health.checks.database.status = 'error'; // Confirmed failure
  }
}
```
2. Configure UptimeRobot to require 2-3 consecutive failures before alerting
3. Consider separate liveness (just "process is running") and readiness (including database) endpoints

**Confidence:** MEDIUM -- health check patterns are well-established, but the specific UptimeRobot behavior depends on configuration.

---

### Pitfall 14: Page Transition Duration Mismatch with Hero Animation Duration

**What goes wrong:** You set a custom transition duration on your page route (e.g., 500ms fade) but the Hero animation uses its own default duration (300ms). The Hero animation completes while the page is still fading in, creating a visual disconnect where the Hero "arrives" but the rest of the page is still appearing.

**Prevention:**
1. Match the route's `transitionDuration` to the Hero's animation expectations
2. Default `MaterialPageRoute` uses 300ms -- if your custom route differs, test Hero animations explicitly
3. For fade routes where Hero doesn't apply, duration mismatch is less noticeable

**Confidence:** MEDIUM -- this is a known UX issue but severity depends on specific duration choices.

---

### Pitfall 15: Not Handling the "Already Ended Pool" State in Health Checks During Shutdown

**What goes wrong:** During graceful shutdown, you call `pool.end()`. While the pool is draining, a health check request arrives (Railway/UptimeRobot may hit the health endpoint during shutdown). The health check tries `pool.query('SELECT 1')` on an ended pool and throws "Cannot use a pool after calling end on the pool," which becomes an unhandled error.

**Prevention:**
1. Set a flag when shutdown begins and have the health check return 503 immediately:
```typescript
let isShuttingDown = false;

app.get('/health', async (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  // ... normal health check
});
```
2. Close the HTTP server before calling pool.end() -- if the server is closed, health check requests won't arrive
3. This is another reason to sequence shutdown correctly: server.close() THEN pool.end()

**Confidence:** HIGH -- verified via [node-postgres issue #1635](https://github.com/brianc/node-postgres/issues/1635).

---

## Integration Pitfalls

Mistakes specific to how these features interact with each other and the existing system.

---

### Pitfall 16: Resilient Pool + Graceful Shutdown Ordering Creates a Deadlock

**What goes wrong:** The resilient pool has an auto-reconnection timer that periodically checks connectivity. During shutdown, `pool.end()` is called, but the reconnection timer fires, tries to create a new connection on an ended pool, throws an error, and either crashes the shutdown or prevents clean exit.

**Prevention:**
1. Cancel ALL timers and intervals BEFORE calling pool.end()
2. Shutdown sequence must be: stop timers -> close HTTP server -> drain pool -> exit
3. Use `clearInterval()` on any reconnection monitoring timers
4. Test shutdown with a temporarily unreachable database to verify the reconnection timer doesn't interfere

**Confidence:** MEDIUM -- this is a design-time risk that depends on how reconnection monitoring is implemented.

---

### Pitfall 17: auth-service Has No Graceful Shutdown At All

**What goes wrong:** While adding pool resilience and shutdown to chat-service and profile-service, you forget that auth-service has zero shutdown handling. It just calls `app.listen()` and never registers SIGTERM/SIGINT handlers. Auth-service currently survives because Railway force-kills it, but once pool.end() is needed for clean connection cleanup, auth-service will leak connections on every deploy.

**VLVT-specific evidence:** auth-service `index.ts` ends at line ~3704 with just:
```typescript
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Auth service started`, { port: PORT, ... });
  });
}
```
No SIGTERM handler. No SIGINT handler. No pool.end(). No cleanup.

**Prevention:**
1. Add shutdown handlers to ALL three services, not just the ones that already have partial handlers
2. Use a checklist: for each service, verify SIGTERM handler, SIGINT handler, server.close(), pool.end(), timer cleanup
3. Consider a shared shutdown utility in `@vlvt/shared` that accepts a list of cleanup functions

**Confidence:** HIGH -- directly verified from codebase.

---

### Pitfall 18: profile-service Shutdown Doesn't Close HTTP Server or Pool

**What goes wrong:** profile-service's SIGTERM handler closes schedulers but calls `process.exit(0)` without closing the HTTP server or the database pool. In-flight requests are terminated mid-response. Database connections are orphaned.

**VLVT-specific evidence:** profile-service `index.ts` lines 1834-1848:
```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closeMatchingScheduler();
  await closeSessionScheduler();
  await closeSessionCleanupJob();
  process.exit(0);  // <-- Kills everything immediately
});
```

Missing: `server.close()`, `pool.end()`, Socket.IO cleanup.

**Prevention:**
1. Capture the server reference from `app.listen()` (currently discarded)
2. Add server.close() and pool.end() before process.exit()
3. Add a force-exit timeout (the chat-service already has this pattern -- reuse it)

**Confidence:** HIGH -- directly verified from codebase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Resilient DB pool | Pool error handler doesn't catch checked-out client errors (Pitfall 1) | Use pool.query() where possible; attach error handlers to checked-out clients |
| Resilient DB pool | process.exit() in error handler prevents self-healing (Pitfall 12) | Log only; exit on threshold of consecutive failures |
| Graceful shutdown | pool.end() hangs on checked-out clients (Pitfall 2) | Race pool.end() with a timeout; close server first to drain requests |
| Graceful shutdown | Double pool.end() from dual signal handlers (Pitfall 3) | Guard flag to prevent re-entry |
| Graceful shutdown | Railway npm start prevents SIGTERM delivery (Pitfall 4) | Change start command to `node dist/index.js` |
| Graceful shutdown | auth-service has zero shutdown handling (Pitfall 17) | Must add from scratch, not just update existing handlers |
| Graceful shutdown | profile-service doesn't close server or pool (Pitfall 18) | Add full shutdown sequence, capture server reference |
| Tooltip accessibility | Duplicate announcements from Semantics + Tooltip (Pitfall 6) | Audit each IconButton for existing Semantics before adding tooltip |
| Tooltip accessibility | TalkBack not reading tooltip on Android (Pitfall 8) | Remove conflicting Icon semanticLabel; test on real device |
| Page transitions | Hero animation silently breaks with custom routes (Pitfall 5) | Custom route must extend PageRoute with opaque=true |
| Page transitions | Navigator.pop return values lost (Pitfall 10) | Custom route must preserve generic type parameter |
| Page transitions | Inconsistent mix of transition styles (Pitfall 9) | Migrate all routes in single pass |
| Shared module | Pool logic in shared increases coupling blast radius (Pitfall 11) | Put factory in shared, policy in each service |

## Recommended Ordering

Based on dependency analysis:

1. **Resilient DB pool** first -- the pool module is a prerequisite for graceful shutdown (shutdown needs to call pool.end())
2. **Graceful shutdown** second -- depends on the pool being properly managed; also fix Railway start commands
3. **Page transitions** third -- no backend dependency; can be done independently
4. **Tooltip accessibility** fourth -- no dependency on other features; lowest risk

## Sources

### node-postgres (pg Pool)
- [Official pooling documentation](https://node-postgres.com/features/pooling) -- HIGH confidence
- [Issue #2641: pool.on('error') behavior](https://github.com/brianc/node-postgres/issues/2641) -- HIGH confidence
- [Issue #3202: Error handling docs gaps](https://github.com/brianc/node-postgres/issues/3202) -- HIGH confidence
- [Issue #1858: Double pool.end()](https://github.com/brianc/node-postgres/issues/1858) -- HIGH confidence
- [Issue #1635: Pool after end](https://github.com/brianc/node-postgres/issues/1635) -- HIGH confidence
- [Issue #3287: pool.end() doesn't wait](https://github.com/brianc/node-postgres/issues/3287) -- HIGH confidence

### Railway Deployment
- [Railway SIGTERM documentation](https://docs.railway.com/deployments/troubleshooting/nodejs-sigterm) -- HIGH confidence

### Express Graceful Shutdown
- [Express health checks and graceful shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) -- HIGH confidence
- [OneUptime: Building graceful shutdown handler](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view) -- MEDIUM confidence

### Flutter Accessibility
- [Flutter Tooltip semantics breaking change](https://docs.flutter.dev/release/breaking-changes/tooltip-semantics-order) -- HIGH confidence
- [Flutter issue #148167: IconButton semantics label](https://github.com/flutter/flutter/issues/148167) -- HIGH confidence
- [Flutter issue #162509: Tooltip not read by TalkBack](https://github.com/flutter/flutter/issues/162509) -- HIGH confidence
- [DCM: Practical Accessibility in Flutter](https://dcm.dev/blog/2025/06/30/accessibility-flutter-practical-tips-tools-code-youll-actually-use) -- MEDIUM confidence

### Flutter Navigation
- [Flutter page route animation cookbook](https://docs.flutter.dev/cookbook/animation/page-route-animation) -- HIGH confidence
- [Flutter Hero animation with PageRouteBuilder](https://dev.to/jedipixels/flutter-hero-animation-and-pageroutebuilder-transition-30b4) -- MEDIUM confidence
- [Flutter issue #25261: Hero with pushNamed](https://github.com/flutter/flutter/issues/25261) -- HIGH confidence

### Microservices Shared Libraries
- [Shared libraries in microservices -- avoiding an antipattern](https://medium.com/@shanthi.shyju/shared-libraries-in-microservices-avoiding-an-antipattern-c9a3161276e) -- MEDIUM confidence
- [O'Reilly: Microservices antipatterns and pitfalls](https://www.oreilly.com/content/microservices-antipatterns-and-pitfalls/) -- HIGH confidence
