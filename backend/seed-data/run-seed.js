const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSeed() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
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
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false
  });

  try {
    const seedSQL = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    console.log('Running seed script...');
    await pool.query(seedSQL);
    console.log('✅ Seed data inserted successfully!');
  } catch (error) {
    console.error('❌ Error running seed script:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeed();
