'use strict';

// Minimal migration runner: applies every .sql file in migrations/ in order.
// Idempotent because the DDL uses IF NOT EXISTS.
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`[migrate] applying ${file}`);
    await pool.query(sql);
  }
  console.log('[migrate] done');
  await pool.end();
}

run().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
