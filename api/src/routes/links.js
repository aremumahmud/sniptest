'use strict';

const express = require('express');
const { query } = require('../db');
const { cacheUrl } = require('../redis');
const { generateSlug } = require('../slug');
const config = require('../config');

const router = express.Router();

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// POST /links — create a short link.
// Body: { url: string, userId?: number, slug?: string (custom) }
router.post('/links', async (req, res, next) => {
  try {
    const { url, userId = null, slug: customSlug } = req.body || {};

    if (!url || !isValidUrl(url)) {
      return res
        .status(400)
        .json({ error: 'A valid http(s) `url` is required.' });
    }

    // Retry a few times on slug collision (unique_violation = 23505).
    const maxAttempts = customSlug ? 1 : 5;
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const slug = customSlug || generateSlug();
      try {
        const { rows } = await query(
          `INSERT INTO links (user_id, slug, target_url)
           VALUES ($1, $2, $3)
           RETURNING id, user_id, slug, target_url, created_at`,
          [userId, slug, url]
        );
        const link = rows[0];

        // Warm the cache immediately so the first redirect is a cache hit.
        await cacheUrl(link.slug, link.target_url);

        return res.status(201).json({
          ...link,
          shortUrl: `${config.baseUrl}/${link.slug}`,
        });
      } catch (err) {
        lastErr = err;
        if (err.code === '23505') {
          if (customSlug) {
            return res
              .status(409)
              .json({ error: 'That custom slug is already taken.' });
          }
          continue; // random collision — try a new slug
        }
        throw err;
      }
    }
    throw lastErr;
  } catch (err) {
    next(err);
  }
});

// GET /links — list links (most recent first). Optional ?userId= filter.
router.get('/links', async (req, res, next) => {
  try {
    const { userId } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);

    const { rows } = userId
      ? await query(
          `SELECT id, user_id, slug, target_url, created_at
             FROM links
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        )
      : await query(
          `SELECT id, user_id, slug, target_url, created_at
             FROM links
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

    res.json({
      links: rows.map((l) => ({
        ...l,
        shortUrl: `${config.baseUrl}/${l.slug}`,
      })),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

// GET /links/:id/stats — aggregated click stats for a link.
router.get('/links/:id/stats', async (req, res, next) => {
  try {
    const { id } = req.params;

    const linkResult = await query(
      `SELECT id, slug, target_url, created_at FROM links WHERE id = $1`,
      [id]
    );
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found.' });
    }

    // Daily buckets written by the aggregation worker.
    const daily = await query(
      `SELECT day, clicks
         FROM click_stats
        WHERE link_id = $1
        ORDER BY day DESC
        LIMIT 90`,
      [id]
    );

    const totalResult = await query(
      `SELECT COALESCE(SUM(clicks), 0)::bigint AS total
         FROM click_stats
        WHERE link_id = $1`,
      [id]
    );

    res.json({
      link: linkResult.rows[0],
      totalClicks: Number(totalResult.rows[0].total),
      daily: daily.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
