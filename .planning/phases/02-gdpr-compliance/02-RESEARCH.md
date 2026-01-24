# Phase 2: GDPR Compliance - Research

**Researched:** 2026-01-24
**Domain:** GDPR compliance for dating app (EU data rights, special category data)
**Confidence:** HIGH (based on extensive codebase analysis)

## Summary

This research documents the technical requirements and implementation approach for GDPR compliance in the VLVT dating app. The codebase already has significant infrastructure in place:

1. **Account deletion exists** - `DELETE /auth/account` endpoint with CASCADE deletion in auth-service
2. **Privacy policy exists** - Markdown document at `frontend/assets/legal/privacy_policy.md` with GDPR Section 12
3. **After Hours consent model exists** - `after_hours_consent` column in users table with middleware enforcement
4. **R2 photo deletion utility exists** - `deleteUserPhotos()` in profile-service for batch photo cleanup

**Primary recommendation:** Extend existing infrastructure rather than building new systems. Focus on adding granular consent, data export endpoint, and special category data documentation.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pg (PostgreSQL) | ^8.x | User data storage with CASCADE | Already configured, auditable |
| @aws-sdk/client-s3 | ^3.x | R2 photo storage/deletion | Already integrated for photo management |
| express + JWT | N/A | API authentication | Existing auth middleware |

### Supporting (Already in Use)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| winston | ^3.x | Audit logging | All data operations |
| @vlvt/shared | local | AuditLogger, middleware | Cross-service consistency |

### No New Dependencies Needed
GDPR compliance is primarily about:
- Database schema changes (consent tracking)
- API endpoints (export, withdrawal)
- Frontend UI (consent flows)
- Documentation (policies)

No external GDPR libraries needed - implementation is straightforward with existing stack.

**Installation:** No new packages required.

## Architecture Patterns

### Existing Data Architecture

```
PostgreSQL (Railway)
├── users (core identity)
│   ├── id, provider, email
│   ├── after_hours_consent (boolean)    # EXISTING consent field
│   └── after_hours_consent_at (timestamp)
├── profiles (dating data)
│   └── CASCADE from users.id
├── auth_credentials (auth data)
│   └── CASCADE from users.id
├── matches/messages (communication)
│   └── CASCADE from users.id
├── kycaid_verifications (PII - encrypted)
│   └── CASCADE from users.id
└── after_hours_* tables
    └── CASCADE from users.id

R2 (Cloudflare)
├── photos/{userId}/*           # Profile photos
├── after-hours-photos/{userId}/* # After Hours photos
└── verifications/{userId}/*    # Verification selfies
```

### Recommended Consent Architecture

```
New: user_consents table
├── user_id (FK to users)
├── purpose (enum: 'location', 'marketing', 'analytics', 'after_hours')
├── granted (boolean)
├── granted_at (timestamp)
├── withdrawn_at (timestamp nullable)
└── consent_version (string - for policy updates)
```

### Pattern 1: Granular Consent Management
**What:** Track individual consent purposes separately
**When to use:** GDPR requires per-purpose opt-in/opt-out
**Example:**
```typescript
// Instead of one boolean, track each purpose
interface ConsentRecord {
  purpose: 'location' | 'marketing' | 'analytics' | 'after_hours' | 'profile_visibility';
  granted: boolean;
  version: string; // "2026-01-24" - links to policy version
}
```

### Pattern 2: Data Export as JSON
**What:** Compile all user data into structured JSON for portability
**When to use:** Article 15 Right to Access requests
**Example:**
```typescript
// Export structure
interface UserDataExport {
  exportedAt: string;
  user: { id, email, createdAt };
  profile: { name, age, bio, interests };
  photos: { key, uploadedAt }[]; // Include download URLs
  matches: { matchId, matchedUserId, createdAt }[];
  messages: { matchId, text, sentAt }[];
  consents: ConsentRecord[];
  afterHours?: { profile, preferences, sessions };
}
```

### Anti-Patterns to Avoid
- **Bundled consent:** Never use single "Accept All" as only option
- **Soft delete without expiry:** GDPR requires actual data removal within 30 days
- **Forgetting external storage:** R2 photos must be deleted alongside database records

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cascade deletion | Manual multi-table DELETE | PostgreSQL CASCADE constraints | Already configured, transactional |
| Photo deletion | Loop through S3 calls | `deleteUserPhotos()` in r2-client.ts | Handles errors, logging |
| Consent timestamp | Custom logic | PostgreSQL `CURRENT_TIMESTAMP` | Consistent, timezone-aware |
| Audit trail | Custom logging | AuditLogger from @vlvt/shared | Already integrated |

**Key insight:** The existing CASCADE delete configuration handles most tables automatically when `users` row is deleted. Focus effort on R2 cleanup and audit logging, not database deletion.

## Common Pitfalls

### Pitfall 1: Forgetting R2 Photos
**What goes wrong:** User deleted from database but photos remain in R2 storage
**Why it happens:** CASCADE only affects PostgreSQL, not external storage
**How to avoid:** Call `deleteUserPhotos()` BEFORE database deletion
**Warning signs:** R2 storage costs don't decrease after account deletions

### Pitfall 2: Incomplete Data Export
**What goes wrong:** Export misses data from some tables (e.g., After Hours data)
**Why it happens:** New tables added without updating export logic
**How to avoid:** Enumerate ALL tables with user_id FK in export query
**Warning signs:** User reports missing data in export

### Pitfall 3: Consent Version Drift
**What goes wrong:** User's consent is to an old policy version
**Why it happens:** Policy updated but existing consents not re-prompted
**How to avoid:** Store consent_version, check against current policy
**Warning signs:** Legal compliance audit finds stale consents

### Pitfall 4: Special Category Data Undocumented
**What goes wrong:** Sexual orientation inference from After Hours not disclosed
**Why it happens:** Feature added without privacy impact assessment
**How to avoid:** Document in privacy policy Section 12 AND in-app consent flow
**Warning signs:** GDPR Article 9 violation complaint

### Pitfall 5: 30-Day Window Missed
**What goes wrong:** Data export request takes longer than 30 days
**Why it happens:** Manual process, no tracking
**How to avoid:** Immediate processing with automated system
**Warning signs:** User complaints, regulatory queries

## Code Examples

### Existing Account Deletion (auth-service/src/index.ts:1912)
```typescript
// Source: backend/auth-service/src/index.ts
app.delete('/auth/account', generalLimiter, authenticateJWT, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const client = await pool.connect();

  try {
    logger.info('Account deletion requested', { userId });
    await client.query('BEGIN');

    // Delete user from users table - CASCADE will delete:
    // - profiles, matches, messages, blocks, reports, auth_credentials, etc.
    const result = await client.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [userId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    await client.query('COMMIT');
    // NOTE: Missing R2 photo cleanup - GDPR-04 must add this
    res.json({ success: true, message: 'Your account and all associated data have been permanently deleted.' });
  } catch (error) {
    await client.query('ROLLBACK');
    // ...
  }
});
```

### Existing R2 Photo Cleanup (profile-service/src/utils/r2-client.ts:217)
```typescript
// Source: backend/profile-service/src/utils/r2-client.ts
export async function deleteUserPhotos(
  userId: string,
  photoKeysOrUrls: string[]
): Promise<{ deleted: number; failed: number }> {
  // Already handles:
  // - R2 credential validation
  // - Key extraction from URLs
  // - Batch deletion with logging
  // - Error handling (continues on failure)
}
```

### Existing Consent Check (shared/src/middleware/after-hours-auth.ts:94)
```typescript
// Source: backend/shared/src/middleware/after-hours-auth.ts
// Check 3: GDPR Consent for After Hours location sharing
const consentResult = await pool.query(
  `SELECT after_hours_consent FROM users WHERE id = $1`,
  [userId]
);

if (!consentResult.rows[0]?.after_hours_consent) {
  res.status(403).json({
    success: false,
    error: 'Location sharing consent required for After Hours Mode',
    code: 'CONSENT_REQUIRED',
    requiresConsent: true
  });
  return;
}
```

### Recommended Data Export Pattern
```typescript
// New endpoint: GET /auth/data-export
async function exportUserData(userId: string): Promise<UserDataExport> {
  const [
    user, profile, photos, matches, messages,
    consents, afterHoursProfile, afterHoursPrefs,
    kycaidData
  ] = await Promise.all([
    pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [userId]),
    pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]),
    // ... all tables with user_id
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: user.rows[0],
    profile: profile.rows[0],
    // ... compile all data
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single "Accept All" | Granular per-purpose consent | GDPR 2018 | Required by law |
| Manual deletion requests | Self-service in-app | App Store rules 2022 | Already implemented |
| 30-day backup retention | Hard delete within 30 days | Standard practice | Must verify |

**Deprecated/outdated:**
- Implicit consent (pre-checked boxes): Illegal under GDPR
- Bundled consent (all-or-nothing): Must offer per-purpose opt-in

## Existing Infrastructure Analysis

### What Already Exists

| Component | Location | Status | GDPR Coverage |
|-----------|----------|--------|---------------|
| Privacy Policy | `frontend/assets/legal/privacy_policy.md` | Complete | GDPR-01 partial |
| Legal Viewer | `frontend/lib/screens/legal_document_viewer.dart` | Complete | GDPR-01 partial |
| Account Deletion UI | `frontend/lib/screens/safety_settings_screen.dart` | Complete | GDPR-04 partial |
| Account Deletion API | `auth-service DELETE /auth/account` | Complete | GDPR-04 partial |
| Photo Cleanup | `profile-service deleteUserPhotos()` | Complete | GDPR-04 partial |
| After Hours Consent Column | `users.after_hours_consent` | Complete | GDPR-02 partial |
| After Hours Auth Middleware | `shared/src/middleware/after-hours-auth.ts` | Complete | Enforcement |
| Delete Account Website | `website/delete-account.html` | Complete | App Store compliance |

### What's Missing

| Component | Gap | Required For |
|-----------|-----|--------------|
| Privacy policy link in Settings | Need to add to profile_screen.dart | GDPR-01 |
| Granular consent UI | Only After Hours consent exists | GDPR-02 |
| Consent database table | Need user_consents table | GDPR-02, GDPR-05 |
| Data export endpoint | No endpoint exists | GDPR-03 |
| R2 cleanup in account deletion | auth-service doesn't call R2 cleanup | GDPR-04 |
| Consent withdrawal endpoint | No API for revoking consent | GDPR-05 |
| Data retention documentation | Not formalized | GDPR-06 |
| Special category documentation | Not in privacy policy | GDPR-07 |

## Data Mapping

### User Data Locations

| Data Category | Table/Storage | Deletion Method | Export Method |
|---------------|---------------|-----------------|---------------|
| **Core Identity** | users | CASCADE from DELETE users | Direct query |
| **Profile** | profiles | CASCADE | Direct query |
| **Auth Credentials** | auth_credentials | CASCADE | Direct query |
| **Photos** | R2 bucket + profiles.photos[] | `deleteUserPhotos()` | Presigned URLs |
| **Matches** | matches | CASCADE | Direct query |
| **Messages** | messages | CASCADE | Direct query |
| **Blocks/Reports** | blocks, reports | CASCADE | Direct query (blocks only) |
| **Subscriptions** | user_subscriptions | CASCADE | Direct query |
| **KYCAID Data** | kycaid_verifications | CASCADE | Direct query (encrypted) |
| **After Hours** | after_hours_* tables | CASCADE | Direct query |
| **Refresh Tokens** | refresh_tokens | CASCADE | Not exported (security) |
| **FCM Tokens** | fcm_tokens | CASCADE | Not exported (internal) |
| **Login Attempts** | login_attempts | CASCADE | Optional |
| **Audit Logs** | audit_log | NOT deleted (compliance) | Optional |

### Special Category Data (Article 9)

**After Hours Mode** implicitly processes special category data:
- Sexual orientation can be inferred from `seeking_gender` + user's `gender`
- Sexual interests implied by After Hours participation

**Required actions:**
1. Explicit consent with clear disclosure (GDPR-02)
2. Document in privacy policy (GDPR-07)
3. Allow separate opt-out (GDPR-05)

## Requirements Analysis

### GDPR-01: Privacy Policy Accessible
**Current state:** Privacy policy exists at `frontend/assets/legal/privacy_policy.md`, viewable via `LegalDocumentViewer`
**Gap:** Not linked from Settings screen (profile_screen.dart has "Safety & Privacy" but no policy link)
**Effort:** Low - add ListTile to safety_settings_screen.dart
**Risk:** Low

### GDPR-02: Granular Consent Collection
**Current state:** Only `after_hours_consent` exists on users table
**Gap:** No per-purpose consent for: location (discovery), marketing, analytics
**Effort:** Medium - new table, migration, API endpoints, frontend UI
**Risk:** Medium (requires consent flow redesign)

### GDPR-03: Data Export (Article 15)
**Current state:** No endpoint exists
**Gap:** Full implementation needed
**Effort:** Medium - compile data from all tables, generate JSON, handle photos
**Risk:** Medium (must ensure completeness)

### GDPR-04: Account Deletion (Article 17)
**Current state:** `DELETE /auth/account` exists but doesn't delete R2 photos
**Gap:** Must integrate `deleteUserPhotos()` before CASCADE deletion
**Effort:** Low - call existing function
**Risk:** Low

### GDPR-05: Consent Withdrawal
**Current state:** No mechanism to revoke consent (only account deletion)
**Gap:** API to withdraw specific consents without deleting account
**Effort:** Low-Medium - depends on consent table design
**Risk:** Low

### GDPR-06: Data Retention Policies
**Current state:** Privacy policy mentions 30/90 day windows informally
**Gap:** No formal documentation, no automated cleanup
**Effort:** Low (documentation) + Medium (automation)
**Risk:** Low

### GDPR-07: Special Category Data (Article 9)
**Current state:** After Hours exists with consent, but not explicitly documented as special category
**Gap:** Need explicit disclosure in privacy policy and consent flow
**Effort:** Low - documentation and consent UI updates
**Risk:** Medium (legal compliance)

## Recommended Wave Structure

### Wave 1: Foundation (GDPR-01, GDPR-06, GDPR-07)
**Parallel work, low risk, quick wins**
- Add privacy policy link to Settings screen
- Document data retention policies
- Update privacy policy for special category data
- Add Article 9 disclosure to After Hours consent flow

### Wave 2: Deletion Complete (GDPR-04)
**Single task, closes existing gap**
- Integrate R2 photo cleanup into account deletion endpoint
- Test full data erasure across all storage

### Wave 3: Consent Infrastructure (GDPR-02, GDPR-05)
**Sequential, enables future features**
- Create user_consents table migration
- Build consent management API endpoints
- Build consent withdrawal API
- Build granular consent UI in frontend

### Wave 4: Data Export (GDPR-03)
**Depends on stable schema**
- Build data export endpoint
- Generate JSON export with all user data
- Include photo download URLs
- Add frontend UI to request export

## Open Questions

Things that couldn't be fully resolved:

1. **Third-party data recipients**
   - What we know: Firebase, Sentry, RevenueCat, KYCAID mentioned in privacy policy
   - What's unclear: Do we need to export data from these services too?
   - Recommendation: Document that third-party data must be requested from those providers

2. **Audit log retention**
   - What we know: audit_log table exists, not cascaded
   - What's unclear: How long to retain after user deletion?
   - Recommendation: Retain 7 years for legal/compliance, anonymize user_id

3. **Photo export format**
   - What we know: Photos in R2 with presigned URLs
   - What's unclear: Include actual image files or just URLs?
   - Recommendation: Include presigned URLs (valid 7 days) - user downloads separately

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Direct inspection of:
  - `backend/auth-service/src/index.ts` (account deletion endpoint)
  - `backend/profile-service/src/utils/r2-client.ts` (photo deletion)
  - `backend/shared/src/middleware/after-hours-auth.ts` (consent enforcement)
  - `backend/migrations/*.sql` (data model)
  - `frontend/lib/screens/*.dart` (existing UI)
  - `frontend/assets/legal/privacy_policy.md` (current policy)

### Secondary (MEDIUM confidence)
- GDPR Article 15, 17, 9 requirements (well-established legal framework)
- App Store / Play Store deletion requirements (industry standard)

### Tertiary (LOW confidence)
- Specific 30-day timeline for data export (common practice, verify with legal)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing codebase, no new dependencies
- Architecture: HIGH - clear patterns from existing code
- Pitfalls: HIGH - based on actual code gaps found
- Requirements analysis: HIGH - mapped to specific code locations

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (GDPR requirements are stable, codebase may change)
