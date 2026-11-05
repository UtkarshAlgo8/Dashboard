# BTP Product Uniformity drilldown — implementation/reviewer handoff

## Scope

Quality > Product: MTMS, TUO, ZF Uniformity, ZF Balancing, DBM. Gold machine/SKU tables for all five; parameter/failure tables for MTMS/ZF/DBM; raw plots only MTMS/DBM. TUO Silver status/barcodes are intentionally deferred, not substituted. Its SKU table remains available and shows an explicit disabled status action.

Original guide and all seven SQL files are preserved **unchanged** in `references/uniformity-v1.2/`; `provenance.json` records source paths/archive SHA-256 and individual hashes. `athena-schema-metadata.json` records the two authorized, bounded metadata-only queries and results. No production fact scans, raw samples or live parity queries were authorized/performed.

## Execution and correctness

- New authenticated routes under existing Product/JWT mount:
  - `GET /api/v1/quality/product/uniformity/gold`
  - `GET /api/v1/quality/product/uniformity/barcodes`
  - `GET /api/v1/quality/product/uniformity/points`
- Inputs: `plant=BANMORE`, allowlisted `card`, `period=day|month|year|range`, real ordered ISO `from/to`, `shift=ALL|A|B|C`, selected `level=machine|sku|parameter` for Gold; required machine/SKU/parameter for Silver; bounded limit/offset. Shift only on a single day; range at most 366 dates. All request identities are validated before building SQL or reading cache. Builders revalidate and escape every literal; identifiers come from fixed maps.
- Gold uses the existing Quality `gold.gold`/`gold.gold_daily` resolver, BANMORE / Quality / Uniformity Testing scope on the entire relation, exact guide KPI maps, stored DAY/SHIFT/MONTH/YEAR values, and DAY arithmetic for arbitrary ranges. Athena performs sums, weighted yields and failed/tested percentages. **No KPI arithmetic is delegated to the frontend.** SKU tested denominators include selected days without a particular parameter row. Missing counts/weights remain null; zero denominators produce null, not fabricated percentages. No yield/quantity anchor row means no displayed entity. Duplicate Gold period/identity rows cause an explicit error rather than arbitrary deduplication/summing.
- Silver maps the three supplied facts to the same Athena `silver.*` names. The user confirmed `plant_code='BTP'` on MTMS/ZF/DBM facts and recipe dimension; it applies before barcode ranking/recipe grouping. Recipe lookup retains `MIN(description)` grouped by tyre size. DBM machine mapping is exactly the supplied 278/279/280 mapping; DBM integer grades are explicitly cast for the supplied 0/1 OE rule. MTMS/ZF use A/B.
- Latest test remains per barcode across BTP: only the lower date boundary is applied before ranking. Machine, SKU, shift and end boundary follow ranking. Retests on another machine/SKU/shift or after the selected window therefore remove the old test, per the supplied SQL. Equal timestamps use descending stored `record_id` as a deterministic secondary ordering; timestamps remain the primary latest-test criterion.
- Only selected measurement/grade/identity fields are read in the Silver source projection. No unverified partition fields/predicates were invented. Lower-bound-only ranking necessarily considers later retests; pushing the end boundary or machine/SKU into that input would be faster but wrong.
- User confirmed recorded IST **wall-clock** semantics. `CAST(format_datetime(event_time, 'yyyy-MM-dd HH:mm:ss.SSS') AS timestamp)` preserves recorded fields without directly casting a zoned timestamp or converting it to Asia/Kolkata. Production day is clock minus seven hours; A 07–15, B 15–23, C 23–07. Frontend chart x coordinates preserve those same fields without timezone reinterpretation.
- Potential unrelated inconsistency: existing Live SKU comments warn against direct zoned-to-timestamp normalization, while its event expressions still directly cast event time. This task does **not** change that code. The clock expression here is covered by synthetic fixture tests, not a claim of real-data timezone verification.
- ZF has grades only: Value blank and no plot action. LSL/USL are always `—`; no spec-table work. Barcode totals are distinct latest-test rows. If live Gold/Silver totals disagree, the UI warns with both counts rather than fabricating rows/zeroes.

## Network/performance bounds

- One Athena query on an uncached selected Gold level/page. Opening a card does not preload its SKUs/parameters. Clicking a count performs one Silver page query; opening a plot performs one point-page query. No Silver work on card/table render.
- `COUNT(*) OVER()` supplies total in the same query. SQL has stable identity ordering and `LIMIT pageSize+1` sentinel. Server verifies returned length against that total and raises `INCOMPLETE_PAGE` if upstream silently caps a nonempty page. Gold and barcode default page size 100, maximum 200; plot default 1,000, maximum 2,000. Offset maximum 1,000,000. The browser uses 100-row tables and 1,000-point chunks.
- Barcode paging replaces the visible page; no complete raw table is transferred/calculated client-side. Raw plots append the next chunk only on explicit **Load next** action. No sampling or aggregation; every loaded reading has one point, red markers use `is_off_spec`, tooltip includes barcode/test time/shift/value/grade, and x zoom is enabled. Before all chunks load the dialog explicitly says **partial**. At 20,000 displayed points it requires narrowing the period and still says incomplete. Changing totals/overlapping barcode chunks are rejected, not silently merged.
- Backend uses shared `cached()`/in-flight deduplication with source version plus every validated scope and page field serialized as one nested scope object (free-text identity separators cannot alias another scope); Gold TTL 5 minutes, Silver TTL 1 minute. Feature-local concurrency: at most 4 uncached Athena requests, 32 queued; excess returns 503. No changes to other dashboard transport/cache defaults.
- Browser exact-URL cache: 1 minute, 64 entries, in-flight deduplication; at most 2 active page requests, 16 queued. Late/unmounted requests cannot overwrite newer views; request identity is checked even during the render before an effect runs. Failed requests are not cached. Already-issued superseded requests may finish/cache, but their rows are not rendered.
- Offset pages are not a transactional source snapshot. Plot append detects count changes/duplicate barcodes; same-total source churn cannot be completely detected through the existing upstream contract. The UI asks to reopen on detected churn. No invented upstream query-result cursor/snapshot API was added.
- No production latency promise: only metadata availability was checked live. Query execution performance and actual Gold/Silver parity await separately approved read-only validation.

## Checks and reproducibility

Use existing installed dependencies; worktree `node_modules` links are local test conveniences, **not changes to commit**. No install, secret copy, commit, push or merge.

```sh
AWS_DATA_URL=http://127.0.0.1:1 AWS_DATA_API_KEY=fixture NODE_ENV=test \
 AUTH_ENABLED=false DB_HOST=127.0.0.1 DB_PORT=1 CACHE_DRIVER=memory \
 CACHE_WARM_ENABLED=false CACHE_MATERIALIZE_ENABLED=false CACHE_PREHEAT_ENABLED=false \
 node --test backend/src/quality/uniformity/*.test.js backend/src/quality/product.test.js \
 backend/src/utils/upstream.test.js backend/src/quality/queries/gold-source.test.js \
 backend/src/quality/ctp/ctp.test.js
node --test frontend/tests/uniformityDrill.test.js frontend/src/lib/paintWeight.test.js \
 frontend/src/lib/compliance.test.js frontend/src/lib/ctpQualityRag.test.js
cd frontend && npm run check
```

- **71 targeted backend tests passed after independent review** (the implementer snapshot had 67). They cover SQL maps/allowlists/escaping, dates/granularities, weighted arithmetic, denominators, missing/duplicate values, latest tests across windows/machines/SKUs/shifts, distinct barcode parity, pagination/truncation, errors, read counts, cache isolation/deduplication, bounded concurrency, authenticated routes and TUO denial without a source read. Four independent regressions add free-text cache-key collision isolation, strict companion scope/zero denominators/duplicate parameter percentages, disjoint Gold freshness execution, and latest-test ties/recipe duplicate collapse/fallback/null-grade/missing-reading behavior. The cache regression failed against the original flattened key and passed after the feature-local nested-scope fix; no shared cache code changed.
- Offline SQLite execution translates only Athena clock/interval/page syntax; it validates relational logic with fixtures, **not real Athena execution**. Synthetic boundaries include 07:00/15:00/23:00, midnight, month edge, explicit offsets and leap dates.
- **23 frontend tests passed**, including six new feature tests plus existing Paint Weight, compliance and CTP RAG regressions. New tests cover navigation/back reset, period selection, plot availability, raw page correctness, API scope/deduplication/error retry/concurrency and integration wiring. The mock-only browser regression also passed with no uncaught browser exceptions.
- Optional mock-only full-dashboard browser regression: `PLAYWRIGHT_MODULE=<existing-playwright-index.mjs> node frontend/tests/uniformity.browser.mjs` (from repository root; module resolves Vite through frontend). Uses isolated dev port 5178, blocks external requests and mocks every API. Tests no preload, precise next-level scope, raw chunk loading/point counts, red points, tooltip rendering via Highcharts point mouse-over API, actual drag zoom, barcode pagination, ZF blanks/no plots, TUO disabled status action, error retry, empty results and late-response race guards. Screenshots: `/tmp/b-uni-raw-plot-fixture.png`, `/tmp/b-uni-drill-fixture.png`. No claim of live-browser data validation.
- Baseline and final `npm run check`: lint/format/build pass; gate fails on the **same 21 existing files** (hex colours, one Engineering deep relative import, fetch outside api). No introduced forbidden-pattern file. Logs: `/tmp/b-uni-frontend-check-baseline.log`, `/tmp/b-uni-frontend-check-final.log`, `/tmp/b-uni-gate-comparison.json`. Do not modify gate/unrelated files to hide this baseline.
- The initial route-fixture run imported existing eager auth-DB authentication and received an access-denied connection error before any data read; the test now stubs `Sequelize.authenticate` before app assembly, and subsequent runs are fully isolated from the auth DB.

## TUO follow-up — deliberately not guessed

Current Athena identity `silver.fct_vtuodata_view` returned no table/view or columns in metadata. Future enablement requires access/publication or an approved replacement, exact columns (`barcode`, `event_time`, `wc_name`, `recipe_description`, `status_name`, `first_name`), and confirmed BTP isolation predicate. Do not infer BTP merely from presence of a plant column.

Once confirmed: translate preserved `barcode_tuo_status.sql`, apply confirmed BTP scope before latest-barcode ranking, retain `status_name <> 'OE'`, no parameter level, SKU click directly opens status/operator barcode table, bounded paging/auth/cache/race handling as above, bump `UNIFORMITY_VERSION`, and add synthetic scope/latest-test/shift/status plus browser tests. Until then the backend returns `TUO_SOURCE_UNAVAILABLE` before any query and frontend shows no working status action.

## Reviewer focus

Independently inspect Athena syntax/clock expression and source freshness split; guide KPI maps; latest-test predicate placement; weighted denominators; count/sentinel semantics; cache/concurrency and page-churn behavior. Verify no CTP/shared `QKpiCard`, Paint Weight/Scrap, compliance, Engineering or existing trend-modal changes. Review/commit is a separate assignment; this implementation contains no commits.
