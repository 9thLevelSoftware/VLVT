# Database Migration Runner (PowerShell)
# This script runs SQL migrations against the PostgreSQL database

$ErrorActionPreference = "Stop"

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "Error: DATABASE_URL environment variable is not set" -ForegroundColor Red
    Write-Host "Please set DATABASE_URL to your PostgreSQL connection string"
    Write-Host ""
    Write-Host "Example:"
    Write-Host '  $env:DATABASE_URL = "postgresql://user:pass@host:port/db"'
    exit 1
}

# Get the directory where this script is located
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Define migrations in order
$MIGRATIONS = @(
    "001_create_users_and_profiles.sql",
    "002_create_matches_and_messages.sql",
    "003_create_safety_tables.sql"
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Database Migration Runner" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Database: $env:DATABASE_URL"
Write-Host "Migrations to run: $($MIGRATIONS.Count)"
Write-Host ""

# Run each migration
foreach ($MIGRATION in $MIGRATIONS) {
    $MIGRATION_FILE = Join-Path $SCRIPT_DIR $MIGRATION

    if (-not (Test-Path $MIGRATION_FILE)) {
        Write-Host "Error: Migration file not found: $MIGRATION_FILE" -ForegroundColor Red
        exit 1
    }

    Write-Host "Running migration: $MIGRATION" -ForegroundColor Yellow

    # Run the migration using psql
    $result = psql $env:DATABASE_URL -f $MIGRATION_FILE

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] $MIGRATION completed successfully" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "[FAILED] Migration failed: $MIGRATION" -ForegroundColor Red
        exit 1
    }
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "All migrations completed successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
