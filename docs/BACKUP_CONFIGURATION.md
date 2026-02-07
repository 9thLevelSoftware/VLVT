# PostgreSQL Backup Configuration

## Overview

VLVT uses Railway's official `postgres-s3-backups` template for automated daily database backups to Cloudflare R2. Backups are compressed with gzip and retained for 30 days.

## Architecture

```
PostgreSQL (Railway) --> Backup Service (Railway Cron) --> R2 (Cloudflare)
                               |
                         Daily 3 AM UTC
```

**Components:**
- **Source:** PostgreSQL database on Railway
- **Backup Service:** Railway template running pg_dump on cron schedule
- **Storage:** Cloudflare R2 bucket (vlvt-backups)
- **Retention:** 30 days via R2 lifecycle rules

## Railway Backup Service

### Template

Deploy from: https://railway.app/template/postgres-s3-backups

Or search "postgres-s3-backups" in Railway templates.

### Environment Variables

| Variable | Value | Secret | Notes |
|----------|-------|--------|-------|
| AWS_ACCESS_KEY_ID | (R2 API token) | YES | From R2 API Tokens |
| AWS_SECRET_ACCESS_KEY | (R2 secret) | YES | From R2 API Tokens |
| AWS_S3_BUCKET | vlvt-backups | NO | Separate bucket for backups |
| AWS_S3_ENDPOINT | https://{ACCOUNT_ID}.r2.cloudflarestorage.com | NO | R2 endpoint URL |
| AWS_S3_REGION | auto | NO | R2 uses 'auto' |
| AWS_S3_FORCE_PATH_STYLE | true | NO | Required for R2 |
| BACKUP_DATABASE_URL | ${{Postgres.DATABASE_URL}} | YES | Railway reference syntax |
| BACKUP_CRON_SCHEDULE | 0 3 * * * | NO | Daily at 3 AM UTC |
| RUN_ON_STARTUP | false | NO | Prevent backup on every deploy |
| BACKUP_FILE_PREFIX | vlvt_backup_ | NO | Filename prefix |

### Cron Schedule

- **Schedule:** `0 3 * * *` (daily at 3 AM UTC)
- **Off-peak hours:** 3 AM UTC is ~7 PM PST / 10 PM EST
- **Minimum interval:** Railway cron minimum is 5 minutes

## Cloudflare R2 Configuration

### Bucket Setup

1. Create bucket named `vlvt-backups`
2. Configure object lifecycle for 30-day retention:
   - Go to bucket Settings -> Object Lifecycle
   - Add rule: "Delete objects older than 30 days"
   - Applies to: All objects (or prefix `vlvt_backup_`)

### API Credentials

Can reuse existing R2 credentials from profile-service if permissions allow, or create dedicated backup credentials:

1. Go to R2 -> Manage R2 API Tokens
2. Create API Token with:
   - Permissions: Object Read & Write
   - Bucket: vlvt-backups (specific bucket, not all)
   - TTL: No expiration (or long expiration with rotation)

### R2 Endpoint Format

Format: `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`

Get Account ID from: Cloudflare Dashboard -> R2 (shown in URL or sidebar)

## Backup File Format

Files are stored as: `vlvt_backup_YYYY-MM-DD_HH-MM-SS.sql.gz`

Example: `vlvt_backup_2026-01-25_03-00-00.sql.gz`

## Restore Procedure

To restore from a backup:

1. **Download backup from R2:**
   ```bash
   # Using AWS CLI configured with R2 credentials
   aws s3 cp s3://vlvt-backups/vlvt_backup_2026-01-25_03-00-00.sql.gz ./backup.sql.gz \
     --endpoint-url https://{ACCOUNT_ID}.r2.cloudflarestorage.com
   ```

2. **Decompress:**
   ```bash
   gunzip backup.sql.gz
   ```

3. **Restore to database:**
   ```bash
   psql $DATABASE_URL < backup.sql
   ```

**Important:** Restoring will overwrite existing data. For partial restores, edit the SQL file to include only the needed tables or rows.

## Monitoring

### Health Check

The backup service exposes a health endpoint. Configure uptime monitoring on:
`https://backup-service.railway.app/health`

### Success Verification

1. **R2 Console:** Check vlvt-backups bucket for new files after 3 AM UTC
2. **Railway Logs:** Check backup-service logs for completion messages
3. **File Size:** Verify backup file size is reasonable (not 0 bytes)

### Failure Alerts

Configure alerts for:
- Backup service unhealthy (uptime monitor)
- No new backup file in 25 hours (manual check or script)
- Backup file size anomaly (manual check)

## Security

- Backup files are compressed but NOT encrypted at rest beyond R2's default encryption
- Consider enabling R2 encryption if handling sensitive data exports
- Database credentials only accessible to backup service
- R2 API token scoped to vlvt-backups bucket only (principle of least privilege)
- Backup files contain full database contents including PII -- treat as sensitive

## Cost Estimate

R2 pricing (as of 2026):
- Storage: $0.015/GB/month
- Class A operations (writes): $4.50 per million
- Class B operations (reads): $0.36 per million

Estimated for VLVT beta:
- Database ~100MB compressed = ~0.1GB
- 30 days retention = ~3GB storage = ~$0.05/month
- 30 backups/month = negligible operation cost

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Backup fails with "Access Denied" | Wrong R2 credentials or bucket | Verify AWS_* env vars match R2 console |
| "Bucket not found" | Wrong endpoint or bucket name | Check AWS_S3_ENDPOINT format includes account ID |
| Empty backup file | pg_dump failed | Check BACKUP_DATABASE_URL is valid |
| Backup not running | Cron misconfigured | Verify BACKUP_CRON_SCHEDULE format |
| Version mismatch | pg_dump version != server | Template auto-detects; report issue if persists |
| Connection timeout | Network/firewall issue | Ensure backup service is in same Railway project as Postgres |
| "SignatureDoesNotMatch" | Incorrect secret key | Re-copy AWS_SECRET_ACCESS_KEY from R2 dashboard |
