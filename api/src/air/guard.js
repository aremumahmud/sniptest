'use strict';

// Every request to an /__air support route must carry
// `X-AIR-Benchmark-Token` equal to AIR_BENCHMARK_TOKEN. Fail closed: if no
// token is configured, or it doesn't match, reject with 401.
function airBenchmarkGuard(req, res, next) {
  const expected = process.env.AIR_BENCHMARK_TOKEN;
  const provided = req.get('X-AIR-Benchmark-Token');
  if (!expected || !provided || provided !== expected) {
    return res
      .status(401)
      .json({ error: 'Missing or invalid X-AIR-Benchmark-Token' });
  }
  next();
}

module.exports = { airBenchmarkGuard };
