# Change Request: backend integration + mock data removal

**ID:** CR-06
**Raised by:** Vishwajit (2026-05-26 chat)
**Raised on:** 2026-05-26
**Status:** draft
**Relates to OQR:** Q-BE-01 (reopened then re-resolved — backend is in,
single upstream is the gold_bi data API)

## What changes

Phase 1 stops shipping with `src/lib/mockData.js`. A Node.js + Express
backend in `backend/` proxies a single upstream API (AWS Lambda over
parquet via SELECT-only SQL), exposes the REST shape the frontend
already targets, and the frontend's existing `USE_MOCK` short-circuits
flip off.

Concretely:

1. New `backend/` Express service (Node 20+, no DB, no ORM). One
   resource = one route file. The upstream API key lives in
   `backend/.env.local` only (gitignored).
2. New endpoints under `/api/v1/plants/banmore/...` matching the
   target shape in [docs/api-contract.md](../docs/api-contract.md).
3. Frontend `.env.local` flips `VITE_USE_MOCK_DATA=false` and points
   `VITE_API_BASE_URL` at `http://localhost:3001/api/v1`.
4. Once every endpoint is verified against real upstream data,
   `src/lib/mockData.js`, `src/lib/mockDelay.js`, and the
   `USE_MOCK` branches in each `src/api/*.js` are deleted.

## Why now (what gap surfaced)

Q-BE-01 was resolved on 2026-05-20 as "no backend for Phase 1; ship
against mocks". The PM's 2026-05-26 ask reverses that — the upstream
data API exists, and Phase 1 demos should hit real numbers. The
mock-data path was always designed to be a one-flag swap (see the
`USE_MOCK` branches in `frontend/src/api/*.js`), so this is the
moment to flip it.

The previous resolution wasn't wrong — it was right *at the time*.
Backend now exists as an upstream proxy, not a new database, so the
"backend phase" footprint stays small.

## Impact analysis

- **Files affected — new (backend):**
  - `backend/package.json` (express, cors, dotenv; eslint dev)
  - `backend/.env.example` (no real key)
  - `backend/.env.local` (gitignored; holds the real key — never commit)
  - `backend/.gitignore`
  - `backend/src/index.js` (Express bootstrap, CORS, error envelope)
  - `backend/src/config.js` (env loading + validation)
  - `backend/src/upstream.js` (ONE place that talks to the AWS API)
  - `backend/src/cache.js` (30s in-memory TTL cache)
  - `backend/src/queries.js` (SQL builders; per-endpoint pure fns)
  - `backend/src/transformers.js` (gold_bi rows → frontend shapes)
  - `backend/src/routes/{plants,kpis,drills,trends,inventory,anomalies}.js`

- **Files affected — modified (frontend):**
  - `frontend/.env.local` — flip `VITE_USE_MOCK_DATA=false`, set
    `VITE_API_BASE_URL=http://localhost:3001/api/v1`
  - `frontend/docs/api-contract.md` — drop "DRAFT — DEFERRED",
    promote endpoint list to the live contract, point to the
    backend implementation
  - `frontend/docs/open-questions.md` — Q-BE-01 re-resolved (backend
    in; gold_bi single upstream)

- **Files affected — deleted (after smoke-test passes):**
  - `frontend/src/lib/mockData.js`
  - `frontend/src/lib/mockDelay.js`
  - `USE_MOCK` conditional branches inside every `frontend/src/api/*.js`

- **Specs needing rewrite or revision:**
  - `specs/02-mock-data-layer.md` — mark "SUPERSEDED by CR-06"
  - `specs/01-app-shell.md` — note mock toggle no longer used
  - All KPI/drill/trend specs (05–11) that reference `mockData.js`
    or `mockDelay.js` get a one-line CR-06 footer

- **Migrations required:** None.

- **API contract breakage:** Additive only on the frontend side. The
  same `src/api/*.js` function signatures stay; their implementations
  go from mock-returning to axios-returning.

- **Frontend reuse-library impact:** None.

- **Auth or data-model touchpoints:** Phase 1 has no auth (Q-AUTH-01).
  The AWS API key never leaves the backend.

- **Blast radius:** RED — touches backend (new), frontend env, every
  resource module, and the mock layer. Reversible by reverting the
  commit and flipping `VITE_USE_MOCK_DATA=true`.

## Sequencing — three commits, three risk levels

We split the work into three commits so a rollback at any point is
local:

### Commit A — backend scaffold (this CR's commit 1) — LOW risk

- All `backend/*` files land.
- Frontend is untouched. App still runs on mocks.
- User can `cd backend && node src/index.js` and curl localhost.
- Smoke test against real upstream (see below). Any endpoint that
  comes back empty or 502 is logged here as a follow-up task — does
  NOT block Commit A.

### Commit B — flip the switch (this CR's commit 2) — MEDIUM risk

- `frontend/.env.local` updated.
- `frontend/docs/api-contract.md` and `open-questions.md` patched.
- App is now running against the backend.
- If any endpoint breaks, the rollback is `VITE_USE_MOCK_DATA=true`
  in `.env.local` — single env-var flip, no source change.

### Commit C — gut mocks (this CR's commit 3) — HIGH risk

- `src/lib/mockData.js`, `src/lib/mockDelay.js` deleted.
- `USE_MOCK` branches removed from every `src/api/*.js`.
- Spec 02 marked superseded; affected specs (01, 05–11) get the
  CR-06 footer.
- Once this commit lands, the mock fallback is gone. Rollback
  is `git revert <sha>`.

Commit B can land before Commit C. Run on real data for a few hours
before deleting the mock safety net.

## Decision

```
[x] Take now      - per 2026-05-26 PM ask
[ ] Queue
[ ] Defer
[ ] Reject
```

**Decided by:** Vishwajit
**Decided on:** 2026-05-26

## Column scope (PM call, 2026-05-26)

The following gold_bi columns are **out of scope** for Phase 1 and
MUST NOT appear in any payload:

- `previous_values` — frontend already renders the ▲/▼ delta as
  optional; the field is simply absent.
- `threshold_value` — KPI cards lose the "Target: X" line. Trend
  charts lose the dashed target line.
- `status` — Red/Yellow/Green pills colour from client-side rules
  on `actual_value` alone (the artifact already does this:
  `value >= 90 → green` etc.).
- `remarks` — not surfaced anywhere.
- `drill_down_level` — drill content is read from `drill_down_attribute`
  JSON inline, not by joining different `drill_down_level` rows.
- `record_id` — internal; never surfaced.

Each row carries ONE KPI measurement (`actual_value`) at one
(`plant`, `section`, `kpi_name`, `date`), and its drill-down detail
inline in `drill_down_attribute` (JSON-encoded string). All drill
panels parse that JSON to render their content.

Consequences worth flagging:

- **Anomalies strip is stubbed** to `[]` until you give us a signal
  (e.g. a dedicated `kpi_name = 'Anomaly'` row). The original plan
  to filter `status = 'Red'` no longer applies.
- **`backend/src/queries.js`** SELECTs only the columns above —
  ignored columns are never pulled, saving bytes and making intent
  obvious.
- **`backend/src/transformers.js`** ignores anything in the row that
  isn't in scope.

## Open questions logged

- **Q-BE-01 (re-resolved):** Backend is in. Single upstream API.
  Backend lives in this monorepo at `backend/`. Node + Express, no
  DB. See `backend/README.md` (TODO: replace placeholder content
  written 2026-05-20).
- **Q-GB-01 (new — gold_bi column semantics):** Several columns
  (`drill_down_attribute`, `production_ids`, `granularity`, the
  exact `kpi_name` strings) are documented by schema but not by
  value examples. Phase 1 transformers code against best-effort
  guesses; once a real query returns rows, log column→shape
  mappings as RESOLVED here and patch `transformers.js`.
- **Q-GB-02 (new — section/category vocabulary):** `queries.js`
  maps frontend ids (`mix`/`stk`/`tbm`/`cur` and `p`/`q`/`c`/`m`/`s`/
  `i`) to gold_bi human strings (`Mixing`/`TBM`/`Curing`/`Stock`,
  `Productivity`/`Quality`/...). Confirm these match what the data
  actually uses; case-sensitive comparison breaks otherwise.
- **Q-GB-03 (new — date format):** Schema says `date DATE` but
  illustrative screenshot mixed `25-02-2026` and `1/3/2026`. The
  upstream `WHERE date >= 'YYYY-MM-DD'` clauses assume ISO 8601.
  Verify on first real query; add a date-normalisation pass in the
  transformer if needed.

## Smoke-test plan (run after Commit A)

Run from `backend/`:

```bash
npm install                                              # one-time
cp .env.example .env.local                               # if not already
# edit .env.local — set AWS_DATA_API_KEY
node src/index.js                                        # boots on :3001
```

Then from another terminal:

```bash
# Static endpoints — should always work, never touch upstream.
curl -s localhost:3001/api/v1/health | jq
curl -s localhost:3001/api/v1/plants/banmore | jq
curl -s localhost:3001/api/v1/plants/banmore/sections | jq
curl -s localhost:3001/api/v1/plants/banmore/category-tabs | jq

# Upstream-backed endpoints — exercise gold_bi.
curl -s "localhost:3001/api/v1/plants/banmore/kpis?section=mix&tab=p" | jq
curl -s "localhost:3001/api/v1/plants/banmore/kpis?section=tbm&tab=q" | jq
curl -s "localhost:3001/api/v1/plants/banmore/drills/oee?section=tbm" | jq
curl -s "localhost:3001/api/v1/plants/banmore/drills/production?section=mix" | jq
curl -s "localhost:3001/api/v1/plants/banmore/drills/downtime?section=tbm" | jq
curl -s "localhost:3001/api/v1/plants/banmore/inventory" | jq
# Anomalies stubbed to [] until a signal is wired (no `status` column).
curl -s "localhost:3001/api/v1/plants/banmore/anomalies" | jq
curl -s "localhost:3001/api/v1/plants/banmore/trends/oee?section=mix&category=p&kpiName=OEE" | jq

# Negative path
curl -s localhost:3001/api/v1/plants/laksar | jq                # 404 with envelope
curl -s "localhost:3001/api/v1/plants/banmore/kpis" | jq        # 400 missing params
```

For each one, capture in this CR's footer:
- ✅ if `data` array/object came back with sane rows
- ⚠️ if `data: []` (means the upstream has no matching rows — that's a
  data-side issue, not a code one)
- ❌ if `error` envelope returned with code (capture the message)

After all upstream endpoints return ✅ or ⚠️ (no ❌), proceed to Commit B.

## Done when

- All `backend/*` files committed (Commit A).
- Smoke-test footer filled out below this line.
- Frontend flipped (Commit B); manual click-through on Banmore /
  Production passes.
- Mocks gutted (Commit C); `npm run check` passes; commit lands.

---

## Smoke-test results (fill in after Commit A boot)

| Endpoint | Result | Notes |
|----------|--------|-------|
| /health | | |
| /plants/banmore | | |
| /plants/banmore/sections | | |
| /plants/banmore/category-tabs | | |
| /plants/banmore/summary | | |
| /plants/banmore/kpis?section=mix&tab=p | | |
| /plants/banmore/drills/oee?section=tbm | | |
| /plants/banmore/drills/production?section=mix | | |
| /plants/banmore/drills/downtime?section=tbm | | |
| /plants/banmore/inventory | | |
| /plants/banmore/anomalies | | |
| /plants/banmore/trends/oee | | |
