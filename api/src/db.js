'use strict';

const { Pool } = require('pg');
const config = require('./config');

// Single shared connection pool for the whole API process.
// Reusing one Pool (instead of connecting per request) is what keeps the hot
// redirect path cheap on the rare cache-miss that hits Postgres.
const pool = new Pool({
  connectionString: config.postgres.connectionString,
  max: config.postgres.poolMax,
  min: config.postgres.poolMin,
  idleTimeoutMillis: config.postgres.idleTimeoutMillis,
  connectionTimeoutMillis: config.postgres.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  // Idle client errors shouldn't crash the process.
  console.error('[pg] idle client error', err.message);
});

// Thin query helper so every call site goes through the pool.
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
