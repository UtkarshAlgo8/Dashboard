# JK Dashboard — Backend

Node.js + Express service that proxies a single upstream gold_bi data
API and exposes the REST shape consumed by `../frontend/`. No DB, no
ORM. Phase 1 scope: Banmore plant, Production function only.

## Status

Scaffolded under [CR-06](../frontend/specs/cr/CR-06-backend-integration.md)
on 2026-05-26. Boot is wired; smoke-tests against the real upstream
are deferred to the developer's local machine (the agent's auto-mode
classifier blocks outbound calls to undeclared external services).

## Quickstart

```bash
cd backend
npm install
cp .env.example .env.local
# Edit .env.local — paste AWS_DATA_API_KEY.
# .env.local is gitignored. Never commit a real key.
npm run dev          # nodemon-style auto-restart on file change
# or: npm start      # one-shot
```

Server boots on `PORT` (default 3001). Health check:
`curl localhost:3001/api/v1/health`.

## Architecture

```
src/
  index.js          Express bootstrap, CORS, /api/v1 mount, error envelope
  config.js         .env loader + validator
  upstream.js       The ONE module that talks to the AWS endpoint
                    (holds the API key). Other modules call runQuery(sql).
  cache.js          In-memory TTL cache (default 30s) for upstream results
  queries.js        SQL builders (pure functions). Hand-built strings —
                    every literal goes through escapeLiteral().
  transformers.js   gold_bi rows → frontend payload shapes
  routes/
    plants.js       /, /sections, /category-tabs, /summary
    kpis.js         /kpis?section=&tab=
    drills.js       /drills/{oee,production,downtime,plan-compliance,scrap-trace}
    trends.js       /trends/:kpiId
    inventory.js    /inventory
    anomalies.js    /anomalies
```

All resource routes mount under `/api/v1/plants/:plantId/...`. The
`plantId` is checked in handlers — only `banmore` is enabled in
Phase 1 (others return a `PLANT_NOT_AVAILABLE` 404).

## Upstream contract

The upstream is one POST endpoint that runs SELECT-only SQL against a
parquet table. Configured via env (`AWS_DATA_URL`, `AWS_DATA_API_KEY`,
`AWS_DATA_TABLE`).

`src/upstream.js` is the ONLY module that imports those env values
or invokes `fetch`. If you find yourself reaching for `fetch` in a
new file, write a function in `upstream.js` and import it instead.

## Response envelope

Mirrors `frontend/docs/api-contract.md`:

- Success: `{ "data": ... }`
- Error: `{ "error": { "code": "...", "message": "..." } }`

Status codes: 200 normal, 400 validation error, 404 unknown route or
disabled plant, 500 unhandled, 502 upstream error, 504 upstream timeout.

## Caching

`cache.js` wraps every upstream-backed route with a 30 s in-memory
TTL keyed by `(route, sorted query)`. Stale entries are evicted on
read. Process restart clears it. Frontend polls at 60 s, so the
typical request pattern is one upstream hit followed by one cached
serve.

To bypass cache during debugging: comment out the `cached(...)` call
in the route, or set `CACHE_TTL_MS=0`.

## Adding a new endpoint

1. Write a SQL builder in `src/queries.js` (pure function, returns a
   string). Use `escapeLiteral` for every user-supplied value.
2. Write a transformer in `src/transformers.js` mapping rows to the
   frontend shape.
3. Add a route handler in the right `routes/*.js` file.
4. Mount it in `src/index.js` if you added a new resource file.
5. Add a curl example to the smoke-test section in
   `frontend/specs/cr/CR-06-backend-integration.md`.

## Security notes

- API key lives in `.env.local` only. `.gitignore` covers `.env`,
  `.env.local`, and `*.log` already.
- No CORS wildcards — `FRONTEND_ORIGIN` is read from env.
- Query builders escape every literal. We do NOT pass user input
  directly into the upstream SQL string.
- Only SELECT is forwarded. `upstream.js` enforces this with a
  regex guard before any fetch call.

## Open questions

See [`../frontend/docs/open-questions.md`](../frontend/docs/open-questions.md)
— Q-GB-01, Q-GB-02, Q-GB-03 (gold_bi shape verification) are logged
under CR-06. Resolve them on first real query.
