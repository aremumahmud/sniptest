# Snip

A minimal, production-shaped URL shortener.

- **API** — Node.js + Express. Creates links, resolves slugs (hot path), serves stats.
- **Web** — Next.js (SSR) frontend to create links and view click stats.
- **Postgres** — source of truth: `users`, `links`, `click_stats` (aggregated).
- **Redis** — hot `slug → URL` cache + a click event queue.
- **Worker** — drains the Redis click queue and aggregates clicks into Postgres.

## Repo tree

```
snip/
├── docker-compose.yml          # postgres + redis + api + worker + web
├── README.md
├── .gitignore
├── api/
│   ├── Dockerfile              # builds & runs the API
│   ├── .dockerignore
│   ├── .env.example
│   ├── package.json
│   ├── migrations/
│   │   └── 001_init.sql        # users, links, click_stats
│   └── src/
│       ├── index.js            # express app, routes, graceful shutdown
│       ├── config.js           # env + POOL SIZE (documented)
│       ├── db.js               # pg Pool (shared)
│       ├── redis.js            # ioredis client + cache/queue ops
│       ├── slug.js             # base62 slug generator
│       ├── migrate.js          # applies migrations/*.sql
│       └── routes/
│           ├── links.js        # POST /links, GET /links, GET /links/:id/stats
│           └── resolve.js      # GET /:slug  (THE HOT PATH)
├── worker/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       └── index.js            # batch-drains Redis → upserts click_stats
└── web/
    ├── Dockerfile
    ├── next.config.js
    ├── .env.example
    ├── package.json
    └── app/
        ├── layout.js
        ├── page.js             # SSR list + create form
        ├── actions.js          # server action: create link
        ├── lib/api.js          # API client
        └── links/[id]/page.js  # SSR stats page
```

## Endpoints

| Method | Path               | Purpose                                              |
|--------|--------------------|------------------------------------------------------|
| POST   | `/links`           | Create a short link. Body `{ url, userId?, slug? }`. |
| GET    | `/links`           | List links (`?userId=`, `?limit=`, `?offset=`).      |
| GET    | `/links/:id/stats` | Total + per-day click counts.                        |
| GET    | `/:slug`           | **Hot path.** Resolve + record click + 302 redirect. |
| GET    | `/healthz`         | Liveness (pings PG + Redis).                          |

## The hot path (`GET /:slug`)

1. `GET` slug from **Redis**.
2. On a **miss**, `SELECT target_url FROM links WHERE slug = $1` in Postgres, then backfill the cache.
3. `RPUSH` a lightweight click event onto the Redis queue (fire-and-forget — the redirect never blocks on it, and never writes to Postgres synchronously).
4. `302` redirect.

The worker drains that queue in batches (`LPOP ... count`) and `INSERT ... ON CONFLICT DO UPDATE`s per-`(link_id, day)` counts into `click_stats`.

## Connection pool

Configured in [`api/src/config.js`](api/src/config.js) via `pg`'s `Pool`:

- **API pool: `max = 10` per replica.** Most redirects are Redis cache hits and never touch Postgres, so 10 connections absorbs cache-miss reads + link writes comfortably.
- **Worker pool: `max = 5`.** It runs one aggregation transaction per flush, serially.
- **Budget:** `api_replicas(2) × 10 + worker(5) = 25` connections — well under Postgres's default `max_connections = 100`.

Tune via `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONN_TIMEOUT_MS`.

## Run it

```bash
cd snip
docker compose up --build
# web  → http://localhost:3000
# api  → http://localhost:3001
```

The API container runs `migrate.js` before starting.

### Without Docker (local dev)

```bash
# 1. start Postgres + Redis however you like, set DATABASE_URL / REDIS_URL
cd api && npm install && npm run migrate && npm start   # :3001
cd ../worker && npm install && npm start
cd ../web && npm install && npm run dev                 # :3000
```

## Quick check

```bash
# create
curl -s -XPOST localhost:3001/links -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}'
# -> { "slug":"abc1234", "shortUrl":"http://localhost:3001/abc1234", ... }

# follow (records a click)
curl -sI localhost:3001/abc1234      # 302 Location: https://example.com

# stats (after the worker flushes, ~2s)
curl -s localhost:3001/links/1/stats
```
# sniptest
