'use strict';

// Centralised config, read once from the environment.
// Pool sizes are documented here and in the README; keep them in sync with
// your Postgres `max_connections` budget (API replicas * poolMax + worker
// poolMax must stay well under the server limit).

const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  // Base URL used when returning short links to clients.
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',

  postgres: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://snip:snip@localhost:5432/snip',

    // Connection pool size for the API process.
    // Sized for the hot redirect path: most GET /:slug requests are served
    // from Redis and never touch Postgres, so 10 connections per API replica
    // comfortably absorbs cache misses + writes without exhausting PG.
    // Budget: replicas(2) * poolMax(10) + worker(5) = 25 connections.
    poolMax: parseInt(process.env.PG_POOL_MAX || '10', 10),
    poolMin: parseInt(process.env.PG_POOL_MIN || '0', 10),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(
      process.env.PG_CONN_TIMEOUT_MS || '5000',
      10
    ),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    // TTL for hot slug -> URL cache entries (seconds).
    slugTtlSeconds: parseInt(process.env.SLUG_TTL_SECONDS || '3600', 10),
    // Redis list the API pushes click events onto; the worker drains it.
    clickQueueKey: process.env.CLICK_QUEUE_KEY || 'snip:clicks:queue',
    slugKeyPrefix: 'snip:slug:',
  },
};

module.exports = config;
