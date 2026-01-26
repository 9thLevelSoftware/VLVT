---
phase: 05-monitoring-alerting
plan: 01
subsystem: observability
tags: [sentry, monitoring, pii-scrubbing, correlation-id, request-tracing]

dependency-graph:
  requires: []
  provides: [sentry-service-tags, sentry-pii-scrubbing, correlation-id-middleware]
  affects: [05-02, 05-03, 05-04]

tech-stack:
  added: []
  patterns: [service-tags, pii-scrubbing, request-correlation, beforeSend-callback]

key-files:
  created:
    - backend/shared/src/middleware/correlation-id.ts
  modified:
    - backend/shared/src/middleware/index.ts
    - backend/shared/src/index.ts
    - backend/auth-service/src/index.ts
    - backend/profile-service/src/index.ts
    - backend/chat-service/src/index.ts

decisions:
  - "[05-01]: Use initialScope.tags.service for Sentry dashboard grouping"
  - "[05-01]: Use RAILWAY_GIT_COMMIT_SHA for release tracking in production"
  - "[05-01]: Scrub request body, query strings, cookies, and auth headers in beforeSend"
  - "[05-01]: Correlation ID middleware placed after cookieParser, before CSRF middleware"

metrics:
  duration: "7 min"
  completed: 2026-01-25
---

# Phase 05 Plan 01: Sentry Configuration & Correlation IDs Summary

Enhanced Sentry configuration with service name tags, release tracking, and PII scrubbing; correlation ID middleware for request tracing across all microservices.

## What Was Done

### Task 1: Create correlation ID middleware in shared package

Created `backend/shared/src/middleware/correlation-id.ts`:
- Extends Express Request type with `correlationId` property
- Uses incoming `X-Correlation-ID` header if present (for service-to-service calls)
- Generates new ID using `generateCorrelationId()` from error-response module
- Sets `X-Correlation-ID` response header for client tracing

Exported from `backend/shared/src/middleware/index.ts` and main `index.ts`.

### Task 2: Enhance Sentry configuration across all services

Enhanced `Sentry.init()` in auth-service, profile-service, and chat-service:

**Service identification for dashboard grouping:**
```typescript
initialScope: {
  tags: {
    service: 'auth-service', // or profile-service, chat-service
  },
},
```

**Release tracking:**
```typescript
release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.npm_package_version || 'development',
```

**PII scrubbing via beforeSend callback:**
- Request body: `[REDACTED]` (may contain passwords, tokens, messages)
- Query strings: `[REDACTED]` (may contain tokens)
- Cookies: `{}` (contain session tokens)
- Sensitive headers (authorization, cookie, x-csrf-token): `[REDACTED]`

**Correlation ID middleware integration:**
- Added `correlationMiddleware` import from `@vlvt/shared`
- Added `app.use(correlationMiddleware)` after cookieParser, before CSRF middleware

## Files Changed

| File | Change |
|------|--------|
| backend/shared/src/middleware/correlation-id.ts | Created - correlation ID middleware |
| backend/shared/src/middleware/index.ts | Export correlationMiddleware |
| backend/shared/src/index.ts | Export correlationMiddleware from main entry |
| backend/auth-service/src/index.ts | Enhanced Sentry.init() + correlationMiddleware |
| backend/profile-service/src/index.ts | Enhanced Sentry.init() + correlationMiddleware |
| backend/chat-service/src/index.ts | Enhanced Sentry.init() + correlationMiddleware |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Service tag pattern**: Used `initialScope.tags.service` for Sentry dashboard grouping rather than a custom transport or breadcrumb approach. This is the standard Sentry pattern for multi-service applications.

2. **Release tracking**: Used `RAILWAY_GIT_COMMIT_SHA` environment variable which Railway automatically provides on deployment, with fallback to `npm_package_version` for local development.

3. **PII scrubbing**: Chose to scrub entire request body rather than selectively parsing fields. This is a defense-in-depth approach that ensures no PII leaks even if new sensitive fields are added.

4. **Middleware placement**: Correlation ID middleware placed after `cookieParser()` and before CSRF middleware. This ensures the ID is available for all subsequent middleware and route handlers.

## Verification Results

All builds successful:
- `backend/shared`: Compiles with correlation-id.ts
- `backend/auth-service`: Compiles with enhanced Sentry + correlationMiddleware
- `backend/profile-service`: Compiles with enhanced Sentry + correlationMiddleware
- `backend/chat-service`: Compiles with enhanced Sentry + correlationMiddleware

All services contain:
- `initialScope.tags.service` with correct service name
- `release` tracking configuration
- `beforeSend` PII scrubbing callback
- `correlationMiddleware` import and usage

## Next Phase Readiness

Ready to proceed with:
- 05-02: Health check endpoints (can use correlation IDs in health check responses)
- 05-03: Brute force alerting (can correlate failed attempts with correlation IDs)
- 05-04: Client-side metrics (correlation IDs enable end-to-end request tracing)
