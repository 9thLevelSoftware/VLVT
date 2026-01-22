# Codebase Concerns

**Analysis Date:** 2026-01-22

## Status Summary

**Critical issues remaining:** 1
**High severity issues:** 1
**Medium severity issues:** 1
**Resolved since last audit:** 6 issues fixed (ID collision, message pagination, block enforcement, refresh token response, discovery randomization, webhook auth)

---

## Critical Unresolved Issues

### TLS Certificate Validation Disabled for Railway Database Connections

**Issue:** Database connections disable certificate verification when Railway is detected.

**Files:**
- `backend/auth-service/src/index.ts:107-109`
- `backend/profile-service/src/index.ts:153-155`
- `backend/chat-service/src/index.ts:153-155`

**Impact:**
- Susceptible to man-in-the-middle attacks on compromised networks
- Violates TLS best practices and OWASP guidelines
- No protection against certificate spoofing

**Current Code:**
```typescript
ssl: process.env.DATABASE_URL?.includes('railway')
  ? { rejectUnauthorized: false }
  : false,
```

**Fix Approach:**
1. Enable `rejectUnauthorized: true` by default
2. Obtain Railway CA bundle or certificate chain
3. Pass CA via `ca` option in SSL config
4. Test connection with proper certificate validation
5. Update documentation in `docs/DATABASE_SSL.md` with the correct setup

**Priority:** High - Required for production compliance

---

## High Severity Unresolved Issues

### Service Index Files Are Monolithic and Complex

**Issue:** Each service has a single 2,000+ line index.ts file containing all routing logic, validation, and business logic.

**Files:**
- `backend/auth-service/src/index.ts` (2965 lines)
- `backend/profile-service/src/index.ts` (~2000+ lines)
- `backend/chat-service/src/index.ts` (~1800+ lines)

**Impact:**
- Difficult to test individual endpoints in isolation
- High cognitive load for developers
- Increased risk of regressions when modifying routes
- Poor separation of concerns
- Hard to find and fix bugs across related routes
- Difficult to reuse business logic across services

**Safe Modification:**
Extract route handlers into separate modules without refactoring:
```
src/
├── index.ts                 (init and middleware setup only)
├── routes/
│   ├── auth.ts             (all auth endpoints)
│   ├── profiles.ts         (all profile endpoints)
│   └── [other routes].ts
├── handlers/
│   └── [endpoint handlers]
```

**Test Coverage Gap:** No unit tests for individual route handlers; integration tests depend on full app startup

**Priority:** Medium - Architectural cleanup, non-blocking for feature development

---

## Medium Severity Unresolved Issues

### Optional KYCAID Encryption Creates Plaintext Storage Path

**Issue:** KYCAID PII (name, DOB, document number) is stored in plaintext when `KYCAID_ENCRYPTION_KEY` is not set.

**Files:**
- `backend/auth-service/src/index.ts:2431-2479`

**Current Behavior:**
```typescript
if (encryptionKey) {
  // ... encrypted storage
} else {
  logger.warn('KYCAID_ENCRYPTION_KEY not set - storing PII in plaintext...');
  // Stores PII plaintext columns: first_name, last_name, date_of_birth, document_number
}
```

**Impact:**
- GDPR/regulatory non-compliance
- Sensitive PII exposed in database backups
- Database breach exposes identity verification data
- No audit trail of when plaintext path was used

**Fix Approach:**
1. Require `KYCAID_ENCRYPTION_KEY` environment variable (fail-closed)
2. Add startup validation: if KYC is enabled but key is missing, error and exit
3. Migrate existing plaintext records to encrypted storage
4. Remove plaintext column storage option entirely

**Priority:** High for production; Medium for development flexibility

---

## Recently Resolved Issues (Since Last Review)

### ID Generation via Date.now() Can Collide Under Concurrency ✓ FIXED

**Resolution:** UUIDs implemented in `backend/chat-service/src/utils/id-generator.ts` and `backend/profile-service/src/utils/id-generator.ts`

```typescript
export function generateMatchId(): string {
  return `match_${uuidv4()}`;
}
export function generateMessageId(): string {
  return `msg_${uuidv4()}`;
}
```

---

### Messages Endpoint Returns Unbounded Results ✓ FIXED

**Resolution:** Pagination with cursor-based navigation added to `backend/chat-service/src/index.ts:425-510`

```typescript
const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 50, 100));
const before = req.query.before as string; // ISO timestamp cursor
// ... query with LIMIT and pagination info returned
```

---

### Blocked Users Can Still Send Messages via REST API ✓ FIXED

**Resolution:** Block check added to REST endpoint at `backend/chat-service/src/index.ts:553-572`

```typescript
const blockCheck = await pool.query(
  `SELECT 1 FROM blocks
   WHERE (user_id = $1 AND blocked_user_id = $2)
      OR (user_id = $2 AND blocked_user_id = $1)
   LIMIT 1`,
  [authenticatedUserId, recipientId]
);
```

Block enforcement now consistent between Socket.IO and REST paths.

---

### Refresh Token Not Returned After Refresh ✓ FIXED

**Resolution:** Token rotation implemented at `backend/auth-service/src/index.ts:740-803`

```typescript
const newRefreshToken = generateRefreshToken();
// ... store in database with token rotation
res.json({
  success: true,
  accessToken,
  refreshToken: newRefreshToken, // Now returns rotated token
  expiresIn: 15 * 60
});
```

---

### Discovery Randomization Never Applied ✓ FIXED

**Resolution:** Randomized ordering added to `backend/profile-service/src/index.ts:1239-1246`

```typescript
discoveryQuery = `
  SELECT ...
  FROM profiles
  WHERE ${whereClause}
  ORDER BY
    CASE WHEN created_at > NOW() - INTERVAL '48 hours' THEN 0 ELSE 1 END,
    RANDOM()     // <-- Randomization now applied
  LIMIT ${limit}
`;
```

---

### RevenueCat Webhook Accepts Unauthenticated Requests ✓ FIXED

**Resolution:** Webhook auth now required and validated at `backend/auth-service/src/index.ts:2720-2736`

```typescript
app.post('/auth/revenuecat/webhook', express.json(), async (req: Request, res: Response) => {
  const webhookAuth = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!webhookAuth) {
    logger.error('REVENUECAT_WEBHOOK_AUTH not configured - rejecting request');
    return res.status(503).json({
      success: false,
      error: 'Webhook not configured'
    });
  }
  // Timing-safe comparison
  if (!authHeader || !timingSafeEqual(authHeader, webhookAuth)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
});
```

---

## Data Protection Issues

### Profile Photo Cleanup on Deletion ✓ FIXED

**Resolution:** R2 photo deletion now called at `backend/profile-service/src/index.ts:550-555`

```typescript
if (photos.length > 0) {
  deleteUserPhotos(requestedUserId, photos).catch((error) => {
    logger.error('Background R2 cleanup failed', { userId: requestedUserId, error });
  });
}
```

---

### Location Precision in Logs ✓ FIXED

**Resolution:** Precise coordinates redacted before logging at `backend/profile-service/src/index.ts:619-625`

```typescript
const redacted = redactCoordinates(latitude, longitude);
logger.info('Location updated', {
  userId: requestedUserId,
  // Log only city-level precision to protect user privacy
  latitude: redacted.latitude,
  longitude: redacted.longitude
});
```

---

## Test Coverage Gaps

**Missing Test Coverage:**
- Refresh token rotation with reuse detection under concurrent requests
- KYCAID plaintext vs. encrypted storage paths (no explicit test for encryption key requirement)
- Database SSL configuration with proper CA verification
- Discovery endpoint randomization output validation (no seed testing)
- CORS production validation (no test that fails when CORS_ORIGIN is missing in prod)

**Files:**
- `backend/auth-service/tests/` - No tests for KYC encryption requirement
- `backend/profile-service/tests/` - No tests for discovery randomness distribution
- All services - No database SSL/TLS configuration tests

**Priority:** Medium - Integration tests exist but gaps remain

---

## Known Fragile Areas

### Single-File Route Handlers

**Why Fragile:**
- Debugging endpoint issues requires scrolling through 2000+ lines
- Adding middleware applies to all routes in that file
- Route reordering can silently change precedence
- Copy-paste errors for validation logic across endpoints

**Safe Modification Pattern:**
1. Extract related endpoints to separate router module
2. Test new module in isolation before integrating
3. Leave error handler and middleware in main index.ts initially

**Test First:** Add tests for extracted routes before moving code

---

### Encryption Key as Optional Feature

**Why Fragile:**
- Easy to misconfigure KYCAID_ENCRYPTION_KEY in production
- No startup validation forces it
- Development might use plaintext; production might miss the key
- Database migrations don't enforce encrypted columns

**Safe Modification:**
1. Add startup validation function
2. Fail hard if KYC is enabled but key is missing
3. Audit all existing records with plaintext PII

---

## Scaling Limitations

### Discovery Query Complexity Under High Load

**Current State:**
- Haversine distance calculation run for every query
- Two COUNT queries (one for randomization, one for distance subset)
- Heavy for users with many profiles in search radius

**Scaling Path:**
1. Cache discovery pool count by region (geohash)
2. Use materialized view for distance-based discovery
3. Add database indexes on (latitude, longitude, created_at)
4. Consider Elasticsearch for location-based discovery

**Current Capacity:** ~10,000 profiles; ~100-200ms per discovery query with distance

---

## Missing Critical Compliance Items

### Message Retention Policy

**Issue:** No TTL or retention defined for messages

**Impact:**
- GDPR right-to-deletion harder to implement (orphaned references)
- Storage costs unbounded
- Privacy risk from old messages

**Solution:**
1. Define policy: messages deleted after 90 days unless starred
2. Add `retained_until` column to messages table
3. Implement daily cleanup job
4. Audit log message deletions

---

### Explicit Consent Flow for Analytics/FCM

**Issue:** No consent mechanism visible in API for analytics or FCM token usage

**Impact:**
- Potential GDPR non-compliance on data processing disclosure
- Users cannot revoke consent for notifications

**Solution:**
1. Add consent fields to users table: `analytics_consent`, `notification_consent`
2. Implement GET/PUT endpoints for consent management
3. Respect consent in FCM and analytics calls

---

## Environment Variable Enforcement Improvements Made

**Now Required at Startup:**
- `JWT_SECRET` (fail-closed) ✓
- `DATABASE_URL` (fail-closed) ✓
- `CORS_ORIGIN` in production (fail-closed) ✓
- `GOOGLE_CLIENT_ID` when using Google Sign-In (fail-closed) ✓
- `REVENUECAT_WEBHOOK_AUTH` for webhook processing (fail-closed) ✓

**Still Optional but Should Be Required:**
- `KYCAID_ENCRYPTION_KEY` (currently has plaintext fallback) ❌

---

## Remediation Roadmap

### Phase 1: Security (Weeks 1-2)
- [ ] Enable TLS certificate validation for Railway (get CA bundle)
- [ ] Require KYCAID_ENCRYPTION_KEY with startup validation
- [ ] Migrate any existing plaintext KYCAID data to encrypted storage

### Phase 2: Architecture (Weeks 3-4)
- [ ] Extract auth routes from `backend/auth-service/src/index.ts`
- [ ] Extract profile routes from `backend/profile-service/src/index.ts`
- [ ] Add route handler unit tests

### Phase 3: Compliance (Weeks 5-6)
- [ ] Define and implement message retention policy
- [ ] Add user consent flow for FCM/analytics
- [ ] Add test coverage for encryption key requirement

### Phase 4: Performance (Optional)
- [ ] Cache discovery pool by region
- [ ] Add database indexes for geospatial queries

---

*Concerns audit: 2026-01-22*
