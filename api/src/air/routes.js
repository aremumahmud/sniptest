'use strict';

const express = require('express');
const { seed, createTestUsers } = require('./seed');

// Tracks seeding progress so GET /__air/ready can report completion.
let state = { seeding: false, done: false, error: null };

function buildAirRouter() {
  const router = express.Router();

  // POST /__air/seed?scale=N — create realistic test data at N x base size.
  router.post('/seed', async (req, res) => {
    const scale = req.query.scale ?? 1;
    state = { seeding: true, done: false, error: null };
    try {
      const result = await seed(scale);
      state = { seeding: false, done: true, error: null };
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      state = { seeding: false, done: false, error: err.message };
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /__air/users — create test users for the "customers" group.
  // Returns emails. The app has no auth, so there are no passwords/tokens.
  router.post('/users', async (req, res) => {
    const count = req.body?.count ?? 5;
    try {
      const emails = await createTestUsers(count);
      res.status(200).json({
        users: emails.map((email) => ({ email, password: null })),
        note: 'This app has no authentication; benchmark auth strategy is "none".',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /__air/ready — 200 once seeding has finished.
  router.get('/ready', (_req, res) => {
    if (state.seeding) return res.status(503).json({ ready: false, seeding: true });
    if (state.error) return res.status(503).json({ ready: false, error: state.error });
    return res.status(200).json({ ready: true, seeded: state.done });
  });

  return router;
}

// Exposed for tests that want to reset progress between cases.
function _resetState() {
  state = { seeding: false, done: false, error: null };
}

module.exports = { buildAirRouter, _resetState };
