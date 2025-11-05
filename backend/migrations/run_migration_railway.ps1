# Database Migration Runner using Railway CLI (PowerShell)
# This script runs SQL migrations using Railway's psql connection

$ErrorActionPreference = "Stop"

# Get the directory where this script is located
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

# Define migrations in order
$MIGRATIONS = @(
    "001_create_users_and_profiles.sql",
    "002_create_matches_and_messages.sql",
    "003_create_safety_tables.sql"
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Database Migration Runner (Railway)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Migrations to run: $($MIGRATIONS.Count)"
Write-Host ""

# Check if Railway CLI is installed
try {
    railway --version | Out-Null
} catch {
    Write-Host "Error: Railway CLI is not installed" -ForegroundColor Red
    Write-Host "Install it with: npm install -g @railway/cli"
    exit 1
}

Write-Host "Checking Railway connection..." -ForegroundColor Yellow
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

    # Run the migration using Railway CLI
    # Use railway run to execute psql with the SQL content
    $SQL_CONTENT | railway run psql `$DATABASE_URL

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
