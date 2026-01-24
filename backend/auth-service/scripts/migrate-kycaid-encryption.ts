#!/usr/bin/env npx ts-node
/**
 * KYCAID Data Migration Script
 *
 * Migrates existing plaintext KYCAID PII data to encrypted_pii column.
 * This is a one-time migration that should be run after setting KYCAID_ENCRYPTION_KEY.
 *
 * The migration:
 * 1. Finds records with plaintext PII (first_name, last_name, etc.) but no encrypted_pii
 * 2. Encrypts the PII using PostgreSQL's encrypt_kycaid_pii function
 * 3. Clears the plaintext columns after successful encryption
 *
 * Usage:
 *   DATABASE_URL=... KYCAID_ENCRYPTION_KEY=... npx ts-node scripts/migrate-kycaid-encryption.ts
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *   --batch=N    Process N records at a time (default: 100)
 *
 * Prerequisites:
 *   - Migration 014_encrypt_kycaid_pii.sql must be applied (creates encrypt_kycaid_pii function)
 *   - KYCAID_ENCRYPTION_KEY must be set (32-byte key, generate with: openssl rand -base64 32)
 */

import { Pool } from 'pg';

// Parse command line arguments
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '100', 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  console.log('');
  console.log('KYCAID Data Migration Script');
  console.log('============================');
  console.log('');

  // Validate environment
  const databaseUrl = process.env.DATABASE_URL;
  const encryptionKey = process.env.KYCAID_ENCRYPTION_KEY;

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('');
    console.error('Example:');
    console.error('  DATABASE_URL=postgresql://user:pass@host:5432/db npm run migrate:kycaid-encryption');
    process.exit(1);
  }

  if (!encryptionKey) {
    console.error('ERROR: KYCAID_ENCRYPTION_KEY environment variable is required');
    console.error('');
    console.error('Generate a 32-byte key:');
    console.error('  openssl rand -base64 32');
    console.error('');
    console.error('Then set it:');
    console.error('  KYCAID_ENCRYPTION_KEY=<key> npm run migrate:kycaid-encryption');
    process.exit(1);
  }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  // Connect to database
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    // Verify the encryption function exists
    try {
      await pool.query('SELECT encrypt_kycaid_pii($1::jsonb, $2) as test', ['{}', encryptionKey]);
    } catch (err) {
      console.error('ERROR: encrypt_kycaid_pii function not found');
      console.error('Make sure migration 014_encrypt_kycaid_pii.sql has been applied');
      process.exit(1);
    }

    // Count records needing migration (have plaintext, no encrypted)
    const countResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM kycaid_verifications
      WHERE encrypted_pii IS NULL
        AND (first_name IS NOT NULL OR last_name IS NOT NULL OR document_number IS NOT NULL)
    `);

    const totalCount = parseInt(countResult.rows[0].count, 10);
    console.log(`Records to migrate: ${totalCount}`);

    if (totalCount === 0) {
      console.log('');
      console.log('No records need migration. All KYCAID data is already encrypted or empty.');
      console.log('');
      await pool.end();
      return;
    }

    if (DRY_RUN) {
      // Show sample of what would be migrated
      const sampleResult = await pool.query(`
        SELECT id, user_id,
               CASE WHEN first_name IS NOT NULL THEN '***' ELSE NULL END as first_name,
               CASE WHEN last_name IS NOT NULL THEN '***' ELSE NULL END as last_name,
               CASE WHEN document_number IS NOT NULL THEN '***' ELSE NULL END as document_number,
               created_at
        FROM kycaid_verifications
        WHERE encrypted_pii IS NULL
          AND (first_name IS NOT NULL OR last_name IS NOT NULL OR document_number IS NOT NULL)
        LIMIT 5
      `);

      console.log('');
      console.log('Sample of records that would be migrated:');
      console.table(sampleResult.rows);
      console.log('');
      console.log('DRY RUN COMPLETE - No changes were made.');
      console.log('Remove --dry-run flag to perform the migration.');
      console.log('');
      await pool.end();
      return;
    }

    // Confirm before proceeding
    console.log('');
    console.log('WARNING: This will encrypt PII data and clear plaintext columns.');
    console.log('         Make sure you have a database backup before proceeding.');
    console.log('');
    console.log('Starting migration in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Process in batches
    let migrated = 0;
    let errors = 0;

    while (migrated + errors < totalCount) {
      // Fetch batch of records
      const batchResult = await pool.query(`
        SELECT id, first_name, last_name, date_of_birth, document_number, document_expiry
        FROM kycaid_verifications
        WHERE encrypted_pii IS NULL
          AND (first_name IS NOT NULL OR last_name IS NOT NULL OR document_number IS NOT NULL)
        LIMIT $1
      `, [BATCH_SIZE]);

      if (batchResult.rows.length === 0) break;

      // Migrate each record in a transaction
      for (const row of batchResult.rows) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const piiData = JSON.stringify({
            first_name: row.first_name,
            last_name: row.last_name,
            date_of_birth: row.date_of_birth,
            document_number: row.document_number,
            document_expiry: row.document_expiry
          });

          await client.query(`
            UPDATE kycaid_verifications
            SET encrypted_pii = encrypt_kycaid_pii($1::jsonb, $2),
                first_name = NULL,
                last_name = NULL,
                date_of_birth = NULL,
                document_number = NULL,
                document_expiry = NULL,
                updated_at = NOW()
            WHERE id = $3
          `, [piiData, encryptionKey, row.id]);

          await client.query('COMMIT');
          migrated++;

          // Progress indicator
          process.stdout.write(`\rProgress: ${migrated}/${totalCount} migrated, ${errors} errors`);
        } catch (err) {
          await client.query('ROLLBACK');
          errors++;
          console.error(`\nError migrating record ${row.id}:`, err instanceof Error ? err.message : err);
        } finally {
          client.release();
        }
      }
    }

    console.log('');
    console.log('');
    console.log('Migration Complete');
    console.log('==================');
    console.log(`Successfully migrated: ${migrated}`);
    console.log(`Errors: ${errors}`);

    if (errors > 0) {
      console.log('');
      console.log('WARNING: Some records failed to migrate. Review errors above.');
      console.log('You may need to re-run the script after fixing the issues.');
      process.exit(1);
    }

    // Verify migration
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as remaining
      FROM kycaid_verifications
      WHERE encrypted_pii IS NULL
        AND (first_name IS NOT NULL OR last_name IS NOT NULL OR document_number IS NOT NULL)
    `);

    const remaining = parseInt(verifyResult.rows[0].remaining, 10);
    if (remaining > 0) {
      console.log('');
      console.log(`WARNING: ${remaining} records still have unencrypted PII.`);
    } else {
      console.log('');
      console.log('Verification: All PII data has been encrypted.');
    }

    console.log('');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('');
  console.error('Migration failed with error:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
