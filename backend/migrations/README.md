# Database Migrations

This directory contains SQL migration files for the NoBSDating application.

## Migrations

### 003_create_safety_tables.sql

Creates the safety and moderation tables:

- **blocks table**: Stores user blocks for safety
  - `id`: Unique block ID
  - `user_id`: ID of user who blocked
  - `blocked_user_id`: ID of user who was blocked
  - `reason`: Optional reason for blocking
  - `created_at`: When the block was created

- **reports table**: Stores user reports for moderation
  - `id`: Unique report ID
  - `reporter_id`: ID of user who reported
  - `reported_user_id`: ID of user who was reported
  - `reason`: Report reason (e.g., harassment, spam, etc.)
  - `details`: Optional additional details
  - `status`: Report status (pending, reviewed, resolved, dismissed)
  - `created_at`: When the report was created
  - `updated_at`: When the report was last updated
  - `reviewed_by`: ID of moderator who reviewed (optional)
  - `reviewed_at`: When the report was reviewed (optional)
  - `resolution_notes`: Notes from moderator (optional)

## Running Migrations

### Option 1: Using the shell script (Linux/Mac)

```bash
# Make the script executable (first time only)
chmod +x run_migration.sh

# Set your database URL
export DATABASE_URL="postgresql://username:password@localhost:5432/nobsdating"

# Run the migration
./run_migration.sh
```

### Option 2: Using psql directly

```bash
# Set your database URL
export DATABASE_URL="postgresql://username:password@localhost:5432/nobsdating"

# Run the migration
psql $DATABASE_URL -f 003_create_safety_tables.sql
```

### Option 3: Manual execution

1. Connect to your PostgreSQL database
2. Copy and paste the contents of `003_create_safety_tables.sql`
3. Execute the SQL

## Verification

After running the migration, verify that the tables were created:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('blocks', 'reports');

-- View table structure
\d blocks
\d reports

-- Check indexes
\di
```

## Safety Features

These tables support the following safety features:

1. **User Blocking**
   - Users can block other users
   - Blocks are bidirectional (blocker cannot see blocked user and vice versa)
   - Existing matches are automatically deleted when a user is blocked
   - Blocks can be undone from the Safety Settings screen

2. **User Reporting**
   - Users can report inappropriate behavior
   - Reports are anonymous to the reported user
   - Multiple report reasons supported:
     - Inappropriate content
     - Harassment
     - Spam
     - Fake profile
     - Scam/fraud
     - Underage user
     - Other
   - Reports can include optional additional details
   - Moderation team can review and manage reports

## API Endpoints

The following endpoints are available in the chat-service:

### Blocking
- `POST /blocks` - Block a user
- `DELETE /blocks/:userId/:blockedUserId` - Unblock a user
- `GET /blocks/:userId` - Get blocked users for a user

### Reporting
- `POST /reports` - Submit a report
- `GET /reports` - Get all reports (for moderation)

### Unmatching
- `DELETE /matches/:matchId` - Delete a match (unmatch)

## Notes

- All IDs use VARCHAR(255) to support various ID formats
- Timestamps use TIMESTAMP WITH TIME ZONE for proper timezone handling
- Indexes are created on commonly queried fields for performance
- The blocks table has a UNIQUE constraint on (user_id, blocked_user_id) to prevent duplicate blocks
- When a user is blocked, all existing matches are automatically deleted
