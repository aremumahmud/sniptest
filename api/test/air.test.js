'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const TOKEN = 'test-benchmark-token';

// Build a fresh Express app and apply registerAirRoutes under the current
// env. We do NOT import src/index.js so the real server never starts and
// Redis is never contacted (the air module only touches Postgres).
function makeApp() {
  const app = express();
  app.use(express.json());
  require('../src/air').registerAirRoutes(app);
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function call(server, method, p, { headers = {}, body } = {}) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

// (a) Support routes return 404 when AIR_BENCHMARK_MODE is not 1.
test('(a) /__air routes are unregistered (404) without the mode flag', async () => {
  delete process.env.AIR_BENCHMARK_MODE;
  const server = await listen(makeApp());
  try {
    const seed = await call(server, 'POST', '/__air/seed?scale=1');
    assert.strictEqual(seed.status, 404);
    const ready = await call(server, 'GET', '/__air/ready');
    assert.strictEqual(ready.status, 404);
  } finally {
    server.close();
  }
});

// (b) Support routes return 401 without the correct token.
test('(b) /__air routes return 401 without a valid token', async () => {
  process.env.AIR_BENCHMARK_MODE = '1';
  process.env.AIR_BENCHMARK_TOKEN = TOKEN;
  const server = await listen(makeApp());
  try {
    const noHeader = await call(server, 'GET', '/__air/ready');
    assert.strictEqual(noHeader.status, 401);

    const wrong = await call(server, 'GET', '/__air/ready', {
      headers: { 'X-AIR-Benchmark-Token': 'nope' },
    });
    assert.strictEqual(wrong.status, 401);

    const ok = await call(server, 'GET', '/__air/ready', {
      headers: { 'X-AIR-Benchmark-Token': TOKEN },
    });
    assert.strictEqual(ok.status, 200);
  } finally {
    server.close();
  }
});

// (c) Seeding at scale 1 creates the expected row counts.
// Requires a reachable Postgres; skips cleanly if none is configured.
test('(c) seeding at scale 1 creates ~1000 rows per table', async (t) => {
  process.env.AIR_BENCHMARK_MODE = '1';
  process.env.AIR_BENCHMARK_TOKEN = TOKEN;

  const { pool } = require('../src/db');
  const reachable = await ensureSchema(pool);
  if (!reachable) {
    t.skip('no Postgres reachable (set DATABASE_URL to run this assertion)');
    return;
  }

  const { seed, countSeeded, cleanupSeeded } = require('../src/air/seed');
  await cleanupSeeded();
  await seed(1);
  const counts = await countSeeded();
  assert.strictEqual(counts.users, 1000, 'users');
  assert.strictEqual(counts.links, 1000, 'links');
  assert.strictEqual(counts.click_stats, 1000, 'click_stats');
  await cleanupSeeded();
});

// Try to connect and apply the (idempotent) schema. Returns false if the DB
// is unreachable so the test can skip rather than fail in offline envs.
async function ensureSchema(pool) {
  try {
    await pool.query('SELECT 1');
  } catch {
    return false;
  }
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '001_init.sql'),
    'utf8'
  );
  await pool.query(sql);
  return true;
}

// Close the shared pool so the test process exits cleanly.
after(async () => {
  try {
    await require('../src/db').pool.end();
  } catch {}
});
