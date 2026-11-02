'use strict';

// Snip click-aggregation worker.
// Drains the Redis click queue in batches and upserts per-day click counts
// into Postgres. Keeping clicks off the redirect hot path means the resolver
// only does a Redis RPUSH; durable aggregation happens here.

const Redis = require('ioredis');
const { Pool } = require('pg');

const config = {
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://snip:snip@localhost:5432/snip',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  clickQueueKey: process.env.CLICK_QUEUE_KEY || 'snip:clicks:queue',
  // How many events to pull per flush, and how often to flush.
  batchSize: parseInt(process.env.BATCH_SIZE || '500', 10),
  flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS || '2000', 10),
  // Worker pool is small: it runs one aggregation query per flush, serially.
  poolMax: parseInt(process.env.PG_POOL_MAX || '5', 10),
};

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.poolMax,
});

// Pull up to batchSize events off the front of the list atomically.
async function drainBatch() {
  // LPOP with count (Redis >= 6.2) returns up to N elements.
  const raw = await redis.lpop(config.clickQueueKey, config.batchSize);
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  });
}

// Aggregate a batch of events into (link_id, day) -> count, then upsert.
async function flush(events) {
  // Resolve any events that arrived with only a slug (cache-hit path).
  const bySlug = new Map();
  const counts = new Map(); // key: `${linkId}|${day}` -> count

  for (const ev of events) {
    if (!ev) continue;
    const day = new Date(ev.ts || Date.now()).toISOString().slice(0, 10);
    if (ev.linkId) {
      bump(counts, ev.linkId, day);
    } else if (ev.slug) {
      const list = bySlug.get(ev.slug) || [];
      list.push(day);
      bySlug.set(ev.slug, list);
    }
  }

  const client = await pool.connect();
  try {
    // Resolve slugs -> link ids for cache-hit events.
    if (bySlug.size > 0) {
      const slugs = [...bySlug.keys()];
      const { rows } = await client.query(
        `SELECT id, slug FROM links WHERE slug = ANY($1)`,
        [slugs]
      );
      const slugToId = new Map(rows.map((r) => [r.slug, r.id]));
      for (const [slug, days] of bySlug) {
        const linkId = slugToId.get(slug);
        if (!linkId) continue; // link deleted; drop the click
        for (const day of days) bump(counts, linkId, day);
      }
    }

    if (counts.size === 0) return 0;

    // Upsert each (link_id, day) bucket, incrementing the stored count.
    await client.query('BEGIN');
    for (const [key, n] of counts) {
      const [linkId, day] = key.split('|');
      await client.query(
        `INSERT INTO click_stats (link_id, day, clicks, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (link_id, day)
         DO UPDATE SET clicks = click_stats.clicks + EXCLUDED.clicks,
                       updated_at = now()`,
        [linkId, day, n]
      );
    }
    await client.query('COMMIT');
    return counts.size;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function bump(counts, linkId, day) {
  const key = `${linkId}|${day}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}

let running = true;

async function loop() {
  while (running) {
    try {
      const events = await drainBatch();
      if (events.length === 0) {
        await sleep(config.flushIntervalMs);
        continue;
      }
      const buckets = await flush(events);
      console.log(
        `[worker] flushed ${events.length} clicks into ${buckets} buckets`
      );
    } catch (err) {
      console.error('[worker] flush error', err.message);
      await sleep(config.flushIntervalMs);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shutdown(signal) {
  console.log(`[worker] ${signal} received, stopping`);
  running = false;
  await pool.end();
  await redis.quit();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[worker] started, draining', config.clickQueueKey);
loop();
