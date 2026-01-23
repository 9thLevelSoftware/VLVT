# Phase 2: Profile & Session Management - Research

**Researched:** 2026-01-22
**Domain:** After Hours profile CRUD, preferences management, timed session lifecycle
**Confidence:** HIGH

## Summary

Phase 2 implements the user-facing APIs for After Hours Mode: profile creation/management, preferences configuration, and timed session lifecycle. This research examines the existing VLVT codebase patterns and identifies the standard stack for implementing CRUD endpoints, validation, photo upload, and job scheduling.

The existing codebase provides excellent patterns to follow: Express.js with TypeScript, express-validator for input validation, Sharp for image processing with R2 storage, and a well-structured shared middleware package (@vlvt/shared). For session expiry, BullMQ with the existing Redis infrastructure provides delayed job capabilities.

**Primary recommendation:** Follow existing profile-service patterns exactly, adding After Hours-specific routes under `/api/after-hours/*` prefix. Use BullMQ for session expiry jobs, leveraging the existing Redis connection from REDIS_URL.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^5.1.0 | HTTP routing | Existing service framework |
| express-validator | ^7.3.0 | Input validation | Already used in profile-service |
| pg | ^8.16.3 | PostgreSQL client | Existing database access |
| sharp | ^0.33.0 | Image processing | Existing photo pipeline |
| multer | ^1.4.5 | File upload | Existing upload middleware |
| @aws-sdk/client-s3 | ^3.946.0 | R2 storage | Existing photo storage |
| @vlvt/shared | file:../shared | Shared middleware | Existing auth, rate-limit, errors |

### New Addition Required
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | ^5.x | Job queue | Redis-backed delayed jobs for session expiry |
| ioredis | ^5.x | Redis client | Required by BullMQ (more features than redis package) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ | node-cron + DB polling | BullMQ is more reliable for delayed jobs, handles restarts gracefully |
| BullMQ | setTimeout in-memory | Would lose jobs on restart, not production-ready |
| ioredis | existing redis package | BullMQ recommends ioredis; can share connection |

**Installation:**
```bash
cd backend/profile-service
npm install bullmq ioredis
```

## Architecture Patterns

### Recommended Project Structure
```
backend/profile-service/src/
├── index.ts                    # Main app (add after-hours routes)
├── routes/
│   └── after-hours.ts          # After Hours API routes (NEW)
├── middleware/
│   ├── auth.ts                 # Existing JWT auth
│   ├── validation.ts           # Existing validators
│   └── after-hours-validation.ts # After Hours validators (NEW)
├── services/
│   └── session-scheduler.ts    # BullMQ session expiry (NEW)
├── utils/
│   ├── image-handler.ts        # Reuse for photo processing
│   ├── r2-client.ts            # Reuse for photo storage
│   └── location-fuzzer.ts      # Reuse from Phase 1
└── types/
    └── after-hours.ts          # TypeScript interfaces (NEW)
```

### Pattern 1: Route Organization with Middleware Chain
**What:** Group After Hours endpoints under single router with common middleware
**When to use:** All After Hours endpoints require same auth chain
**Example:**
```typescript
// Source: Existing profile-service pattern + Phase 1 after-hours-auth.ts
import { Router } from 'express';
import { authMiddleware } from './middleware/auth';
import { createAfterHoursAuthMiddleware } from '@vlvt/shared';

const afterHoursRouter = Router();

// All routes require: JWT auth + After Hours auth (premium/verified/consent)
afterHoursRouter.use(authMiddleware);
afterHoursRouter.use(createAfterHoursAuthMiddleware({ pool, logger }));

// Profile endpoints
afterHoursRouter.post('/profile', validateAfterHoursProfile, createProfile);
afterHoursRouter.get('/profile', getProfile);
afterHoursRouter.patch('/profile', validateAfterHoursProfileUpdate, updateProfile);

// Preferences endpoints
afterHoursRouter.post('/preferences', validatePreferences, createPreferences);
afterHoursRouter.patch('/preferences', validatePreferencesUpdate, updatePreferences);
afterHoursRouter.get('/preferences', getPreferences);

// Session endpoints
afterHoursRouter.post('/session/start', validateSessionStart, startSession);
afterHoursRouter.post('/session/end', endSession);
afterHoursRouter.post('/session/extend', validateSessionExtend, extendSession);
afterHoursRouter.get('/session', getSessionStatus);

// Mount in main app
app.use('/api/after-hours', afterHoursRouter);
```

### Pattern 2: Atomic Session Creation with Transaction
**What:** Create session with location fuzzing in single database transaction
**When to use:** Session start to ensure consistency
**Example:**
```typescript
// Source: Phase 1 schema + existing profile-service transaction patterns
import { fuzzLocationForAfterHours } from './utils/location-fuzzer';

async function startSession(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { duration, latitude, longitude } = req.body;

  // Validate duration options (15, 30, 60 minutes)
  const durationMinutes = [15, 30, 60].includes(duration) ? duration : 30;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check no active session exists (unique index ensures this too)
    const existing = await client.query(
      `SELECT id FROM after_hours_sessions
       WHERE user_id = $1 AND ended_at IS NULL`,
      [userId]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Active session already exists',
        code: 'SESSION_ALREADY_ACTIVE'
      });
    }

    // Fuzz location for privacy
    const fuzzed = fuzzLocationForAfterHours(latitude, longitude);

    // Calculate expiry
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    // Create session
    const result = await client.query(
      `INSERT INTO after_hours_sessions
       (user_id, expires_at, latitude, longitude, fuzzed_latitude, fuzzed_longitude)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, started_at, expires_at`,
      [userId, expiresAt, latitude, longitude, fuzzed.latitude, fuzzed.longitude]
    );

    await client.query('COMMIT');

    const session = result.rows[0];

    // Schedule expiry job (fire-and-forget, session persists regardless)
    scheduleSessionExpiry(session.id, durationMinutes * 60 * 1000).catch(err => {
      logger.error('Failed to schedule session expiry', { sessionId: session.id, error: err });
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        startedAt: session.started_at,
        expiresAt: session.expires_at,
        durationMinutes
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Pattern 3: BullMQ Session Expiry Service
**What:** Dedicated service for scheduling and processing session expiry jobs
**When to use:** All session lifecycle operations
**Example:**
```typescript
// Source: BullMQ official documentation (https://docs.bullmq.io/guide/jobs/delayed)
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

// Create Redis connection (reuse REDIS_URL from environment)
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

// Create queue for session expiry jobs
const sessionExpiryQueue = new Queue('session-expiry', { connection });

// Worker processes expiry jobs
const worker = new Worker('session-expiry', async (job: Job) => {
  const { sessionId, userId } = job.data;

  // End the session (set ended_at)
  const result = await pool.query(
    `UPDATE after_hours_sessions
     SET ended_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND ended_at IS NULL
     RETURNING id`,
    [sessionId]
  );

  if (result.rows.length > 0) {
    logger.info('Session expired by scheduler', { sessionId, userId });
    // TODO Phase 4: Notify user via Socket.IO
  }
}, { connection });

// Schedule session expiry
export async function scheduleSessionExpiry(
  sessionId: string,
  delayMs: number
): Promise<void> {
  await sessionExpiryQueue.add(
    'expire',
    { sessionId },
    {
      delay: delayMs,
      jobId: `session:expire:${sessionId}`, // Idempotency key
      removeOnComplete: true,
      removeOnFail: 100 // Keep last 100 failed for debugging
    }
  );
}

// Cancel scheduled expiry (for early termination)
export async function cancelSessionExpiry(sessionId: string): Promise<void> {
  const job = await sessionExpiryQueue.getJob(`session:expire:${sessionId}`);
  if (job) {
    await job.remove();
    logger.info('Cancelled session expiry job', { sessionId });
  }
}

// Extend session (reschedule expiry)
export async function extendSessionExpiry(
  sessionId: string,
  newDelayMs: number
): Promise<void> {
  // Remove old job and create new one
  await cancelSessionExpiry(sessionId);
  await scheduleSessionExpiry(sessionId, newDelayMs);
}
```

### Pattern 4: Validation with express-validator
**What:** Validation chains following existing profile-service patterns
**When to use:** All POST/PATCH endpoints
**Example:**
```typescript
// Source: Existing validation.ts pattern
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : 'unknown',
        message: err.msg
      }))
    });
  }
  next();
};

// After Hours Profile validation
export const validateAfterHoursProfile = [
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be maximum 500 characters'),
  handleValidationErrors
];

// Preferences validation
export const validatePreferences = [
  body('seekingGender')
    .notEmpty()
    .withMessage('Seeking gender is required')
    .isIn(['Any', 'Male', 'Female', 'Non-binary'])
    .withMessage('Invalid seeking gender'),
  body('maxDistanceKm')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Distance must be between 1 and 200 km'),
  body('minAge')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Minimum age must be between 18 and 99'),
  body('maxAge')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Maximum age must be between 18 and 99'),
  body('sexualOrientation')
    .optional()
    .isIn(['Straight', 'Gay', 'Bisexual', 'Pansexual', 'Other'])
    .withMessage('Invalid sexual orientation'),
  handleValidationErrors
];

// Session start validation
export const validateSessionStart = [
  body('duration')
    .notEmpty()
    .withMessage('Duration is required')
    .isIn([15, 30, 60])
    .withMessage('Duration must be 15, 30, or 60 minutes'),
  body('latitude')
    .notEmpty()
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('longitude')
    .notEmpty()
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  handleValidationErrors
];
```

### Pattern 5: Photo Upload Reuse
**What:** Reuse existing Sharp + R2 pipeline with After Hours-specific path prefix
**When to use:** After Hours profile photo upload
**Example:**
```typescript
// Source: Existing image-handler.ts and r2-client.ts
import { processImage, validateImage, validateImageMagicBytes } from './utils/image-handler';
import { resolvePhotoUrls, uploadToR2 } from './utils/r2-client';

// After Hours photos use different R2 prefix
const AFTER_HOURS_PHOTO_PREFIX = 'after-hours-photos';

async function uploadAfterHoursPhoto(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  // Validate image (same as main profile)
  const validation = validateImage(req.file);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  // Validate magic bytes
  const fileBuffer = req.file.path
    ? fs.readFileSync(req.file.path)
    : req.file.buffer;
  const magicValidation = await validateImageMagicBytes(fileBuffer, req.file.originalname);
  if (!magicValidation.valid) {
    return res.status(400).json({ success: false, error: magicValidation.error });
  }

  // Process with modified key prefix
  // Note: May need to modify processImage to accept prefix parameter
  // or create processAfterHoursImage wrapper
  const processed = await processImage(req.file, userId);

  // Store modified key in after_hours_profiles
  const photoKey = `${AFTER_HOURS_PHOTO_PREFIX}/${userId}/${processed.id}.jpg`;

  await pool.query(
    `UPDATE after_hours_profiles SET photo_url = $1, updated_at = NOW() WHERE user_id = $2`,
    [photoKey, userId]
  );

  const [photoUrl] = await resolvePhotoUrls([photoKey]);
  res.json({ success: true, photoUrl });
}
```

### Anti-Patterns to Avoid
- **Storing URLs instead of R2 keys:** Store R2 object keys in database, generate presigned URLs on demand
- **In-memory session timers:** Would lose all sessions on restart; use BullMQ delayed jobs
- **Missing transaction for session creation:** Location + session must be atomic
- **Duplicating middleware auth checks:** Chain `createAfterHoursAuthMiddleware` once at router level

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Delayed job execution | setTimeout tracking | BullMQ delayed jobs | Survives restarts, reliable delivery |
| Location fuzzing | Custom random offset | `fuzzLocationForAfterHours()` | Already implements sqrt-based distribution, edge cases |
| Image processing | Manual Sharp calls | `processImage()` | Already handles EXIF stripping, thumbnails, R2 upload |
| Input validation | Manual if/else checks | express-validator chains | Consistent error format, tested patterns |
| Premium/verified checks | Manual DB queries | `createAfterHoursAuthMiddleware()` | Phase 1 already built this |

**Key insight:** The existing codebase has production-tested solutions for almost every component. Phase 2 is about composing existing pieces, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Session Race Conditions
**What goes wrong:** Two simultaneous session start requests could both succeed before unique index catches it
**Why it happens:** Check-then-insert pattern without transaction
**How to avoid:** Use transaction with `SELECT ... FOR UPDATE` or rely on unique index to reject second insert
**Warning signs:** Intermittent 500 errors on session start, multiple active sessions for same user

### Pitfall 2: Orphaned Expiry Jobs
**What goes wrong:** User manually ends session but expiry job still fires, re-ending already-ended session
**Why it happens:** Forgetting to cancel BullMQ job on early termination
**How to avoid:** Always call `cancelSessionExpiry()` when ending session manually
**Warning signs:** Log entries showing "session already ended" when processing expiry jobs

### Pitfall 3: Missing Photo URL Resolution
**What goes wrong:** Client receives R2 keys instead of usable URLs
**Why it happens:** Returning raw database values without calling `resolvePhotoUrls()`
**How to avoid:** Always resolve R2 keys to presigned URLs before sending response
**Warning signs:** Frontend shows broken images, URLs don't start with `https://`

### Pitfall 4: Expired Presigned URLs in Long Sessions
**What goes wrong:** Photo URLs expire during 60-minute session, images break mid-session
**Why it happens:** Default presigned URL expiry (1 hour) is too short for session + caching
**How to avoid:** Set longer expiry for After Hours photos (2+ hours) or implement URL refresh endpoint
**Warning signs:** Images loading initially then failing after ~1 hour

### Pitfall 5: Location Permission Denied Handling
**What goes wrong:** Session start fails silently when location unavailable
**Why it happens:** Not validating location data is present before processing
**How to avoid:** Validate lat/lng are real numbers (not 0/null) in validation middleware
**Warning signs:** Sessions created with 0,0 coordinates (null island)

### Pitfall 6: Smart Defaults Overwriting User Preferences
**What goes wrong:** Every time user creates/updates preferences, main profile values overwrite their choices
**Why it happens:** Applying smart defaults on every save instead of only on first creation
**How to avoid:** Only apply smart defaults when creating preferences, not on updates
**Warning signs:** Users complaining their After Hours preferences keep resetting

## Code Examples

Verified patterns from existing codebase:

### Database Query with Presigned URL Resolution
```typescript
// Source: profile-service/src/index.ts lines 400-451
async function getAfterHoursProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const result = await pool.query(
    `SELECT p.photo_url, p.description, p.created_at, p.updated_at,
            u.name, u.age  -- Inherited from main profile via users table
     FROM after_hours_profiles p
     JOIN profiles u ON u.user_id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'After Hours profile not found' });
  }

  const profile = result.rows[0];

  // Resolve photo key to presigned URL
  const [photoUrl] = profile.photo_url
    ? await resolvePhotoUrls([profile.photo_url])
    : [null];

  res.json({
    success: true,
    profile: {
      photoUrl,
      description: profile.description,
      name: profile.name,        // From main profile
      age: profile.age,          // From main profile
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    }
  });
}
```

### Upsert Pattern for Preferences
```typescript
// Source: PostgreSQL upsert pattern
async function savePreferences(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { seekingGender, maxDistanceKm, minAge, maxAge, sexualOrientation } = req.body;

  // Upsert: insert or update if exists
  const result = await pool.query(
    `INSERT INTO after_hours_preferences
     (user_id, seeking_gender, max_distance_km, min_age, max_age, sexual_orientation)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       seeking_gender = COALESCE(EXCLUDED.seeking_gender, after_hours_preferences.seeking_gender),
       max_distance_km = COALESCE(EXCLUDED.max_distance_km, after_hours_preferences.max_distance_km),
       min_age = COALESCE(EXCLUDED.min_age, after_hours_preferences.min_age),
       max_age = COALESCE(EXCLUDED.max_age, after_hours_preferences.max_age),
       sexual_orientation = COALESCE(EXCLUDED.sexual_orientation, after_hours_preferences.sexual_orientation),
       updated_at = NOW()
     RETURNING *`,
    [userId, seekingGender, maxDistanceKm, minAge, maxAge, sexualOrientation]
  );

  res.json({ success: true, preferences: result.rows[0] });
}
```

### Session Status Check
```typescript
// Source: Pattern from existing profile-service endpoints
async function getSessionStatus(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const result = await pool.query(
    `SELECT id, started_at, expires_at,
            EXTRACT(EPOCH FROM (expires_at - NOW())) AS remaining_seconds
     FROM after_hours_sessions
     WHERE user_id = $1 AND ended_at IS NULL`,
    [userId]
  );

  if (result.rows.length === 0) {
    return res.json({
      success: true,
      active: false,
      session: null
    });
  }

  const session = result.rows[0];
  const remainingSeconds = Math.max(0, Math.floor(session.remaining_seconds));

  res.json({
    success: true,
    active: remainingSeconds > 0,
    session: {
      id: session.id,
      startedAt: session.started_at,
      expiresAt: session.expires_at,
      remainingSeconds
    }
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| QueueScheduler required for delayed jobs | Built into BullMQ 2.0+ | BullMQ 2.0 (2022) | No separate scheduler needed |
| Bull (original library) | BullMQ | 2020+ | BullMQ is the maintained successor |
| Memory-based timers | Redis-backed job queues | Industry standard | Reliability across restarts |

**Deprecated/outdated:**
- Bull (original): Use BullMQ instead, Bull is maintenance-only
- QueueScheduler class: No longer needed in BullMQ 2.0+

## Open Questions

Things that couldn't be fully resolved:

1. **Session expiry grace period for active chats**
   - What we know: Sessions expire, but users might be mid-conversation
   - What's unclear: Should there be a warning 5 minutes before? Grace period after expiry?
   - Recommendation: Claude's discretion per CONTEXT.md. Suggest 5-minute warning via Socket.IO (Phase 4)

2. **Error messaging copy for blocked activation**
   - What we know: Various scenarios block activation (no permission, no profile)
   - What's unclear: Exact user-facing error messages
   - Recommendation: Claude's discretion per CONTEXT.md. Use consistent pattern with existing error codes

3. **Default preference values when main profile lacks data**
   - What we know: Should inherit from main profile preferences
   - What's unclear: What if main profile has no preferences set?
   - Recommendation: Use sensible defaults (Any gender, 10km, 18-99 age, no orientation filter)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/profile-service/src/index.ts` - CRUD patterns, validation, R2 integration
- Existing codebase: `backend/shared/src/middleware/after-hours-auth.ts` - Authorization middleware
- Existing codebase: `backend/profile-service/src/utils/location-fuzzer.ts` - Location fuzzing
- Existing codebase: `backend/profile-service/src/utils/image-handler.ts` - Photo processing
- Existing codebase: `backend/profile-service/src/utils/r2-client.ts` - R2 storage
- Existing codebase: `backend/auth-service/src/utils/cache-manager.ts` - Redis connection pattern
- Phase 1 migration: `backend/migrations/021_add_after_hours_tables.sql` - Database schema

### Secondary (MEDIUM confidence)
- [BullMQ Official Documentation - Delayed Jobs](https://docs.bullmq.io/guide/jobs/delayed)
- [BullMQ Official Documentation - Removing Jobs](https://docs.bullmq.io/guide/jobs/removing-job)
- [BullMQ Official Documentation - Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)

### Tertiary (LOW confidence)
- None - all findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing codebase provides all patterns
- Architecture: HIGH - Following established service patterns exactly
- BullMQ integration: MEDIUM - Verified with official docs, not yet tested in VLVT
- Pitfalls: HIGH - Based on existing codebase patterns and common issues

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable domain, established patterns)
