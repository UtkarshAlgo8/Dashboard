# Change Request: backend rebuild on confirmed gold_dummy vocabulary

**ID:** CR-07
**Raised by:** Vishwajit (2026-05-27 chat)
**Raised on:** 2026-05-27
**Status:** in progress
**Relates to OQR:** Q-BE-01 (re-resolved again), Q-GB-01, Q-GB-02,
Q-SH-01 (reversed), Q-INV-01 (new)

## What changes

Re-scaffold the backend that CR-06 created and CR-06's revert (commit
`34eea39`) removed. This time built against the **actual** gold_dummy
data vocabulary (confirmed via Postman), not against guesses.

Concretely:

1. New `backend/` Express service (same architecture as CR-06).
2. New endpoints under `/api/v1/...` matching the URL shape the
   frontend's `src/api/*.js` already targets.
3. Frontend env flipped: `VITE_USE_MOCK_DATA=false`,
   `VITE_API_BASE_URL=http://localhost:3001/api/v1`.
4. Inventory category-tab disabled in `CategoryTabs.jsx` with a
   "Phase 2" tooltip (gold_dummy has no Inventory rows yet).
5. CR-05's Shift selector is now meaningful — wires to
   `granularity = 'Shift A/B/C'`.

## Why now (what gap surfaced)

CR-06 shipped on best-effort assumptions about gold_bi (`section =
'Mixing'`, ISO dates, SQL NULL for missing values). Smoke testing
surfaced that the real table is `gold_dummy`, dates are
`DD-MM-YYYY` strings, missing strings are the literal `"nan"`, and
the category vocabulary excludes Inventory. Rather than patch
CR-06's wrong defaults piecemeal, the user reverted CR-06 in full
and asked for a rebuild with the confirmed values baked in.

This is exactly what Q-GB-01/02 logged as OPEN — they're now
RESOLVED in the same CR that fixes the code.

## Impact analysis

- **Files affected — new (backend):** same set as CR-06 (package.json,
  .env.example, .gitignore, README.md, src/{index,config,upstream,
  cache,queries,transformers}.js, src/routes/{static,plants,kpis,
  drills,trends,inventory,anomalies}.js).
- **Files affected — modified (frontend):**
  - `frontend/.env` → live backend defaults (3001, mock=false)
  - `frontend/.env.example` → ditto
  - `frontend/src/components/production/CategoryTabs.jsx` → honour
    `tab.enabled === false` (disabled + Phase 2 tooltip)
  - `frontend/docs/api-contract.md` → LIVE status
  - `frontend/docs/open-questions.md` → Q-BE-01 re-resolved + Q-GB-01,
    Q-GB-02, Q-INV-01
- **Blast radius:** YELLOW — one new tree (`backend/`) + one frontend
  component patch + env flip. Rollback = `git revert <CR-07-sha>` to
  go back to mocks.
- **API contract breakage:** None on the frontend side. Resource
  modules use the same function signatures; they go from mock-returning
  to axios-returning when `VITE_USE_MOCK_DATA=false`.

## Decision

```
[x] Take now      - per 2026-05-27 PM ask
[ ] Queue
[ ] Defer
[ ] Reject
```

**Decided by:** Vishwajit
**Decided on:** 2026-05-27

## Differences from CR-06 (what changed)

| Concern | CR-06 (reverted) | CR-07 (this CR) |
|---|---|---|
| Table name | `gold_bi` (guess) | `gold_dummy` (confirmed) |
| Date format | ISO `WHERE date >= 'YYYY-MM-DD'` | DD-MM-YYYY string; range filtered via `year` (INT) + `month` (STRING) columns |
| NULL handling | `IS NULL` / `IS NOT NULL` | Literal `= 'nan'` / `!= 'nan'` (string sentinel) |
| Shift selector | Pure UI, no data filter | Wired to `granularity = 'Shift A/B/C'` |
| Inventory tab | Active | Disabled with "Phase 2" tooltip |
| CTE | `WITH ranked AS ...` (rejected by upstream) | Subquery: `SELECT ... FROM (SELECT ...) ranked WHERE rn = 1` |
| Status pill / target / previous | Surfaced as `null` placeholders | Not surfaced at all (PM scope call) |
| KPI grid shape | `{id, name, value, unit, drillDown}` | Full artifact shape: `{id, name, value, unit, spark, trend, trendFavourable, drillable, drillDown}` |

## Smoke-test plan

Boot:
```bash
cd backend
npm install                                    # one-time
cp .env.example .env.local                     # if needed
# edit .env.local — paste AWS_DATA_API_KEY
npm run dev                                    # :3001
```

Static (never hits upstream — MUST work even with empty parquet):
```bash
curl -s localhost:3001/api/v1/health | jq
curl -s localhost:3001/api/v1/plants | jq
curl -s localhost:3001/api/v1/sections | jq
curl -s localhost:3001/api/v1/category-tabs | jq
curl -s localhost:3001/api/v1/functions | jq
curl -s localhost:3001/api/v1/plants/banmore | jq
```

Upstream-backed (need gold_dummy rows to return non-empty):
```bash
curl -s "localhost:3001/api/v1/plants/banmore/production/kpis?section=mix&tab=p" | jq
curl -s "localhost:3001/api/v1/plants/banmore/production/kpis?section=cur&tab=m&shift=a" | jq
curl -s "localhost:3001/api/v1/plants/banmore/production/drills/oee?section=tbm" | jq
curl -s "localhost:3001/api/v1/plants/banmore/production/trends?kpiId=oee&section=mix&category=p" | jq
curl -s "localhost:3001/api/v1/plants/banmore/summary" | jq
```

Stubs (always return `{ data: [] }`):
```bash
curl -s "localhost:3001/api/v1/plants/banmore/inventory" | jq
curl -s "localhost:3001/api/v1/plants/banmore/anomalies" | jq
```

## Done when

- Backend boots, /health OK, static endpoints return data.
- KPI grid endpoint returns ≥ 1 card per `(section, tab)` slice that
  has data in gold_dummy, with `spark` + `trend` populated.
- Frontend reloaded with `VITE_USE_MOCK_DATA=false` shows live data
  on the Banmore dashboard.
- Inventory tab is visible-but-disabled with a "Phase 2" tooltip.
- `logs/history.md` reflects the commit.
