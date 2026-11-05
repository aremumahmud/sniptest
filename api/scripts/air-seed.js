'use strict';

// CLI entry point for AIR's setup.seed.command.
//   node scripts/air-seed.js --scale N
// Reuses the same seed() logic as the HTTP support route. Inert unless
// AIR_BENCHMARK_MODE=1 so it can never seed a production database by accident.
const { seed } = require('../src/air/seed');
const { pool } = require('../src/db');

async function main() {
  if (process.env.AIR_BENCHMARK_MODE !== '1') {
    console.error('[air-seed] refusing to run: AIR_BENCHMARK_MODE is not 1');
    process.exit(1);
  }

  const idx = process.argv.indexOf('--scale');
  const scale = idx >= 0 ? process.argv[idx + 1] : 1;

  const result = await seed(scale);
  console.log('[air-seed] done', JSON.stringify(result));
  await pool.end();
}

main().catch(async (err) => {
  console.error('[air-seed] failed', err.message);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
