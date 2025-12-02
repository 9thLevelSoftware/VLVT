# Database Migration Runner using Railway CLI (PowerShell)
# This script runs SQL migrations using Railway's psql connection

$ErrorActionPreference = "Stop"

# Get the directory where this script is located
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Define migrations in order - ALL migrations must be listed here
$MIGRATIONS = @(
    "001_create_users_and_profiles.sql",
    "002_create_matches_and_messages.sql",
    "003_create_safety_tables.sql",
    "004_add_realtime_features.sql",
    "005_add_subscriptions_table.sql",
    "006_add_auth_credentials.sql"
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Database Migration Runner (Railway)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Migrations to run: $($MIGRATIONS.Count)"
Write-Host ""

# Check if Railway CLI is installed
try {
    $railwayVersion = railway --version 2>&1
    Write-Host "Railway CLI: $railwayVersion" -ForegroundColor Gray
} catch {
    Write-Host "Error: Railway CLI is not installed" -ForegroundColor Red
    Write-Host "Install it with: npm install -g @railway/cli"
    exit 1
}

# Check if linked to a project
Write-Host "Checking Railway project link..." -ForegroundColor Yellow
try {
    railway status 2>&1 | Out-Null
} catch {
    Write-Host "Error: Not linked to a Railway project" -ForegroundColor Red
    Write-Host "Run: railway link"
    exit 1
}

Write-Host ""

# Run each migration
foreach ($MIGRATION in $MIGRATIONS) {
    $MIGRATION_FILE = Join-Path $SCRIPT_DIR $MIGRATION

    if (-not (Test-Path $MIGRATION_FILE)) {
        Write-Host "Error: Migration file not found: $MIGRATION_FILE" -ForegroundColor Red
        exit 1
    }

    Write-Host "Running migration: $MIGRATION" -ForegroundColor Yellow

    # Read the SQL file content
    $SQL_CONTENT = Get-Content $MIGRATION_FILE -Raw

    # Run the migration using railway connect (handles internal/external URLs automatically)
    # Pipe SQL content to railway connect postgres
    try {
        $SQL_CONTENT | railway connect postgres
        Write-Host "[SUCCESS] $MIGRATION completed successfully" -ForegroundColor Green
        Write-Host ""
    } catch {
        Write-Host "[FAILED] Migration failed: $MIGRATION" -ForegroundColor Red
        Write-Host "Error: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "All migrations completed successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
