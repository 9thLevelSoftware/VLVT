#!/bin/bash

# Database Migration Runner
# This script runs SQL migrations against the PostgreSQL database

set -e  # Exit on error

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL to your PostgreSQL connection string"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define migrations in order
MIGRATIONS=(
    "001_create_users_and_profiles.sql"
    "002_create_matches_and_messages.sql"
    "003_create_safety_tables.sql"
)

echo "========================================="
echo "Database Migration Runner"
echo "========================================="
echo "Database: $DATABASE_URL"
echo "Migrations to run: ${#MIGRATIONS[@]}"
echo ""

# Run each migration
for MIGRATION in "${MIGRATIONS[@]}"; do
    MIGRATION_FILE="$SCRIPT_DIR/$MIGRATION"

    if [ ! -f "$MIGRATION_FILE" ]; then
        echo "Error: Migration file not found: $MIGRATION_FILE"
        exit 1
    fi

    echo "Running migration: $MIGRATION"

    # Run the migration using psql
    if psql "$DATABASE_URL" -f "$MIGRATION_FILE"; then
        echo "✓ $MIGRATION completed successfully"
        echo ""
    else
        echo "✗ Migration failed: $MIGRATION"
        exit 1
    fi
done

echo "========================================="
echo "All migrations completed successfully!"
echo "========================================="
