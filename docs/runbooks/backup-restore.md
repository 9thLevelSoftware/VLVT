# Database Backup Restore Runbook

## Overview

This runbook documents the procedure to restore the VLVT PostgreSQL database from an R2 backup. Target restore time: **under 1 hour**.

## Prerequisites

### Tools Required

- **AWS CLI v2** (for R2 access): https://aws.amazon.com/cli/
- **PostgreSQL client tools** (psql, pg_restore): Version matching production (15+)
- **gunzip** (usually pre-installed)

### Credentials Required

- R2 API credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
- R2 Account ID (for endpoint URL)
- Target database connection string

### AWS CLI Configuration for R2

```bash
# Configure AWS CLI profile for R2
aws configure --profile r2-vlvt
# AWS Access Key ID: (R2 access key)
# AWS Secret Access Key: (R2 secret key)
# Default region name: auto
# Default output format: json
```

## Restore Scenarios

### Scenario 1: Full Production Restore (Disaster Recovery)

Use when: Production database is corrupted or lost.
Target: Restore to production Railway PostgreSQL.

### Scenario 2: Point-in-Time Investigation

Use when: Need to investigate data from a specific date.
Target: Restore to separate test database.

### Scenario 3: Local Development Restore

Use when: Need production data snapshot for development/debugging.
Target: Restore to local PostgreSQL.

## Step-by-Step Procedure

### Step 1: List Available Backups (2 min)

```bash
# Set R2 endpoint
export R2_ENDPOINT="https://{ACCOUNT_ID}.r2.cloudflarestorage.com"

# List backups (most recent first)
aws s3 ls s3://vlvt-backups/ --endpoint-url $R2_ENDPOINT --profile r2-vlvt | sort -r | head -10
```

Example output:
```
2026-01-26 03:00:15    52428800 vlvt_backup_2026-01-26_03-00-00.sql.gz
2026-01-25 03:00:12    51380224 vlvt_backup_2026-01-25_03-00-00.sql.gz
```

### Step 2: Download Backup (5-15 min depending on size)

```bash
# Create working directory
mkdir -p ~/vlvt-restore && cd ~/vlvt-restore

# Download latest backup
BACKUP_FILE="vlvt_backup_2026-01-26_03-00-00.sql.gz"  # Adjust to desired backup
aws s3 cp "s3://vlvt-backups/$BACKUP_FILE" ./ --endpoint-url $R2_ENDPOINT --profile r2-vlvt

# Verify download
ls -lh $BACKUP_FILE
```

### Step 3: Decompress Backup (1-5 min)

```bash
# Decompress (keeps original by default with -k)
gunzip -k $BACKUP_FILE

# Verify decompressed file
ls -lh vlvt_backup_*.sql
```

### Step 4: Prepare Target Database

**For Railway Production (Scenario 1):**
```bash
# Get connection string from Railway dashboard
export DATABASE_URL="postgresql://user:pass@host:port/railway"

# WARNING: This will DROP existing data
# Consider creating a new database instead if possible
```

**For Test/Development (Scenario 2 & 3):**
```bash
# Create fresh database
createdb vlvt_restore_test

# Or use existing test database URL
export DATABASE_URL="postgresql://localhost/vlvt_restore_test"
```

### Step 5: Restore Database (10-30 min depending on size)

```bash
# Get the SQL filename
SQL_FILE=$(ls vlvt_backup_*.sql | head -1)

# Restore using psql (for plain SQL dumps)
psql $DATABASE_URL < $SQL_FILE

# Alternative: If backup is custom format (not plain SQL)
# pg_restore -d $DATABASE_URL $SQL_FILE --no-owner --no-privileges
```

Monitor progress:
- Large tables will show INSERT statements
- Indexes rebuild at the end (can take a few minutes)

### Step 6: Verify Restore (5 min)

```bash
# Connect to restored database
psql $DATABASE_URL

# Check table counts
SELECT 'users' AS table_name, COUNT(*) FROM users
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'matches', COUNT(*) FROM matches
UNION ALL SELECT 'messages', COUNT(*) FROM messages;

# Check recent data (should match backup date)
SELECT MAX(created_at) FROM users;
SELECT MAX(created_at) FROM messages;

# Exit psql
\q
```

### Step 7: Post-Restore Actions

**For Production Restore:**
1. Verify Railway services can connect
2. Check auth-service, profile-service, chat-service logs
3. Test critical flows (login, view profile, send message)
4. Clear any application caches if applicable

**For Test Restore:**
1. Verify data integrity
2. Perform required investigation
3. Clean up: `dropdb vlvt_restore_test`

### Step 8: Cleanup

```bash
# Remove downloaded files
cd ~
rm -rf ~/vlvt-restore
```

## Time Estimates

| Step | Estimated Time | Notes |
|------|---------------|-------|
| List backups | 2 min | Quick API call |
| Download backup | 5-15 min | Depends on size and network |
| Decompress | 1-5 min | Depends on size |
| Prepare database | 2-5 min | May need DBA access |
| Restore | 10-30 min | Depends on data volume |
| Verify | 5 min | Basic sanity checks |
| **Total** | **25-62 min** | **Within 1-hour target** |

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Access Denied" on download | Wrong R2 credentials | Verify AWS_ACCESS_KEY_ID matches R2 token |
| "Bucket not found" | Wrong endpoint URL | Check R2_ENDPOINT includes account ID |
| "permission denied" on restore | User lacks CREATE privileges | Use database owner credentials |
| "relation already exists" | Target DB not empty | DROP existing tables or use fresh DB |
| Restore hangs | Large tables | Wait; monitor with `\dt+` in another session |

### R2 Endpoint Issues

R2 endpoint format is different from AWS S3:
- **Correct:** `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`
- **Wrong:** `https://s3.us-east-1.amazonaws.com`

### PostgreSQL Version Mismatch

If restore fails with version error:
```bash
# Check backup pg_dump version (in first lines of SQL)
head -20 vlvt_backup_*.sql | grep "pg_dump"

# Ensure psql/pg_restore matches
psql --version
```

## Emergency Contacts

| Role | Contact | When to Escalate |
|------|---------|------------------|
| Database Admin | [Your DBA] | Schema issues, permissions |
| DevOps | [DevOps team] | R2 access issues, Railway config |
| On-call Engineer | [Rotation] | Production outage |

## Restore Testing Schedule

**Recommendation:** Test restore procedure monthly.

| Frequency | Test Type |
|-----------|-----------|
| Monthly | Restore to test DB, verify row counts |
| Quarterly | Full restore drill with timing |
| After schema changes | Verify backup includes new tables |

## Appendix: Restore Without AWS CLI

If AWS CLI is not available, use curl with signed URLs:

```bash
# In Railway backup-service or via R2 dashboard:
# Generate presigned URL for backup file (1 hour expiry)

# Then download:
curl -o backup.sql.gz "PRESIGNED_URL_HERE"
```

This is slower but works without local AWS CLI setup.
