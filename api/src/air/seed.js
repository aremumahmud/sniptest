'use strict';

// AIR benchmark seed logic — shared by the HTTP support route
// (POST /__air/seed) and the CLI (scripts/air-seed.js).
//
// Reuses the existing shared pg Pool and the real `users` / `links` /
// `click_stats` tables. All seeded rows carry a recognisable marker so they
// can be counted and cleaned up without touching any organic data.
const { pool } = require('../db');

const USER_EMAIL_PREFIX = 'air-seed-user-';
const LINK_SLUG_PREFIX = 'airseed-';
const TEST_USER_PREFIX = 'air-test-user-';

// Base size at scale 1 — AIR multiplies this by the requested scale.
const BASE_ROWS = 1000;

function normalizeScale(scale) {
  const n = Math.floor(Number(scale));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// Create ~BASE_ROWS * scale rows in each of users, links, click_stats.
// Bulk-inserted via generate_series (fast enough for scale 100) and
// idempotent via ON CONFLICT DO NOTHING so re-seeding is safe.
async function seed(scale = 1) {
  const n = normalizeScale(scale);
  const rows = BASE_ROWS * n;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // users — unique email per row.
    await client.query(
      `INSERT INTO users (email)
       SELECT $1 || g || '@example.test'
         FROM generate_series(1, $2) AS g
       ON CONFLICT (email) DO NOTHING`,
      [USER_EMAIL_PREFIX, rows]
    );

    // links — one per seeded user (round-robin is 1:1 since counts match).
    await client.query(
      `INSERT INTO links (user_id, slug, target_url)
       SELECT u.id, $1 || g, 'https://example.test/path/' || g
         FROM generate_series(1, $2) AS g
         JOIN users u ON u.email = $3 || g || '@example.test'
       ON CONFLICT (slug) DO NOTHING`,
      [LINK_SLUG_PREFIX, rows, USER_EMAIL_PREFIX]
    );

    // click_stats — one (link, day) bucket per seeded link.
    await client.query(
      `INSERT INTO click_stats (link_id, day, clicks)
       SELECT l.id, CURRENT_DATE - ((g - 1) % 30), 1 + (g % 50)
         FROM generate_series(1, $1) AS g
         JOIN links l ON l.slug = $2 || g
       ON CONFLICT (link_id, day) DO NOTHING`,
      [rows, LINK_SLUG_PREFIX]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return { scale: n, expected: { users: rows, links: rows, click_stats: rows } };
}

// Count only the seeded (marker-carrying) rows.
async function countSeeded() {
  const users = await pool.query(
    `SELECT count(*)::int AS c FROM users WHERE email LIKE $1`,
    [USER_EMAIL_PREFIX + '%']
  );
  const links = await pool.query(
    `SELECT count(*)::int AS c FROM links WHERE slug LIKE $1`,
    [LINK_SLUG_PREFIX + '%']
  );
  const clickStats = await pool.query(
    `SELECT count(*)::int AS c
       FROM click_stats cs
       JOIN links l ON l.id = cs.link_id
      WHERE l.slug LIKE $1`,
    [LINK_SLUG_PREFIX + '%']
  );
  return {
    users: users.rows[0].c,
    links: links.rows[0].c,
    click_stats: clickStats.rows[0].c,
  };
}

// Remove seeded rows. Deleting links cascades their click_stats
// (click_stats.link_id has ON DELETE CASCADE).
async function cleanupSeeded() {
  await pool.query(`DELETE FROM links WHERE slug LIKE $1`, [
    LINK_SLUG_PREFIX + '%',
  ]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [
    USER_EMAIL_PREFIX + '%',
  ]);
}

// Create deterministic test users (for AIR's "customers" group) and return
// their emails. This app has NO authentication and the users table has no
// password column, so there are no passwords/tokens to return.
async function createTestUsers(count = 5) {
  const n = Math.max(1, Math.floor(Number(count) || 5));
  await pool.query(
    `INSERT INTO users (email)
     SELECT $1 || g || '@example.test'
       FROM generate_series(1, $2) AS g
     ON CONFLICT (email) DO NOTHING`,
    [TEST_USER_PREFIX, n]
  );
  const emails = [];
  for (let g = 1; g <= n; g++) emails.push(`${TEST_USER_PREFIX}${g}@example.test`);
  return emails;
}

module.exports = {
  seed,
  countSeeded,
  cleanupSeeded,
  createTestUsers,
  USER_EMAIL_PREFIX,
  LINK_SLUG_PREFIX,
  TEST_USER_PREFIX,
  BASE_ROWS,
};
