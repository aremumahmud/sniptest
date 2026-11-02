-- Snip schema: users, links, clicks (aggregated).

CREATE TABLE IF NOT EXISTS users (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS links (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  slug       TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);

-- Aggregated click counts, one row per (link, day).
-- The worker upserts into this table from the Redis click queue.
CREATE TABLE IF NOT EXISTS click_stats (
  link_id    BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  day        DATE NOT NULL,
  clicks     BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, day)
);

CREATE INDEX IF NOT EXISTS idx_click_stats_link ON click_stats(link_id);
