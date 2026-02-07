# Data Retention Policy

**Last Updated: January 2026**

## Overview

This document defines data retention periods, legal basis for each retention period, and cleanup procedures for VLVT. This is internal documentation for compliance and development teams.

## Retention Periods by Data Category

| Category | Data | Retention Period | Deletion Method | Legal Basis |
|----------|------|------------------|-----------------|-------------|
| Core Identity | `users` table | Until account deletion | CASCADE | Contract performance |
| Profile | `profiles` table | Until account deletion | CASCADE | Contract performance |
| Photos | R2 storage | Until account deletion | `deleteUserPhotos()` | Contract performance |
| Messages | `messages` table | 30 days after unmatch OR account deletion | CASCADE | Legitimate interest (safety) |
| Matches | `matches` table | Until unmatch or account deletion | CASCADE | Contract performance |
| After Hours Sessions | `after_hours_sessions` | Session expiry (1 hour) + 30 days safety retention | CASCADE | Explicit consent (Art. 9) |
| After Hours Matches | `after_hours_matches` | Session expiry + 30 days safety retention | CASCADE | Explicit consent (Art. 9) |
| ID Verification | `kycaid_verifications` | Until account deletion | CASCADE | Legitimate interest (fraud prevention) |
| Audit Logs | `audit_log` | 7 years (legal compliance) | NOT deleted with user | Legal obligation |
| Login Attempts | `login_attempts` | 30 days | AUTO cleanup job | Legitimate interest (security) |
| FCM Tokens | `fcm_tokens` | 90 days inactive | AUTO cleanup job | Contract performance |
| Refresh Tokens | stored in JWT | 7 days | Automatic expiry | Contract performance |
| Blocks | `blocks` table | Until unblock or account deletion | CASCADE | Legitimate interest (safety) |
| Reports | `reports` table | 2 years or until resolved | Manual review | Legal obligation |

## Legal Basis Definitions

### Contract Performance (GDPR Art. 6(1)(b))
Data necessary to provide the service the user requested. Retained as long as the account is active.

### Legitimate Interest (GDPR Art. 6(1)(f))
Data processed for safety, security, and fraud prevention. Users can object but this may result in account suspension.

### Legal Obligation (GDPR Art. 6(1)(c))
Data required by law to be retained (audit trails, financial records, legal investigations).

### Explicit Consent (GDPR Art. 9(2)(a))
Special category data (After Hours) processed only with explicit consent. User can withdraw at any time.

## CASCADE Deletion Tree

When a user's record in the `users` table is deleted, the following happens automatically via PostgreSQL CASCADE constraints:

```
users (DELETE)
  |
  +-- profiles (CASCADE)
  |     +-- profile_photos (CASCADE) --> R2 cleanup via deleteUserPhotos()
  |
  +-- matches (CASCADE via user1_id or user2_id)
  |     +-- messages (CASCADE via match_id)
  |
  +-- after_hours_sessions (CASCADE)
  |     +-- after_hours_matches (CASCADE via session_id)
  |
  +-- kycaid_verifications (CASCADE)
  |
  +-- blocks (CASCADE via blocker_id or blocked_id)
  |
  +-- reports (CASCADE via reporter_id, NOT deleted via reported_id)
  |
  +-- fcm_tokens (CASCADE)
  |
  +-- login_attempts (CASCADE)
  |
  +-- user_credentials (CASCADE)
  |
  +-- audit_log (PRESERVED - user_id set to NULL or retained for compliance)
```

### External Resources Cleanup

When account deletion occurs, these external resources must also be cleaned up:

1. **R2 Storage (Photos)**: Called via `deleteUserPhotos()` before CASCADE delete
2. **RevenueCat**: Subscription data retained by RevenueCat (their retention policy applies)
3. **Firebase Analytics**: Anonymized data retained per Google's policy
4. **Sentry**: Error logs may contain user IDs (90-day retention)

## Automated Cleanup Jobs

### 1. Login Attempts Cleanup (30 days)

```sql
-- Run daily
DELETE FROM login_attempts
WHERE created_at < NOW() - INTERVAL '30 days';
```

### 2. FCM Token Cleanup (90 days inactive)

```sql
-- Run weekly
DELETE FROM fcm_tokens
WHERE updated_at < NOW() - INTERVAL '90 days';
```

### 3. After Hours Session Cleanup (1 hour + 30 days)

```sql
-- Run hourly
DELETE FROM after_hours_sessions
WHERE expires_at < NOW() - INTERVAL '30 days';
```

### 4. Message Retention (inactive matches)

```sql
-- Run weekly
DELETE FROM messages
WHERE match_id IN (
  SELECT m.id FROM matches m
  WHERE unmatched_at IS NOT NULL
  AND unmatched_at < NOW() - INTERVAL '30 days'
);
```

### 5. Audit Log Archival (7 years)

```sql
-- Run monthly
INSERT INTO audit_logs_archive
SELECT * FROM audit_logs
WHERE created_at < NOW() - INTERVAL '7 years';

DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '7 years';
```

## User Rights Implementation

### Right to Access (GDPR Art. 15)

Users can access their data via:
- Profile: `GET /profile/:userId`
- Messages: `GET /matches/:matchId/messages`
- All data export: `GET /profile/:userId/export` (TODO: implement)

### Right to Erasure (GDPR Art. 17)

Account deletion triggers:
1. Photo deletion from R2 storage
2. CASCADE deletion of all user data
3. Anonymization of audit logs (user_id preserved but profile data removed)

What is NOT deleted:
- Audit logs (anonymized, retained for 7 years)
- Reports against the user (retained for safety)
- Messages to other users (deleted after 30 days via cleanup job)

### Right to Portability (GDPR Art. 20)

Data export format: JSON
Endpoint: `GET /profile/:userId/export` (TODO: implement in Phase 02-02)

Exported data includes:
- Profile information
- Photos (as URLs valid for 24 hours)
- Matches (without other user's personal data)
- Messages sent

### Right to Rectification (GDPR Art. 16)

Users can update their data via:
- Profile: `PUT /profile`
- Photos: `POST /profile/photos`, `DELETE /profile/photos/:photoId`

## Consent Management

### Consent Types Tracked

| Consent Type | Storage Location | Required | Withdrawable |
|-------------|------------------|----------|--------------|
| Terms of Service | `users.accepted_tos_at` | Yes | Account deletion only |
| Privacy Policy | `users.accepted_privacy_at` | Yes | Account deletion only |
| After Hours | `after_hours_consent` table | No | Yes, any time |
| Push Notifications | Device-level | No | Yes, any time |
| Location | Device-level | No | Yes, any time |
| Analytics | `user_preferences.analytics_consent` | No | Yes, any time |

### Consent Withdrawal

When After Hours consent is withdrawn:
1. `after_hours_consent.withdrawn_at` is set
2. Active sessions are immediately expired
3. User can no longer access After Hours features
4. Historical data retained for 30 days (safety retention)
5. After 30 days, all After Hours data is deleted

## Implementation Status

- [x] CASCADE deletion configured in database schema
- [x] Photo cleanup via `deleteUserPhotos()`
- [x] Account deletion endpoint (`DELETE /auth/account`)
- [x] Audit logging for deletions
- [ ] Automated cleanup jobs (Phase 03)
- [ ] Data export endpoint (Phase 02-02)
- [ ] Consent tracking table (Phase 02-02)
- [ ] Archive tables for audit logs

## Monitoring and Compliance

### Key Metrics to Track

1. Average time to complete deletion request
2. Number of data export requests per month
3. Cleanup job success rates
4. Audit log storage growth

### Incident Response

If data is retained beyond policy:
1. Document the incident
2. Notify DPO within 24 hours
3. Execute manual cleanup
4. Review and update automated jobs
5. Document remediation in incident log
