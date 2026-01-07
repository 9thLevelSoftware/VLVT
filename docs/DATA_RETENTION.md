# Data Retention Policy

## Overview

This document defines data retention periods and cleanup procedures for VLVT.

## Retention Periods

| Data Category | Retention Period | Cleanup Method | Notes |
|--------------|------------------|----------------|-------|
| User accounts | Indefinite (until deletion) | User-initiated | Cascade deletes related data |
| Profile data | Indefinite (until deletion) | User-initiated | Includes photos in R2 |
| Messages | 1 year after last activity | Automated job | Matches with no activity |
| Audit logs | 2 years | Automated job | Security/compliance requirement |
| FCM tokens | 90 days inactive | Automated job | Stale device cleanup |
| Refresh tokens | 7 days | Automated (expiry) | Built into token flow |
| KYCAID data | 5 years (regulatory) | Manual review | AML/KYC compliance |

## Cleanup Jobs (TODO)

The following automated cleanup jobs need to be implemented:

### 1. Message Retention Job

```sql
-- Delete messages from inactive matches (no messages in 1 year)
DELETE FROM messages
WHERE match_id IN (
  SELECT m.id FROM matches m
  WHERE (
    SELECT MAX(created_at) FROM messages WHERE match_id = m.id
  ) < NOW() - INTERVAL '1 year'
);
```

### 2. FCM Token Cleanup Job

```sql
-- Delete FCM tokens not updated in 90 days
DELETE FROM fcm_tokens
WHERE updated_at < NOW() - INTERVAL '90 days';
```

### 3. Audit Log Archival Job

```sql
-- Archive audit logs older than 2 years
INSERT INTO audit_logs_archive
SELECT * FROM audit_logs
WHERE created_at < NOW() - INTERVAL '2 years';

DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '2 years';
```

## Implementation Roadmap

1. **Phase 1** (Current): Document policies
2. **Phase 2**: Create migration for archive tables
3. **Phase 3**: Implement cleanup jobs as scheduled tasks
4. **Phase 4**: Add monitoring and alerting for job failures

## User Rights

### Right to Access (GDPR Art. 15)
Users can request all data via `/profile/:userId` and `/messages` endpoints.

### Right to Erasure (GDPR Art. 17)
Account deletion removes:
- User record and credentials
- Profile and photos (including R2 storage)
- All matches and messages
- FCM tokens
- Audit log entries (anonymized, not deleted)

### Right to Portability (GDPR Art. 20)
TODO: Implement data export endpoint returning JSON.

## Consent Records

TODO: Implement consent tracking table:
- Analytics consent
- Marketing consent
- Push notification consent
- Location sharing consent
