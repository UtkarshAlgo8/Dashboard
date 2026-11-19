# JK Dashboard — Backend

Self-hosted SigNoz configuration: [observability guide](../observability/README.md).

Node.js + Express service that proxies a single upstream `gold_dummy`
data API (AWS Lambda over parquet, SELECT/WITH only) and exposes the
REST shape consumed by `../frontend/`. No DB, no ORM.

Phase 1 scope: Banmore plant, Production function only. Re-scaffolded
2026-05-27 under [CR-07](../frontend/specs/cr/CR-07-backend-rebuild.md)
after the original CR-06 scaffold was reverted to address vocabulary
mismatches surfaced by real data inspection.

## Quickstart

```bash
cd backend
npm install
cp .env.example .env.local
# Edit .env.local — paste AWS_DATA_API_KEY.
npm run dev          # boots on :3001 with auto-restart
# or: npm start
```

Health check: `curl localhost:3001/api/v1/health`.

## URL layout

```
/api/v1
├── /health
├── /plants                       (static)
├── /functions                    (static)
├── /sections                     (static)
├── /category-tabs                (static — Inventory tab disabled)
└── /plants
    └── /:id
        ├── /                     (one plant — banmore only)
        ├── /summary              (upstream)
        ├── /inventory            (stub [] — no Inventory category in gold_dummy yet)
        ├── /anomalies            (stub [] — no status signal)
        └── /production
            ├── /kpis             (upstream)
            ├── /trends           (upstream)
            └── /drills
                ├── /oee
                ├── /production
                ├── /downtime
                ├── /plan-compliance
                └── /scrap-traceability
```

Per Q-NAV-01, only `plants/banmore` is enabled; other plant IDs
return `PLANT_NOT_AVAILABLE` 404.

## Architecture

```
src/
  index.js          Express bootstrap, CORS, mounts, error envelope
  config.js         .env loader + validator (.env.local then .env)
  upstream.js       The ONE module that talks to the AWS endpoint
                    (holds the API key). Other modules call runQuery(sql).
  cache.js          In-memory TTL cache (default 30s)
  queries.js        SQL builders (pure functions). Hand-built strings —
                    every literal goes through escapeLiteral().
  transformers.js   gold_dummy rows → frontend payload shapes
  routes/
    static.js       /plants, /functions, /sections, /category-tabs
    plants.js       /:id, /:id/summary
    kpis.js         /production/kpis
    drills.js       /production/drills/{oee,production,downtime,
                                        plan-compliance,scrap-traceability}
    trends.js       /production/trends
    inventory.js    /inventory (stub)
    anomalies.js    /anomalies (stub)
```

## gold_dummy schema

Confirmed via Postman 2026-05-26:

```
record_id BIGINT, date STRING (DD-MM-YYYY),
plant STRING, department STRING, section STRING, tyre_type STRING,
machine STRING, product_type STRING, itemcode STRING,
granularity STRING (Daily | Shift A | Shift B | Shift C),
category STRING (Cost | Morale | Productivity | Quality | Safety),
kpi_name STRING, unit_of_measurement STRING,
production_ids STRING, drill_down_attribute STRING (JSON-encoded),
drill_down_level INT, actual_value DOUBLE,
previous_values DOUBLE, threshold_value DOUBLE,
status STRING, remarks STRING,
day INT, hour STRING, month STRING, year INT
```

**Ignored Phase 1** (PM scope 2026-05-26): `previous_values`,
`threshold_value`, `status`, `remarks`, `drill_down_level`,
`record_id`, `hour`.

**NULL sentinel**: gold_dummy stores missing strings as the literal
`"nan"`, not SQL NULL. `queries.js` filters with `= 'nan'` /
`!= 'nan'`; `transformers.js` converts `"nan"` to `null` at the API
boundary.

**Date filtering**: `date` is a `DD-MM-YYYY` string — lexicographic
range is wrong. Range queries use the dedicated `year` (INT) +
`month` (STRING) columns instead. See `dateRangeFilter` in
`queries.js`.

**Shift wiring**: the dashboard's Today-only Shift selector (CR-05)
maps to `granularity` values via `granularityForShift()`:
`a/b/c → "Shift A/B/C"`, `all → no filter`, otherwise `"Daily"`.

## Response envelope

Mirrors `frontend/docs/api-contract.md`:

- Success: `{ "data": ... }`
- Error: `{ "error": { "code": "...", "message": "..." } }`

Status codes: 200 normal, 400 validation, 404 unknown route or
disabled plant, 500 unhandled, 502 upstream error, 504 upstream timeout.

## Caching

`cache.js` wraps every upstream-backed route with a 30 s in-memory
TTL keyed by `(route, sorted query)`. Process restart clears it.

## Security notes

- API key lives in `.env.local` only (gitignored).
- No CORS wildcards — `FRONTEND_ORIGIN` is read from env.
- Every SQL literal goes through `escapeLiteral`.
- Only SELECT / WITH (CTE) is forwarded; everything else rejected
  in `upstream.js` before the fetch.
