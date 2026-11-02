'use strict';

const Redis = require('ioredis');
const config = require('./config');

// Shared Redis client. ioredis maintains its own connection and will
// auto-reconnect; one instance per process is the recommended pattern.
const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  console.error('[redis] error', err.message);
});

const slugKey = (slug) => `${config.redis.slugKeyPrefix}${slug}`;

// Hot-path read: resolve a slug to a URL from cache. Returns null on miss.
async function getCachedUrl(slug) {
  return redis.get(slugKey(slug));
}

// Populate the cache after a Postgres fallback.
async function cacheUrl(slug, url) {
  await redis.set(slugKey(slug), url, 'EX', config.redis.slugTtlSeconds);
}

// Invalidate a slug (e.g. if a link is deleted/updated).
async function evictUrl(slug) {
  await redis.del(slugKey(slug));
}

// Record a click without blocking the redirect: push a lightweight event
// onto a Redis list. The worker drains + aggregates these into Postgres.
async function enqueueClick(event) {
  await redis.rpush(config.redis.clickQueueKey, JSON.stringify(event));
}

module.exports = {
  redis,
  getCachedUrl,
  cacheUrl,
  evictUrl,
  enqueueClick,
};
