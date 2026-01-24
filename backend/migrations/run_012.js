#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

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
    ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');

    const migrationPath = path.join(__dirname, '012_fix_data_integrity.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration 012_fix_data_integrity.sql...');
    await client.query(sql);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
