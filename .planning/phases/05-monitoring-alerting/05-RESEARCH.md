# Phase 5: Monitoring & Alerting - Research

**Researched:** 2026-01-25
**Domain:** Production monitoring, error tracking, uptime monitoring, structured logging
**Confidence:** HIGH

## Summary

This research covers the six monitoring requirements (MON-01 through MON-06) for making VLVT production-ready. The codebase already has significant monitoring infrastructure in place, which simplifies implementation.

**Key findings:**
1. **Sentry is already installed and partially configured** across all three services with basic initialization
2. **Health check endpoints already exist** (basic `/health` returning `{ status: 'ok' }`)
3. **Correlation IDs are implemented** in the shared package (`generateCorrelationId()`)
4. **PII redaction is already in place** (SEC-07 complete) via Winston custom format
5. **Rate limiting exists** but lacks alerting on failure spikes

**Primary recommendation:** Enhance existing infrastructure rather than replacing it. Focus on: (1) completing Sentry configuration, (2) enriching health checks with dependency status, (3) adding brute force alerting via rate limiter hooks, (4) configuring external uptime monitoring (UptimeRobot/Better Uptime), and (5) adding correlation ID middleware to propagate IDs across request lifecycle.

## Standard Stack

The established libraries/tools for this domain. VLVT already has most of these installed.

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @sentry/node | ^10.27.0 | Error tracking & APM | Installed, needs config enhancement |
| winston | ^3.18.3 | Structured logging | Installed, needs correlation ID middleware |

### Supporting (Need to Add or Configure)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| UptimeRobot | External | Uptime monitoring | FREE tier - 50 monitors, 5-min interval |
| Better Uptime | External | Uptime + incident management | Alternative with phone alerts |
| express-winston | ^4.2.0 | Request logging middleware | For HTTP request/response logging |
| cls-hooked | ^4.2.2 | Continuation-local storage | For propagating correlation IDs across async calls |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| UptimeRobot | Pingdom | Pingdom has RUM but no free tier; UptimeRobot is free |
| UptimeRobot | Uptime Kuma (self-hosted) | More features but requires Railway template deployment |
| cls-hooked | AsyncLocalStorage (Node native) | cls-hooked is battle-tested; AsyncLocalStorage requires Node 16+ (we have 18+) |

**Installation:**
```bash
# Already have @sentry/node, winston
# No additional packages strictly required
# Optional for enhanced request logging:
npm install express-winston
```

## Architecture Patterns

### Current Implementation Pattern
The services already follow this structure:
```
src/
├── index.ts              # Sentry.init() at top, before Express
├── utils/logger.ts       # Winston with PII redaction
├── middleware/           # Rate limiters, auth
└── routes/               # API routes
```

### Pattern 1: Sentry Initialization (Current - Needs Enhancement)
**What:** Sentry must be initialized before any other imports for auto-instrumentation to work
**When to use:** Always - this is a hard requirement from Sentry
**Current code (already correct):**
```typescript
// Source: backend/profile-service/src/index.ts lines 1-14
import dotenv from 'dotenv';
dotenv.config();

import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // Already configured at 10%
  });
}
```

**Enhancement needed:** Add service name, release version, and enhanced integrations.

### Pattern 2: Health Check with Dependency Status
**What:** Health endpoints that check database and Redis connectivity
**When to use:** For robust health checks that detect downstream failures
**Example:**
```typescript
// Source: Pattern based on existing /health endpoints
app.get('/health', async (req: Request, res: Response) => {
  const checks = {
    service: 'profile-service',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    checks: {
      database: { status: 'unknown' as string, latency: 0 },
      redis: { status: 'unknown' as string, latency: 0 },
    }
  };

  // Check database
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    checks.checks.database = { status: 'ok', latency: Date.now() - start };
  } catch (err) {
    checks.checks.database = { status: 'error', latency: -1 };
    checks.status = 'degraded';
  }

  // Check Redis (if applicable)
  try {
    const start = Date.now();
    await redis.ping();
    checks.checks.redis = { status: 'ok', latency: Date.now() - start };
  } catch (err) {
    checks.checks.redis = { status: 'error', latency: -1 };
    checks.status = 'degraded';
  }

  const httpStatus = checks.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(addVersionToHealth(checks));
});
```

### Pattern 3: Correlation ID Middleware
**What:** Middleware that generates/propagates correlation IDs across the request lifecycle
**When to use:** Every request should have a correlation ID for tracing
**Example:**
```typescript
// Source: Extend existing shared/src/errors/error-response.ts pattern
import { generateCorrelationId } from '@vlvt/shared';

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use incoming correlation ID if present, otherwise generate new one
  const correlationId = req.headers['x-correlation-id'] as string || generateCorrelationId();

  // Attach to request for use in handlers
  req.correlationId = correlationId;

  // Set response header
  res.setHeader('X-Correlation-ID', correlationId);

  // Add to logger context (if using cls-hooked or AsyncLocalStorage)
  // This allows all logs in this request to include the correlation ID
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}
```

### Pattern 4: Brute Force Detection via Rate Limiter
**What:** Hook into rate limiter to alert when limits are hit frequently
**When to use:** Detect authentication attacks in real-time
**Example:**
```typescript
// Source: Extend existing shared/src/middleware/rate-limiter.ts
import * as Sentry from '@sentry/node';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many authentication attempts' },
  handler: (req, res, next, options) => {
    // Log rate limit hit
    logger.warn('Rate limit exceeded - potential brute force', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.userId,
      userAgent: req.headers['user-agent'],
    });

    // Alert Sentry for monitoring/alerting
    Sentry.captureMessage('Auth rate limit exceeded', {
      level: 'warning',
      tags: {
        type: 'brute_force_attempt',
        path: req.path,
      },
      extra: {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.status(options.statusCode).json(options.message);
  },
});
```

### Anti-Patterns to Avoid
- **Logging PII in monitoring tools:** Sentry captures request data by default - configure `beforeSend` to scrub sensitive fields
- **Over-sampling in production:** Don't use `tracesSampleRate: 1.0` in production; 0.1 (10%) is already configured and appropriate
- **Health checks that call external services:** Health checks should be fast; avoid calling third-party APIs
- **Correlation IDs in error messages to users:** Include in headers and logs, but not in user-facing error messages

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error tracking | Custom error logger | Sentry | Automatic grouping, alerts, release tracking, source maps |
| Uptime monitoring | Cron job that pings endpoints | UptimeRobot/Better Uptime | Multi-location, alerting, status pages, 99.9% uptime guarantee |
| Log aggregation | File-based log rotation | Railway logs (stdout) | Railway captures stdout automatically; file logs don't persist |
| Request tracing | Manual trace IDs | Correlation ID middleware | Consistent pattern, propagates to all logs |
| PII scrubbing | Regex in each log call | Winston format (already done) | Centralized, consistent, tested |

**Key insight:** Railway's architecture means traditional file-based logging won't work. All logs must go to stdout (already configured). Use Railway's built-in log viewer or export to external logging service for persistence.

## Common Pitfalls

### Pitfall 1: Sentry Not Capturing Express Errors
**What goes wrong:** Errors thrown in routes don't appear in Sentry
**Why it happens:** `setupExpressErrorHandler()` not called or called in wrong order
**How to avoid:** Call it AFTER all routes, BEFORE other error handlers
**Warning signs:** 500 errors in logs but not in Sentry dashboard
```typescript
// CORRECT ORDER
app.use('/api', apiRoutes);  // Routes first
Sentry.setupExpressErrorHandler(app);  // Sentry error handler
app.use(genericErrorHandler);  // Generic handler last
```

### Pitfall 2: Railway Health Checks Only Run at Deploy Time
**What goes wrong:** Assuming Railway monitors health continuously
**Why it happens:** Misunderstanding Railway's health check behavior
**How to avoid:** Use external uptime monitoring (UptimeRobot) for continuous monitoring
**Warning signs:** Service down for hours without alerts
**Source:** Railway docs explicitly state health checks only run during deployment

### Pitfall 3: Missing Correlation IDs in Async Operations
**What goes wrong:** Logs from async callbacks don't include correlation ID
**Why it happens:** Correlation ID stored in request object, lost in async context
**How to avoid:** Use AsyncLocalStorage or cls-hooked to propagate context
**Warning signs:** Some logs missing correlation IDs; unable to trace full request lifecycle

### Pitfall 4: PII Leaking to Sentry
**What goes wrong:** Email addresses, locations appear in Sentry error details
**Why it happens:** Sentry captures request body and context by default
**How to avoid:** Configure `beforeSend` to scrub sensitive fields
**Warning signs:** PII visible in Sentry dashboard
```typescript
Sentry.init({
  beforeSend(event) {
    // Scrub email addresses
    if (event.request?.data) {
      event.request.data = '[REDACTED]';
    }
    return event;
  },
});
```

### Pitfall 5: Rate Limit Alerts Creating Alert Fatigue
**What goes wrong:** Too many alerts for routine rate limiting
**Why it happens:** Alerting on every rate limit hit
**How to avoid:** Use thresholds (e.g., alert if >10 hits in 5 minutes from same IP)
**Warning signs:** Hundreds of alerts per day, team ignores them

## Code Examples

Verified patterns from existing codebase:

### Existing Sentry Error Handler (Already Implemented)
```typescript
// Source: backend/chat-service/src/index.ts lines 1542-1545
// Sentry error handler - must be after all routes but before generic error handler
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
```

### Existing Health Check (Needs Enhancement)
```typescript
// Source: backend/profile-service/src/index.ts lines 293-296
// Health check endpoint (at root - not versioned)
app.get('/health', (req: Request, res: Response) => {
  res.json(addVersionToHealth({ status: 'ok', service: 'profile-service' }));
});
```

### Existing PII Redaction (Complete)
```typescript
// Source: backend/shared/src/utils/logger.ts lines 23-42
const SENSITIVE_FIELDS = [
  // Authentication/Secrets
  'token', 'idToken', 'identityToken', 'authorization',
  // ... full list already implemented

  // Location PII - exact coordinates must never appear in logs (SEC-07)
  'latitude', 'longitude', 'lat', 'lng', 'location',

  // Message Content - private chat messages must never appear in logs (SEC-07)
  'text', 'messageText', 'message_text',
];
```

### Existing Correlation ID Generation
```typescript
// Source: backend/shared/src/errors/error-response.ts lines 74-78
export function generateCorrelationId(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = randomBytes(4).toString('hex');
  return `err-${timestamp}-${random}`;
}
```

### Existing Rate Limiter (Needs Alert Hook)
```typescript
// Source: backend/shared/src/middleware/rate-limiter.ts lines 126-130
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again after 15 minutes',
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sentry SDK v7 | Sentry SDK v10+ | 2024 | New `setupExpressErrorHandler()` API, OpenTelemetry integration |
| `tracingSampleRate` | `tracesSampleRate` | Sentry v8 | Property renamed |
| Manual trace IDs | OpenTelemetry instrumentation | 2024 | Automatic distributed tracing |
| IP-based rate limiting only | Per-user rate limiting | Already implemented | Prevents VPN-based bypass |

**Deprecated/outdated:**
- `@sentry/tracing` package: Merged into `@sentry/node` in v8+
- `requestHandler` middleware: Replaced by auto-instrumentation in v10+
- `errorHandler` middleware: Replaced by `setupExpressErrorHandler()` in v10+

## Open Questions

Things that couldn't be fully resolved:

1. **Railway log retention period**
   - What we know: Railway captures stdout logs
   - What's unclear: How long logs are retained; need to check Railway dashboard
   - Recommendation: Assume 7-day retention; consider external log shipping for longer retention if needed

2. **Sentry alert configuration**
   - What we know: Sentry supports alerts via email, Slack, webhooks
   - What's unclear: Whether free tier has alert limits; specific alert rules needed
   - Recommendation: Start with email alerts for 500 errors; configure Slack during implementation

3. **UptimeRobot vs Better Uptime**
   - What we know: Both have free tiers; UptimeRobot has 50 monitors free, Better Uptime has phone alerts
   - What's unclear: Which is preferred for the team's workflow
   - Recommendation: Start with UptimeRobot (simpler, more free monitors); migrate if phone alerts needed

## Sources

### Primary (HIGH confidence)
- **Existing codebase:** All services have Sentry installed, Winston configured, health endpoints
- [Sentry Express Documentation](https://docs.sentry.io/platforms/javascript/guides/express/) - Initialization order, error handler placement
- [Railway Health Checks Documentation](https://docs.railway.com/guides/healthchecks) - Deploy-time only behavior confirmed

### Secondary (MEDIUM confidence)
- [Winston Production Logging Guide](https://www.dash0.com/guides/winston-production-logging-nodejs) - Correlation ID patterns
- [UptimeRobot](https://uptimerobot.com/) - Free tier details, API monitoring capabilities
- [Better Uptime](https://betteruptime.com/) - Incident management features

### Tertiary (LOW confidence)
- Brute force detection patterns from security blogs - General guidance, needs validation with team's alerting preferences

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already installed and verified in package.json
- Architecture: HIGH - Patterns verified from existing codebase
- Pitfalls: HIGH - Railway health check limitation from official docs; Sentry patterns from official docs
- Uptime monitoring: MEDIUM - Tool comparison based on current (2025-2026) search results

**Research date:** 2026-01-25
**Valid until:** 2026-03-25 (60 days - stable domain, Sentry SDK version locked)
