'use strict';

const { airBenchmarkGuard } = require('./guard');
const { buildAirRouter } = require('./routes');

// Mount the AIR benchmark support routes under /__air — but ONLY when
// AIR_BENCHMARK_MODE=1. When it isn't, nothing is registered, so every
// /__air request falls through to Express's default 404. This is the single
// integration point called from src/index.js; it is a no-op in production.
function registerAirRoutes(app) {
  if (process.env.AIR_BENCHMARK_MODE !== '1') return false;
  app.use('/__air', airBenchmarkGuard, buildAirRouter());
  console.log('[air] benchmark support routes registered under /__air');
  return true;
}

module.exports = { registerAirRoutes };
