'use strict';

const express = require('express');
const config = require('./config');
const { pool } = require('./db');
const { redis } = require('./redis');
const linksRouter = require('./routes/links');
const resolveRouter = require('./routes/resolve');

const app = express();
app.use(express.json());

// Health check (used by Docker / load balancer).
app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// Management API.
app.use('/', linksRouter);

// Resolver / redirect — registered LAST so specific routes win over /:slug.
app.use('/', resolveRouter);

// Centralised error handler.
app.use((err, _req, res, _next) => {
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`[api] listening on :${config.port}`);
});

// Graceful shutdown so in-flight requests finish and pools close cleanly.
async function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    await redis.quit();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
