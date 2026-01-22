# Phase 1: Foundation & Safety - Research

**Researched:** 2026-01-22
**Domain:** Database schema, location privacy, authorization middleware, GDPR consent
**Confidence:** HIGH

## Summary

Phase 1 establishes the data layer and privacy utilities for After Hours Mode. Research confirms the existing VLVT codebase provides strong patterns to follow: well-structured PostgreSQL migrations, established subscription/verification middleware patterns, and existing geo-redaction utilities that can be extended.

The key technical decisions are:
1. **Database Schema:** Extend existing PostgreSQL patterns with 6 new After Hours tables
2. **Location Fuzzing:** Round coordinates to 3 decimal places (~111m) + add random jitter within 500m radius
3. **Authorization Middleware:** Create `requireAfterHoursAccess()` middleware combining premium + verification checks
4. **GDPR Consent:** Add explicit consent tracking for After Hours location sharing, update privacy policy

**Primary recommendation:** Follow existing codebase patterns exactly. The subscription middleware (`backend/shared/subscription-middleware.ts`) and verification checks (`profile-check.ts`) provide proven templates. Location fuzzing should extend the existing `geo-redact.ts` utility.

## Standard Stack

The established libraries/tools for this phase:

### Core (Already in Codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg | existing | PostgreSQL client | Already used across all services |
| Express.js | existing | HTTP framework | All services use Express |
| jsonwebtoken | existing | JWT handling | Auth middleware pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PostGIS | 3.x | Spatial indexing | Future optimization (not required Phase 1) |
| BullMQ | existing | Job scheduling | Session expiry jobs (Phase 2) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgreSQL Haversine | PostGIS spatial | PostGIS more efficient at scale, but adds infrastructure; Haversine pattern already proven in codebase |
| Database consent storage | Third-party consent SDK | SDK adds complexity; simple boolean columns match existing patterns |

**Installation:**
No new dependencies required for Phase 1. All needed libraries already in `package.json`.

## Architecture Patterns

### Recommended Project Structure
```
backend/shared/src/
├── middleware/
│   ├── auth.ts                    # Existing JWT middleware
│   ├── after-hours-auth.ts        # NEW: Premium + Verified middleware
│   └── ...
├── utils/
│   ├── geo-redact.ts              # Existing: 2 decimal redaction
│   └── location-fuzzer.ts         # NEW: 3 decimal + jitter
└── ...

backend/migrations/
└── 021_add_after_hours_tables.sql # NEW: All After Hours schema
```

### Pattern 1: Middleware Factory
**What:** Create middleware that checks multiple conditions in sequence
**When to use:** Protecting routes that require both premium and verified status
**Example:**
```typescript
// Source: Existing pattern from subscription-middleware.ts + profile-check.ts
export const createAfterHoursAuthMiddleware = (pool: Pool) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;

    // Check 1: Premium subscription (fail closed)
    const subscription = await pool.query(
      `SELECT is_active FROM user_subscriptions
       WHERE user_id = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [userId]
    );

    if (subscription.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required for After Hours Mode',
        code: 'PREMIUM_REQUIRED',
        upgrade: true
      });
    }

    // Check 2: ID Verification (fail closed)
    const verification = await pool.query(
      `SELECT id_verified FROM users WHERE id = $1`,
      [userId]
    );

    if (!verification.rows[0]?.id_verified) {
      return res.status(403).json({
        success: false,
        error: 'Verification required for After Hours Mode',
        code: 'VERIFICATION_REQUIRED',
        requiresVerification: true
      });
    }

    next();
  };
};
```

### Pattern 2: Location Fuzzing Utility
**What:** Server-side coordinate obfuscation to prevent trilateration attacks
**When to use:** Any API response that includes user location data
**Example:**
```typescript
// Source: Extension of existing geo-redact.ts
// Research: https://privacypatterns.org/patterns/Location-granularity

/**
 * Fuzz coordinates for After Hours Mode display
 * - Round to 3 decimal places (~111m precision)
 * - Add random offset within 500m radius
 * - Result: ~611m maximum deviation from actual location
 */
export function fuzzLocationForAfterHours(
  latitude: number,
  longitude: number,
  fuzzRadiusKm: number = 0.5
): { latitude: number; longitude: number } {
  // Random angle in radians
  const angle = Math.random() * 2 * Math.PI;

  // Random distance within fuzz radius
  const distance = Math.random() * fuzzRadiusKm;

  // Convert km to degrees (approximate)
  // 1 degree latitude = ~111.32 km
  // 1 degree longitude = ~111.32 * cos(latitude) km
  const latOffset = distance * Math.cos(angle) / 111.32;
  const lngOffset = distance * Math.sin(angle) / (111.32 * Math.cos(latitude * Math.PI / 180));

  // Round to 3 decimal places after adding offset
  return {
    latitude: Math.round((latitude + latOffset) * 1000) / 1000,
    longitude: Math.round((longitude + lngOffset) * 1000) / 1000
  };
}
```

### Pattern 3: Migration Structure
**What:** Follow existing migration conventions for schema changes
**When to use:** All database schema modifications
**Example:**
```sql
-- Source: Pattern from migrations/019_add_profile_filters.sql, 020_token_rotation.sql

-- Migration: Add After Hours Mode tables
-- Description: Schema for After Hours profiles, sessions, matches, messages
-- Date: 2026-01-XX

-- ============================================
-- 1. AFTER HOURS PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- (continued for all tables)
```

### Anti-Patterns to Avoid
- **Storing exact coordinates without fuzzing:** Never expose raw GPS coordinates to other users
- **Client-side authorization checks:** Premium/verification must be enforced server-side
- **Shared tables with type columns:** Use separate `after_hours_*` tables, not existing tables with `type='after_hours'`
- **Pre-ticked consent boxes:** GDPR requires explicit opt-in, not opt-out

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Premium status check | Custom query per endpoint | `createSubscriptionMiddleware` pattern | Existing pattern handles edge cases (expiry, null dates) |
| Verification check | Custom query per endpoint | Existing `is_verified`/`id_verified` fields | Already used in `profile-check.ts`, consistent pattern |
| Coordinate rounding | Simple `toFixed(3)` | Fuzzing with random jitter | Simple rounding is vulnerable to trilateration attacks |
| UUID generation | Custom ID generators | PostgreSQL `gen_random_uuid()` | Already used in all existing migrations |
| Consent timestamps | JSONB consent objects | Simple boolean + timestamp columns | Matches existing pattern, simpler queries |

**Key insight:** The codebase already solves 90% of these problems. Extend existing patterns rather than creating new abstractions.

## Common Pitfalls

### Pitfall 1: Trilateration Attacks
**What goes wrong:** Users can triangulate exact locations by creating fake accounts and measuring distances from multiple positions
**Why it happens:** Only rounding coordinates (e.g., 3 decimal places) without randomization
**How to avoid:** Always add random jitter BEFORE rounding; fuzz server-side, not client-side
**Warning signs:** Complaints about "stalking" or users knowing exact locations

### Pitfall 2: Premium Check Race Conditions
**What goes wrong:** User starts session while premium, subscription expires mid-session, should not continue
**Why it happens:** Only checking premium at session start
**How to avoid:** Store `expires_at` in session record, check on each operation OR accept that active sessions continue
**Warning signs:** Reports of expired premium users still using After Hours

### Pitfall 3: Consent Not Explicit Enough
**What goes wrong:** GDPR violations from bundled consent or pre-ticked boxes
**Why it happens:** Adding location consent to general terms acceptance
**How to avoid:** Separate, explicit consent flow specifically for After Hours location sharing
**Warning signs:** Data protection authority complaints, App Store reviews mentioning privacy

### Pitfall 4: Missing FK Cascades
**What goes wrong:** Orphaned After Hours data when users are deleted
**Why it happens:** Forgetting `ON DELETE CASCADE` on foreign keys
**How to avoid:** Always include `ON DELETE CASCADE` on user_id references; test with user deletion
**Warning signs:** Orphaned rows found in cleanup jobs

### Pitfall 5: PostGIS Extension Not Available
**What goes wrong:** Migration fails in production if PostGIS not installed
**Why it happens:** Local PostgreSQL has PostGIS, Railway/cloud might not
**How to avoid:** Phase 1 does NOT require PostGIS; use simple Haversine; only add PostGIS as future optimization
**Warning signs:** Migration errors referencing `postgis` or `geography` types

## Code Examples

Verified patterns from existing codebase and official sources:

### Database Migration Template
```sql
-- Source: Pattern from backend/migrations/020_token_rotation.sql

-- Migration 021: Add After Hours Mode tables
-- Date: 2026-01-XX
-- Description: Foundation schema for After Hours Mode feature

-- ============================================
-- 1. AFTER HOURS PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE after_hours_profiles IS 'Separate profile for After Hours Mode (distinct from main profile)';

-- ============================================
-- 2. AFTER HOURS PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_preferences (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seeking_gender VARCHAR(50) NOT NULL DEFAULT 'Any',
    max_distance_km INTEGER DEFAULT 10,
    interests TEXT[],
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_after_hours_preferences_seeking ON after_hours_preferences(seeking_gender);

COMMENT ON TABLE after_hours_preferences IS 'User preferences for After Hours matching (gender seeking, distance, interests)';

-- ============================================
-- 3. AFTER HOURS SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    fuzzed_latitude DECIMAL(10, 8) NOT NULL,
    fuzzed_longitude DECIMAL(11, 8) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Only one active session per user (ended_at IS NULL means active)
CREATE UNIQUE INDEX IF NOT EXISTS idx_after_hours_sessions_active_user
    ON after_hours_sessions(user_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_after_hours_sessions_expires
    ON after_hours_sessions(expires_at) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_after_hours_sessions_location
    ON after_hours_sessions(fuzzed_latitude, fuzzed_longitude) WHERE ended_at IS NULL;

COMMENT ON TABLE after_hours_sessions IS 'Active and historical After Hours sessions with location data';
COMMENT ON COLUMN after_hours_sessions.latitude IS 'Exact latitude (never exposed to other users)';
COMMENT ON COLUMN after_hours_sessions.fuzzed_latitude IS 'Fuzzed latitude for display to other users (~500m accuracy)';

-- ============================================
-- 4. AFTER HOURS DECLINES
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_declines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES after_hours_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    declined_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id, declined_user_id)
);

CREATE INDEX IF NOT EXISTS idx_after_hours_declines_session
    ON after_hours_declines(session_id);

COMMENT ON TABLE after_hours_declines IS 'Session-scoped declines (reset each session, not permanent blocks)';

-- ============================================
-- 5. AFTER HOURS MATCHES
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES after_hours_sessions(id) ON DELETE CASCADE,
    user_id_1 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_2 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user1_save_vote BOOLEAN DEFAULT FALSE,
    user2_save_vote BOOLEAN DEFAULT FALSE,
    converted_to_match_id UUID REFERENCES matches(id),
    UNIQUE(session_id, user_id_1, user_id_2)
);

CREATE INDEX IF NOT EXISTS idx_after_hours_matches_session
    ON after_hours_matches(session_id);
CREATE INDEX IF NOT EXISTS idx_after_hours_matches_users
    ON after_hours_matches(user_id_1, user_id_2);

COMMENT ON TABLE after_hours_matches IS 'Temporary After Hours matches (ephemeral unless both users save)';

-- ============================================
-- 6. AFTER HOURS MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS after_hours_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES after_hours_matches(id) ON DELETE CASCADE,
    sender_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_after_hours_messages_match
    ON after_hours_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_after_hours_messages_created
    ON after_hours_messages(created_at);

COMMENT ON TABLE after_hours_messages IS 'Ephemeral messages (deleted when session expires unless match is saved)';

-- ============================================
-- 7. AFTER HOURS CONSENT TRACKING
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS after_hours_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS after_hours_consent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN users.after_hours_consent IS 'Explicit GDPR consent for After Hours location sharing';
COMMENT ON COLUMN users.after_hours_consent_at IS 'Timestamp when user granted After Hours location consent';
```

### Authorization Middleware
```typescript
// Source: Pattern from backend/shared/subscription-middleware.ts + profile-check.ts

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import logger from '../utils/logger';

export interface AfterHoursAuthOptions {
  pool: Pool;
  logger?: typeof logger;
}

export const createAfterHoursAuthMiddleware = (options: AfterHoursAuthOptions) => {
  const { pool, logger: log = logger } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    try {
      // Check 1: Premium subscription (SECURITY: fail closed)
      const subscriptionResult = await pool.query(
        `SELECT is_active, expires_at FROM user_subscriptions
         WHERE user_id = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY expires_at DESC NULLS FIRST
         LIMIT 1`,
        [userId]
      );

      if (subscriptionResult.rows.length === 0) {
        log.info('After Hours access denied: no active subscription', { userId });
        res.status(403).json({
          success: false,
          error: 'Premium subscription required for After Hours Mode',
          code: 'PREMIUM_REQUIRED',
          upgrade: true
        });
        return;
      }

      // Check 2: ID Verification (SECURITY: fail closed)
      const verificationResult = await pool.query(
        `SELECT id_verified FROM users WHERE id = $1`,
        [userId]
      );

      if (!verificationResult.rows[0]?.id_verified) {
        log.info('After Hours access denied: not verified', { userId });
        res.status(403).json({
          success: false,
          error: 'ID verification required for After Hours Mode',
          code: 'VERIFICATION_REQUIRED',
          requiresVerification: true
        });
        return;
      }

      // Check 3: GDPR Consent for After Hours location sharing
      const consentResult = await pool.query(
        `SELECT after_hours_consent FROM users WHERE id = $1`,
        [userId]
      );

      if (!consentResult.rows[0]?.after_hours_consent) {
        log.info('After Hours access denied: no location consent', { userId });
        res.status(403).json({
          success: false,
          error: 'Location sharing consent required for After Hours Mode',
          code: 'CONSENT_REQUIRED',
          requiresConsent: true
        });
        return;
      }

      // All checks passed
      next();
    } catch (error) {
      // SECURITY: Fail closed on database errors
      log.error('After Hours auth middleware error', { error, userId });
      res.status(500).json({
        success: false,
        error: 'Unable to verify After Hours access',
        code: 'AUTH_ERROR'
      });
    }
  };
};
```

### Location Fuzzing Utility
```typescript
// Source: Extension of backend/profile-service/src/utils/geo-redact.ts

/**
 * Location Fuzzing for After Hours Mode
 *
 * Privacy-preserving location obfuscation to prevent trilateration attacks.
 *
 * Algorithm:
 * 1. Add random offset within specified radius (default 500m)
 * 2. Round to 3 decimal places (~111m precision)
 *
 * Result: True location hidden within ~611m radius
 *
 * @see https://privacypatterns.org/patterns/Location-granularity
 */
export interface FuzzedCoordinates {
  latitude: number;
  longitude: number;
}

export function fuzzLocationForAfterHours(
  latitude: number,
  longitude: number,
  fuzzRadiusKm: number = 0.5  // 500m default
): FuzzedCoordinates {
  // Validate inputs
  if (latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}`);
  }

  // Random angle in radians (0 to 2*PI)
  const angle = Math.random() * 2 * Math.PI;

  // Random distance within fuzz radius
  // Use sqrt for uniform distribution within circle
  const distance = Math.sqrt(Math.random()) * fuzzRadiusKm;

  // Convert km to degrees
  // 1 degree latitude = ~111.32 km
  // 1 degree longitude = ~111.32 * cos(latitude) km
  const KM_PER_DEGREE_LAT = 111.32;
  const latRadians = latitude * Math.PI / 180;
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos(latRadians);

  const latOffset = distance * Math.cos(angle) / KM_PER_DEGREE_LAT;
  const lngOffset = distance * Math.sin(angle) / kmPerDegreeLng;

  // Apply offset and round to 3 decimal places (~111m precision)
  const fuzzedLat = Math.round((latitude + latOffset) * 1000) / 1000;
  const fuzzedLng = Math.round((longitude + lngOffset) * 1000) / 1000;

  // Clamp to valid ranges (edge case for coordinates near poles/meridian)
  return {
    latitude: Math.max(-90, Math.min(90, fuzzedLat)),
    longitude: Math.max(-180, Math.min(180, fuzzedLng))
  };
}

/**
 * Existing redaction for logging (2 decimal places = ~1.1km)
 * Preserved for backward compatibility
 */
export function redactCoordinates(
  latitude: number,
  longitude: number
): FuzzedCoordinates {
  return {
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Simple coordinate rounding | Rounding + random jitter | Best practice since 2020+ | Prevents trilateration attacks |
| GDPR consent via ToS | Explicit separate consent per purpose | GDPR since 2018, enforced 2025 | Separate consent for location required |
| PostGIS for all geo | Haversine for small scale, PostGIS for large | Always | No PostGIS needed until 1000s concurrent users |
| Monolithic auth middleware | Factory pattern middleware | Current Express best practice | Testable, configurable middleware |

**Deprecated/outdated:**
- Pre-ticked consent boxes: Invalid under GDPR since 2018
- PostGIS REQUIRED mindset: Haversine sufficient for small-medium scale
- Bundled location consent: Must be separate from general ToS acceptance

## Open Questions

Things that couldn't be fully resolved:

1. **PostGIS in Railway**
   - What we know: Railway supports PostgreSQL; PostGIS availability varies
   - What's unclear: Whether VLVT's Railway PostgreSQL has PostGIS pre-installed
   - Recommendation: Phase 1 does NOT use PostGIS; add as optimization in future phase if needed

2. **Consent storage granularity**
   - What we know: GDPR requires withdrawable consent, purpose-specific
   - What's unclear: Whether single `after_hours_consent` column is sufficient or need separate per-purpose columns
   - Recommendation: Start with single column; split later if regulations require

3. **Session location updates**
   - What we know: Session stores initial location for matching
   - What's unclear: Whether location should update during active session
   - Recommendation: Initial location only for Phase 1; add real-time updates in Phase 2 if user research demands

## Sources

### Primary (HIGH confidence)
- **VLVT Codebase Analysis:** `backend/shared/subscription-middleware.ts`, `backend/profile-service/src/utils/geo-redact.ts`, `backend/chat-service/src/utils/profile-check.ts`
- **PostgreSQL Migrations:** `backend/migrations/019_add_profile_filters.sql`, `backend/migrations/020_token_rotation.sql`
- [PostGIS Getting Started](https://postgis.net/documentation/getting_started/) - Official PostGIS documentation
- [Privacy Patterns: Location Granularity](https://privacypatterns.org/patterns/Location-granularity) - Authoritative privacy design patterns

### Secondary (MEDIUM confidence)
- [Express.js Middleware Guide](https://expressjs.com/en/guide/using-middleware.html) - Official Express documentation
- [GDPR Location Data Requirements](https://gdprlocal.com/gdpr-compliance-for-apps/) - GDPR compliance guide for apps
- [ICO Location Data Guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/communications-networks-and-services/location-data/) - UK data protection guidance
- [AWS RDS PostGIS Guide](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html) - Cloud PostgreSQL with PostGIS

### Tertiary (LOW confidence)
- WebSearch results on trilateration attacks - Academic patterns, verified against Privacy Patterns
- WebSearch results on middleware chains - Verified against Express official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in codebase, patterns verified
- Architecture: HIGH - Patterns directly from existing VLVT code
- Pitfalls: MEDIUM - Based on best practices + some WebSearch; trilateration pattern verified

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable domain, no fast-moving dependencies)
