#!/usr/bin/env node

// Database Migration Runner (Node.js)
// This script runs SQL migrations using the pg library

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

// Define migrations in order
const MIGRATIONS = [
  '001_create_users_and_profiles.sql',
  '002_create_matches_and_messages.sql',
  '003_create_safety_tables.sql',
  '004_add_realtime_features.sql',
  '005_add_subscriptions_table.sql',
  '006_add_auth_credentials.sql',
  '007_add_refresh_tokens.sql',
  '008_add_golden_tickets.sql',
  '009_add_date_proposals.sql',
  '010_add_verifications.sql',
  '011_add_kycaid_verification.sql',
  '012_fix_data_integrity.sql',
  '013_security_improvements.sql',
  '014_encrypt_kycaid_pii.sql',
  '015_hash_verification_tokens.sql',
  '016_add_login_attempts.sql',
  '017_create_audit_log.sql',
  '018_database_audit_triggers.sql',
  '019_add_profile_filters.sql',
  '020_token_rotation.sql',
  '021_add_after_hours_tables.sql',
  '022_add_after_hours_preferences_columns.sql',
  '023_add_matching_engine_columns.sql',
  '024_add_matches_source_column.sql',
  '025_ban_enforcement.sql',
  '026_add_user_consents.sql'
];

async function runMigrations() {
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error(`${colors.red}Error: DATABASE_URL environment variable is not set${colors.reset}`);
    console.error('Please set DATABASE_URL to your PostgreSQL connection string');
    console.error('');
    console.error('Example (PowerShell):');
    console.error('  $env:DATABASE_URL = "postgresql://user:pass@host:port/db"');
    console.error('  node run_migration.js');
    process.exit(1);
  }

  console.log(`${colors.cyan}=========================================`);
  console.log('Database Migration Runner');
  console.log(`=========================================`);
  console.log(`${colors.reset}Database: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`Migrations to run: ${MIGRATIONS.length}`);
  console.log('');

  // SECURITY NOTE: TLS Configuration for Railway PostgreSQL
  // =========================================================
  // Railway uses self-signed certificates for PostgreSQL connections and does not
  // provide a CA bundle for validation. This means:
  //
  // 1. rejectUnauthorized: false is REQUIRED for Railway connections
  // 2. Connections ARE encrypted with TLS (data in transit is protected)
  // 3. Certificate validation cannot be performed (no MITM detection)
  //
  // Mitigations:
  // - DATABASE_URL uses sslmode=require (enforces TLS, even without cert validation)
  // - Railway internal networking used where possible (private network)
  // - Railway handles certificate rotation automatically
  //
  // When Railway provides a CA bundle, update to:
  //   ssl: { rejectUnauthorized: true, ca: fs.readFileSync('railway-ca.crt') }
  //
  // Reference: https://station.railway.com/questions/postgre-sql-ssl-connection-self-signed-33f0d3b6
  // Decision: SEC-01-DOCUMENTED in .planning/phases/01-foundation-safety/SECURITY-DECISIONS.md
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway.app') ? { rejectUnauthorized: false } : false
  });

  try {
    // Connect to database
    console.log('Connecting to database...');
    await client.connect();
    console.log(`${colors.green}Connected successfully${colors.reset}`);
    console.log('');

    // Run each migration
    for (const migration of MIGRATIONS) {
      const migrationPath = path.join(__dirname, migration);

      if (!fs.existsSync(migrationPath)) {
        console.error(`${colors.red}Error: Migration file not found: ${migrationPath}${colors.reset}`);
        process.exit(1);
      }

      console.log(`${colors.yellow}Running migration: ${migration}${colors.reset}`);

      // Read and execute the SQL file
      const sql = fs.readFileSync(migrationPath, 'utf8');

      try {
        await client.query(sql);
        console.log(`${colors.green}[SUCCESS] ${migration} completed successfully${colors.reset}`);
        console.log('');
      } catch (error) {
        console.error(`${colors.red}[FAILED] Migration failed: ${migration}${colors.reset}`);
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    }

    console.log(`${colors.cyan}=========================================`);
    console.log(`${colors.green}All migrations completed successfully!${colors.reset}`);
    console.log(`${colors.cyan}=========================================${colors.reset}`);

  } catch (error) {
    console.error(`${colors.red}Database connection error: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  process.exit(1);
});
