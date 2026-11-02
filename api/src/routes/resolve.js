'use strict';

const express = require('express');
const { query } = require('../db');
const { getCachedUrl, cacheUrl, enqueueClick } = require('../redis');

const router = express.Router();

// GET /:slug — THE HOT PATH.
// 1. Try Redis (slug -> URL).
// 2. On miss, fall back to Postgres and backfill the cache.
// 3. Record the click asynchronously (push to Redis list; worker aggregates).
// 4. 302 redirect.
//
// Keep this tight: on a cache hit we touch Redis twice (GET + click RPUSH)
// and never hit Postgres.
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    let targetUrl = await getCachedUrl(slug);
    let linkId = null;

    if (targetUrl === null) {
      // Cache miss — fall back to the database.
      const { rows } = await query(
        `SELECT id, target_url FROM links WHERE slug = $1`,
        [slug]
      );
      if (rows.length === 0) {
        return res.status(404).send('Not found');
      }
      linkId = rows[0].id;
      targetUrl = rows[0].target_url;
      // Backfill the cache so the next hit stays off Postgres.
      await cacheUrl(slug, targetUrl);
    }

    // Fire-and-forget click record. Never block the redirect on it.
    enqueueClick({
      slug,
      linkId, // may be null on a cache hit; worker resolves by slug
      ts: Date.now(),
      ua: req.get('user-agent') || null,
    }).catch((err) => console.error('[resolve] enqueueClick failed', err.message));

    // 302 so the mapping can change later without clients caching it.
    return res.redirect(302, targetUrl);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
