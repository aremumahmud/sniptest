'use strict';

const crypto = require('crypto');

const ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Generate a random base62 slug. Default length 7 gives ~3.5 trillion values,
// so collisions are rare; callers rely on the DB unique constraint + retry
// to handle the pathological case.
function generateSlug(length = 7) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

module.exports = { generateSlug };
