const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSeed() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
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
