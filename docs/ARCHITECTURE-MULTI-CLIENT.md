# JK Dashboard — Multi-Client Architecture (Target State)

Adds a **Client** layer above Plant and makes everything below it configurable
from a client configuration database, instead of the literals currently frozen
into the code.

This is a **target-state design document**. The current implemented system is
described in [ARCHITECTURE.md](ARCHITECTURE.md); read that first. Everything
here is additive to it unless a section says "replaces".

**Contents**

1. [Goal & Assumptions](#1-goal--assumptions)
2. [What Is Static Today](#2-what-is-static-today)
3. [Domain Model](#3-domain-model)
4. [High-Level Architecture](#4-high-level-architecture)
5. [The Config Database](#5-the-config-database)
6. [The Data-Binding Layer](#6-the-data-binding-layer)
7. [Tenant Resolution & Auth](#7-tenant-resolution--auth)
8. [Backend Changes](#8-backend-changes)
9. [Frontend Changes](#9-frontend-changes)
10. [API Surface](#10-api-surface)
11. [End-to-End Flow](#11-end-to-end-flow)
12. [Caching & Invalidation](#12-caching--invalidation)
13. [Security](#13-security)
14. [Onboarding a New Client](#14-onboarding-a-new-client)
15. [Migration Plan](#15-migration-plan)
16. [Decisions, Risks & Open Questions](#16-decisions-risks--open-questions)

---

## 1. Goal & Assumptions

### Goal

One deployment serves many clients. Adding a client — its plants, its
navigation taxonomy, its warehouse, its column names, its vocabulary — is a
**configuration change, not a code change or a release**.

### Decisions taken (confirmed)

| Question | Decision |
|---|---|
| Where config lives | **New Postgres config DB**, owned by the backend, cached in-process |
| Gold-layer isolation | **Both strategies**, declared per client: dedicated table *or* shared table + forced `client_id` predicate |
| Tenant resolution | **Auth token claim** — a JWT carries `client_id` + allowed plants; the tenant is never client-supplied |
| Config depth | **Navigation taxonomy**, plus everything derived from **how the client stores its data in its DB** |

### The assumption behind config depth — please confirm

The instruction *"this should be on how client stores their data in db"* is
implemented as follows, and the whole design rests on it:

> We do **not** re-enumerate KPI catalogues, allow-lists and query rules per
> client by hand. Instead each client declares a **data binding**: which
> table(s) hold its gold layer, and how its physical columns and values map
> onto one **canonical gold contract**. Everything the code currently hardcodes
> — `ALLOWED_SECTIONS`, `ALLOWED_CATEGORIES`, `ALLOWED_GRANULARITIES`,
> `PRODUCT_AGNOSTIC_KPIS`, `PRODUCT_SPLIT_KPIS`, the sentinel set, the date
> format — becomes either (a) derived by **discovery queries** against that
> client's own data, or (b) a per-client override row in the config DB.

If instead you want each client's KPI catalogue and drill trees authored by
hand in the config DB, say so — §5.4 becomes a much larger authored table set
and §6.4 (discovery) drops away.

### Non-goals for this document

- The internal admin UI for editing config (assumed to exist eventually;
  Phase 1 config is seeded by migration + SQL).
- Per-client custom drill panels (the panel set stays code; which panel a KPI
  uses is configuration).
- Billing, quotas, per-client rate limiting.

### Language

All new modules in this layer (`config/`, `tenant/`, `binding/`) are written in
**TypeScript**, with explicit return types and no `any`. The existing JS
modules are migrated opportunistically, not in a big-bang.

---

## 2. What Is Static Today

Every item below moves into config. This is the concrete work list.

| Where | What is frozen |
|---|---|
| [backend/src/utils/normalize.js](../backend/src/utils/normalize.js) | `PLANT_SCOPES` (banmore/chennai), `PLANT_ALIASES`, `PLANT_BANMORE`, `plantSqlTable`, department forced to `production` |
| [backend/src/controllers/static.controller.js](../backend/src/controllers/static.controller.js) | `PLANTS` (4 plants + SVG map coords), `FUNCTIONS`, `SECTIONS`, `CATEGORY_TABS`, `LANDING_KPI_ALIASES` |
| [backend/src/queries/dashboard-query.js](../backend/src/queries/dashboard-query.js) | `ALLOWED_SECTIONS`, `ALLOWED_CATEGORIES`, `ALLOWED_GRANULARITIES`, `ALLOWED_TYRE_TYPES`, `ALLOWED_CONTEXT_KEYS`, `PRODUCT_AGNOSTIC_KPIS`, `PRODUCT_SPLIT_KPIS`, `AGGREGATE_PRODUCT_CHILDREN`, `DATE_YYYYMMDD` |
| [backend/src/config.js](../backend/src/config.js) | single `AWS_DATA_URL` / `sqlTable` / `engine` for the whole app |
| [backend/src/quality/](../backend/src/quality/) | `QUALITY_DATA_SOURCE` as one process-wide switch |
| [frontend/src/lib/kpi-transformer.js](../frontend/src/lib/kpi-transformer.js) | KPI id/label catalogue mirroring `artifact.jsx`, unit aliases, granularity synonyms, canonical spellings |
| [frontend/src/hooks/useDashboardFetch.js](../frontend/src/hooks/useDashboardFetch.js) | `sectionIdToName`, `categoryIdToName`, initial `section: "mix"` / `category: "p"` |
| [frontend/src/pages/LandingPage.jsx](../frontend/src/pages/LandingPage.jsx) | `PHASE_1_ACTIVE_PLANTS`, `PHASE_1_NAVIGABLE_FUNCTIONS` |
| [frontend/src/pages/BanmoreProduction.jsx](../frontend/src/pages/BanmoreProduction.jsx) | section-id→name map, `PROD_DRILL_TYPES`, drill-type→panel switch |
| [frontend/src/lib/indiaMap.js](../frontend/src/lib/indiaMap.js) | India-only map geometry |
| [frontend/src/pages/quality/QualityDashboard.jsx](../frontend/src/pages/quality/QualityDashboard.jsx) | `QUALITY_DATA_DATE`, `QUALITY_MONTH_FROM/TO`, inline palette, `TT_FACTOR` |

---

## 3. Domain Model

```
Client  (tenant — JK Tyres, Acme Rubber, …)
  │  slug, name, status, theme, locale, data-binding defaults
  ├── User ──── Role ──── Permission          (auth; carries client_id)
  ├── Region / Geo profile                     (which map, which coords)
  └── Plant  (Banmore, Chennai, …)
        │  code, display name, map coords, enabled, data binding override
        └── Function  (Production, Quality, Engineering, Plant Head, …)
              └── Section  (Mixing, Stock, TBM, Curing, …)
                    └── Category tab  (Productivity, Quality, Cost, Inventory, …)
                          └── KPI  (resolved from the client's own data
                                    via the data binding + discovery)
```

Two orthogonal axes hang off Client:

- **Taxonomy** — the navigation tree above. Authored in the config DB.
- **Data binding** — how this client's warehouse is read. Declared in the
  config DB, and the source of everything below the taxonomy.

Cardinality: taxonomy nodes are scoped `(client_id, parent_id)`, so two clients
may both have a section literally named "Mixing" with completely different ids,
ordering, and underlying data.

---

## 4. High-Level Architecture

```
                       ┌────────────────────────────────────────┐
                       │        Browser — React SPA             │
                       │  bootstrap: taxonomy + theme + caps    │
                       └───────────────┬────────────────────────┘
                                       │ Bearer <jwt: client_id, plants[], role>
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Node / Express BFF  (multi-tenant)                   │
│                                                                          │
│  resolveTenant ──▶ loadClientConfig ──▶ authorizePlant ──▶ controllers   │
│        │                   │                                    │        │
│        │                   ▼                                    ▼        │
│        │        ┌──────────────────────┐          ┌──────────────────┐   │
│        │        │  ConfigService       │          │ Query builders   │   │
│        │        │  (TTL cache + LISTEN)│─────────▶│ bound to         │   │
│        │        └──────────┬───────────┘          │ req.tenant       │   │
│        │                   │                      └────────┬─────────┘   │
│        │                   ▼                               ▼             │
│        │        ┌──────────────────────┐        ┌────────────────────┐   │
│        │        │  Config DB (Postgres)│        │ DataSourceRegistry │   │
│        │        │  clients, plants,    │        │ per-client adapter │   │
│        │        │  functions, sections,│        └─────────┬──────────┘   │
│        │        │  categories, bindings│                  │              │
│        │        │  column_map, vocab,  │                  │              │
│        │        │  users, roles        │                  │              │
│        │        └──────────────────────┘                  │              │
└──────────────────────────────────────────────────────────┼──────────────┘
                                                            │
                    ┌───────────────────────────────────────┼──────────────┐
                    ▼                     ▼                 ▼              ▼
            ┌──────────────┐     ┌──────────────┐   ┌──────────────┐  ┌─────────┐
            │ Athena       │     │ Databricks   │   │ Postgres/    │  │ Excel   │
            │ gold.gold    │     │ client B     │   │ Snowflake    │  │ alasql  │
            │ (client A)   │     │              │   │ (client C)   │  │ (dev)   │
            └──────────────┘     └──────────────┘   └──────────────┘  └─────────┘
```

Two planes, deliberately separated:

- **Control plane** — Postgres config DB. Small, transactional, writable,
  owned by us. Never queried on the hot path (in-process cache).
- **Data plane** — the client's warehouse. Large, read-only, reached through a
  per-client adapter. Never contains config.

---

## 5. The Config Database

Postgres. Managed by a migration tool (`node-pg-migrate` or Prisma). One
schema, `config`. Every taxonomy table carries `client_id` and is protected by
row-level security as a second line of defence.

### 5.1 Tenancy & identity

```sql
CREATE TABLE config.clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,            -- 'jktyre'
  name          text NOT NULL,                   -- 'JK Tyre & Industries'
  status        text NOT NULL DEFAULT 'active',  -- active | suspended | onboarding
  locale        text NOT NULL DEFAULT 'en-IN',
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  date_format   text NOT NULL DEFAULT 'dd-MM-yyyy',
  theme         jsonb NOT NULL DEFAULT '{}',     -- logo url, palette, density
  geo_profile   text NOT NULL DEFAULT 'india',   -- which map asset the landing page uses
  config_version integer NOT NULL DEFAULT 1,     -- bumped on ANY change below; drives cache invalidation
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE config.users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES config.clients(id) ON DELETE CASCADE,
  email          citext NOT NULL,
  display_name   text NOT NULL,
  role           text NOT NULL,                  -- admin | plant_head | viewer
  status         text NOT NULL DEFAULT 'active',
  UNIQUE (client_id, email)
);

-- Which plants a user may see. Absent rows = all plants of the client.
CREATE TABLE config.user_plants (
  user_id  uuid REFERENCES config.users(id) ON DELETE CASCADE,
  plant_id uuid REFERENCES config.plants(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, plant_id)
);
```

### 5.2 Taxonomy

```sql
CREATE TABLE config.plants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES config.clients(id) ON DELETE CASCADE,
  slug         text NOT NULL,                 -- 'banmore'  (URL + api id)
  code         text NOT NULL,                 -- 'BANMORE'  (value stored in the gold layer)
  name         text NOT NULL,                 -- 'Banmore Plant'
  subtitle     text,                          -- 'Gwalior, Madhya Pradesh'
  aliases      text[] NOT NULL DEFAULT '{}',  -- replaces PLANT_ALIASES
  map_x        numeric, map_y numeric,        -- geo_profile SVG coords
  attributes   jsonb NOT NULL DEFAULT '{}',   -- e.g. {"tyreType":"PCR"} — free-form, client-defined
  enabled      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  UNIQUE (client_id, slug)
);

CREATE TABLE config.functions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES config.clients(id) ON DELETE CASCADE,
  plant_id    uuid REFERENCES config.plants(id) ON DELETE CASCADE,  -- NULL = all plants
  slug        text NOT NULL,                  -- 'prod'
  name        text NOT NULL,                  -- 'Production'
  department  text NOT NULL,                  -- value in the gold layer: 'production'
  enabled     boolean NOT NULL DEFAULT false, -- replaces the "SOON" pill logic
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (client_id, plant_id, slug)
);

CREATE TABLE config.sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES config.clients(id) ON DELETE CASCADE,
  function_id  uuid NOT NULL REFERENCES config.functions(id) ON DELETE CASCADE,
  slug         text NOT NULL,                 -- 'mix'
  name         text NOT NULL,                 -- 'Mixing'
  source_value text NOT NULL,                 -- value stored in the gold layer: 'Mixing'
  enabled      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  UNIQUE (client_id, function_id, slug)
);

CREATE TABLE config.categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES config.clients(id) ON DELETE CASCADE,
  function_id  uuid NOT NULL REFERENCES config.functions(id) ON DELETE CASCADE,
  slug         text NOT NULL,                 -- 'p'
  code         text NOT NULL,                 -- 'P'
  name         text NOT NULL,                 -- 'Productivity'
  source_value text NOT NULL,                 -- 'Productivity'
  enabled      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  UNIQUE (client_id, function_id, slug)
);
```

`slug` is the stable API/URL identity; `source_value` is what actually appears
in that client's warehouse. **This split is what kills `sectionIdToName` and
`categoryIdToName` on the frontend** — the mapping ships in the bootstrap
payload instead of being compiled in.

### 5.3 Data bindings

See §6 for semantics.

```sql
CREATE TABLE config.data_bindings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES config.clients(id) ON DELETE CASCADE,
  plant_id       uuid REFERENCES config.plants(id) ON DELETE CASCADE, -- NULL = client default
  family         text NOT NULL DEFAULT 'production', -- 'production' | 'quality' | …
  adapter        text NOT NULL,                      -- 'athena' | 'databricks' | 'postgres' | 'excel'
  connection_ref text NOT NULL,                      -- key into the secret store, NEVER the secret
  sql_table      text NOT NULL,                      -- 'gold.gold' | 'ctp_gold.ctp_gold'
  isolation      text NOT NULL,                      -- 'dedicated' | 'shared'
  tenant_column  text,                               -- required when isolation='shared'
  tenant_value   text,                               -- required when isolation='shared'
  row_limit      integer NOT NULL DEFAULT 5000,
  timeout_ms     integer NOT NULL DEFAULT 30000,
  CHECK (isolation = 'dedicated'
         OR (tenant_column IS NOT NULL AND tenant_value IS NOT NULL))
);

-- Canonical field  ->  SQL expression over THIS client's table.
CREATE TABLE config.column_map (
  binding_id  uuid NOT NULL REFERENCES config.data_bindings(id) ON DELETE CASCADE,
  field       text NOT NULL,   -- 'date' | 'section' | 'kpi_name' | 'actual_value' | …
  expression  text NOT NULL,   -- 'date' | 'CAST(prod_date AS VARCHAR)' | 'COALESCE(sec, dept)'
  data_type   text NOT NULL,   -- 'string' | 'number' | 'date' | 'json'
  required    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (binding_id, field)
);

-- Client value  ->  canonical value, per dimension.
CREATE TABLE config.value_map (
  binding_id  uuid NOT NULL REFERENCES config.data_bindings(id) ON DELETE CASCADE,
  dimension   text NOT NULL,   -- 'granularity' | 'unit_of_measurement' | 'status' | 'product_type'
  source      text NOT NULL,   -- 'Daily'
  canonical   text NOT NULL,   -- 'DAY'
  PRIMARY KEY (binding_id, dimension, source)
);

-- Discovered + curated allow-lists. Replaces ALLOWED_* constants.
CREATE TABLE config.vocabulary (
  binding_id   uuid NOT NULL REFERENCES config.data_bindings(id) ON DELETE CASCADE,
  dimension    text NOT NULL,  -- 'section' | 'category' | 'granularity' | 'tyre_type' | 'kpi_name'
  value        text NOT NULL,
  allowed      boolean NOT NULL DEFAULT true,   -- curated: false excludes it everywhere
  discovered_at timestamptz,
  PRIMARY KEY (binding_id, dimension, value)
);

-- Per-KPI behavioural flags, seeded by discovery, overridable by an admin.
CREATE TABLE config.kpi_traits (
  binding_id       uuid NOT NULL REFERENCES config.data_bindings(id) ON DELETE CASCADE,
  kpi_name         text NOT NULL,
  product_agnostic boolean NOT NULL DEFAULT false,  -- replaces PRODUCT_AGNOSTIC_KPIS
  product_split    boolean NOT NULL DEFAULT false,  -- replaces PRODUCT_SPLIT_KPIS
  aggregate_children text[] NOT NULL DEFAULT '{}',  -- replaces AGGREGATE_PRODUCT_CHILDREN
  label            text,
  unit_override    text,
  drill_targets    text[] NOT NULL DEFAULT '{}',
  panel            text,                            -- which drill panel renders it
  PRIMARY KEY (binding_id, kpi_name)
);

-- Sentinels, date encoding, engine quirks.
CREATE TABLE config.binding_options (
  binding_id uuid PRIMARY KEY REFERENCES config.data_bindings(id) ON DELETE CASCADE,
  empty_tokens    text[] NOT NULL DEFAULT '{nan,null,""}',
  date_encoding   text   NOT NULL DEFAULT 'auto',  -- 'iso' | 'dmy' | 'auto'
  numbers_as_text boolean NOT NULL DEFAULT true,   -- Athena serialises everything as string
  quote_style     text   NOT NULL DEFAULT 'ansi'
);
```

### 5.4 Effective-config resolution

Config is layered; the resolver merges in this order, last wins:

```
platform defaults  →  client row  →  plant override  →  function override
```

`ConfigService.getEffectiveConfig(clientId)` produces one immutable, fully
resolved object per `config_version`. Controllers never read the DB directly
and never merge layers themselves.

---

## 6. The Data-Binding Layer

This is the answer to *"configurable according to how the client stores their
data"*.

### 6.1 The canonical gold contract

The whole application — query builders, transformers, the frontend — speaks
exactly one vocabulary. It is the schema documented in
[ARCHITECTURE.md §4](ARCHITECTURE.md#4-data-model--the-gold-layer), promoted
from "what the JK gold table happens to look like" to "the contract every
client's data is mapped onto":

```
date · plant · department · section · sub_section · tyre_type · machine
product_type · itemcode · granularity · category · kpi_name
unit_of_measurement · drill_down_level · drill_down_attribute
actual_value · previous_value · threshold_value · status · remarks
```

Fields may be marked `required: false` in `column_map`; a query that needs an
absent field degrades (the dimension disappears from filters, its drill is
hidden) rather than erroring.

### 6.2 Projection — physical → canonical

The query builder never names a physical column. It asks the binding for a
canonical field and receives a SQL expression:

```ts
// backend/src/binding/projection.ts
export function col(binding: Binding, field: CanonicalField): string {
  const mapped = binding.columnMap[field];
  if (!mapped) throw new BindingError(`Field "${field}" is not mapped for ${binding.id}`);
  return mapped.expression;
}
```

Client A (JK, Athena):

```sql
SELECT CAST(date AS VARCHAR) AS date, section, kpi_name, actual_value
FROM gold.gold
WHERE UPPER(plant) = 'BANMORE' AND LOWER(department) = 'production'
```

Client B (different warehouse, different names, shared table):

```sql
SELECT to_char(prod_dt,'YYYY-MM-DD') AS date, work_centre AS section,
       metric_code AS kpi_name, metric_value AS actual_value
FROM analytics.factory_kpi_gold
WHERE tenant_id = 'acme'                       -- forced isolation predicate
  AND upper(site_code) = 'PLANT-A' AND lower(dept) = 'production'
```

Same builder, same controller, same frontend. Only the binding row differs.

### 6.3 Isolation strategies (both supported)

`data_bindings.isolation` selects the predicate the builder is *forced* to emit:

| Strategy | Emitted predicate | Notes |
|---|---|---|
| `dedicated` | none beyond plant/department | `sql_table` is the client's own table. Cross-client leakage is not expressible. Today's `banmore → gold.gold`, `chennai → ctp_gold.ctp_gold`. |
| `shared` | `AND <tenant_column> = <tenant_value>` | Injected by the builder from `req.tenant`, never from request input. |

One invariant, enforced by a unit test over every builder:

> **Every generated SQL string must contain the binding's mandatory predicate
> set.** The builder returns `{sql, appliedPredicates}` and a shared assertion
> verifies the isolation predicate is present before the SQL reaches an adapter.

### 6.4 Discovery — deriving vocabulary from the client's own data

On onboarding, and on a schedule thereafter, a **discovery job** populates
`vocabulary` and seeds `kpi_traits` by querying the client's warehouse:

```sql
-- vocabulary
SELECT DISTINCT <col(section)>     FROM <table> WHERE <isolation>;
SELECT DISTINCT <col(category)>    FROM <table> WHERE <isolation>;
SELECT DISTINCT <col(granularity)> FROM <table> WHERE <isolation>;
SELECT DISTINCT <col(kpi_name)>    FROM <table> WHERE <isolation>;

-- product_agnostic: KPIs that never carry a product_type
SELECT <col(kpi_name)> AS kpi
FROM <table> WHERE <isolation>
GROUP BY 1
HAVING COUNT(*) FILTER (WHERE NOT <emptyExpr(product_type)>) = 0;

-- product_split: KPIs where per-product rows sum to ~2x the aggregate row
--   (the Production_m / Cured Tyre pattern) — flagged for admin review,
--   never auto-applied, because a false positive halves real numbers.
```

Results land as **proposals**. An admin curates: `allowed=false` excludes a
value (this is how "drop Final Finish and TUO & DBM" is expressed for JK
without a code change), and `kpi_traits` overrides anything discovery got wrong.
Discovery re-runs surface *new* values as proposals and never silently flip a
curated flag.

### 6.5 Adapters

`DataSourceRegistry` replaces the single `utils/upstream.js` egress and the
process-wide `QUALITY_DATA_SOURCE` switch:

```ts
interface DataSourceAdapter {
  runQuery(sql: string, binding: Binding): Promise<Row[]>;
}
// athena | databricks | postgres | excel(alasql)
```

Each adapter keeps the guarantees `upstream.js` already provides: SELECT/WITH
only, `AbortController` timeout, Lambda-proxy unwrap, positional-row zipping,
and coercion driven by `binding_options.numbers_as_text`. Credentials are
fetched by `connection_ref` from the secret store (AWS Secrets Manager / SSM) —
the config DB stores the reference, never the secret.

---

## 7. Tenant Resolution & Auth

The app has no auth today; multi-tenancy requires it.

```
POST /api/v1/auth/login  { email, password }
        ▼
  verify against config.users (argon2id)
        ▼
  access JWT (15 min)              refresh token (rotating, httpOnly cookie, 30 d)
  {
    sub: "<user uuid>",
    cid: "<client uuid>",          ← the ONLY source of tenant identity
    cslug: "jktyre",
    plants: ["banmore","chennai"], ← [] means "all plants of this client"
    role: "plant_head",
    cver: 7                        ← client config_version at issue time
  }
```

Middleware chain, in order, before every `/api/v1/*` route except `/health`
and `/auth/*`:

```ts
authenticate      // verify signature + expiry            → req.user
resolveTenant     // req.tenant = ConfigService.getEffectiveConfig(req.user.cid)
authorizePlant    // :plantId ∈ req.user.plants (or client-wide)  → 403 otherwise
```

Rules:

- **`client_id` is never read from the URL, body, query or a header.** Only
  from the verified token. Any request carrying `plant`/`department`/`client`
  in `context` is rejected — an extension of the guard already in
  `dashboard-query.js`.
- `plantId` in the path is a *slug within the tenant*; it is resolved against
  `req.tenant.plants` and a miss is 404, not a fallback to `banmore`.
- The `cver` claim lets the API answer `409 CONFIG_STALE` when a client's
  config changed mid-session, prompting the SPA to re-bootstrap.
- Roles gate **visibility**, not data shape: a `viewer` sees fewer functions,
  never a different tenant's rows.

---

## 8. Backend Changes

### 8.1 New modules

```
backend/src/
├── config-db/              Postgres pool, migrations, repositories
│   ├── client.repo.ts   plant.repo.ts   taxonomy.repo.ts   binding.repo.ts
├── config/
│   ├── ConfigService.ts    getEffectiveConfig(clientId) + TTL cache + invalidation
│   └── types.ts            EffectiveConfig, Binding, ColumnMap, Vocabulary
├── tenant/
│   ├── authenticate.ts     JWT verify
│   ├── resolveTenant.ts    → req.tenant
│   └── authorizePlant.ts
├── binding/
│   ├── projection.ts       col(), emptyExpr(), dateKeyExpr()
│   ├── predicates.ts       isolationPredicate(), plantPredicate(), vocabGuard()
│   └── discovery.ts        the §6.4 job
└── datasource/
    ├── registry.ts         adapter lookup by binding.adapter
    └── adapters/{athena,databricks,postgres,excel}.ts
```

### 8.2 Changes to existing modules

| Module | Change |
|---|---|
| `app.js` | Insert the tenant middleware chain; mount `/api/v1/auth`, `/api/v1/bootstrap`, `/api/v1/config` |
| `config.js` | Keeps only process concerns (port, JWT secret, config-DB URL, secret-store ref). All data-source env vars move into `data_bindings`. |
| `utils/normalize.js` | `PLANT_SCOPES`/`PLANT_ALIASES` **deleted**; `normalizePlantId`, `plantSqlTable`, `plantDepartmentPredicate` take `req.tenant`. `normalizeGranularity`/`normalizeUnit` read `value_map`. Sentinels read `binding_options.empty_tokens`. |
| `queries/dashboard-query.js` | All `ALLOWED_*` and `PRODUCT_*` constants **deleted**; validation reads `vocabulary` + `kpi_traits`. `DATE_YYYYMMDD` becomes `dateKeyExpr(binding)`, driven by `date_encoding`. Signature becomes `buildFetchQuery(tenant, params)`. |
| `queries/queries.js` | Same treatment; `TABLE()` resolves from the binding. |
| `controllers/static.controller.js` | `PLANTS`/`FUNCTIONS`/`SECTIONS`/`CATEGORY_TABS` **deleted** — served from `req.tenant`. `LANDING_KPI_ALIASES` moves to `kpi_traits`. |
| `utils/upstream.js` | Becomes `datasource/adapters/athena.ts`; no longer imports env directly. |
| `utils/cache.js` | Every cache key is prefixed `c:<clientId>:v<configVersion>:` — see §12. |
| `quality/datasource/index.js` | Replaced by the shared registry; the excel/db switch becomes `data_bindings.adapter` for `family='quality'`. |

### 8.3 Controller shape, before and after

```js
// before
export async function getSections(_req, res) {
  res.json({ data: SECTIONS });
}

// after
export async function getSections(req, res) {
  const { functionSlug } = req.query;
  res.json({ data: req.tenant.taxonomy.sectionsFor(functionSlug) });
}
```

```js
// before
const sql = buildFetchQuery({ plantId, context, date, drillKpis, … });

// after — the tenant IS the first argument; nothing tenant-ish comes from the body
const sql = buildFetchQuery(req.tenant, { plantSlug: req.params.plantId, context, date, drillKpis, … });
```

---

## 9. Frontend Changes

### 9.1 Bootstrap-driven shell

The SPA compiles in **no** client knowledge. After login it fetches one payload
and drives the entire shell from it:

```
GET /api/v1/bootstrap
{
  "data": {
    "client":  { "slug":"jktyre","name":"JK Tyre","theme":{…},"locale":"en-IN",
                 "dateFormat":"dd-MM-yyyy","geoProfile":"india","configVersion":7 },
    "user":    { "name":"…","role":"plant_head","plants":["banmore"] },
    "plants":  [ { "slug":"banmore","name":"Banmore Plant","subtitle":"Gwalior, MP",
                   "mapX":169.7,"mapY":228.6,"enabled":true,
                   "functions":[ { "slug":"prod","name":"Production","enabled":true } ] } ],
    "taxonomy": {
      "prod": {
        "sections":   [ { "slug":"mix","name":"Mixing" }, … ],
        "categories": [ { "slug":"p","code":"P","name":"Productivity","enabled":true }, … ],
        "defaults":   { "section":"mix","category":"p","granularity":"DAY" }
      }
    },
    "capabilities": { "inventory": true, "quality": true, "trends": true, "export": true },
    "kpis": { "OEE_o": { "label":"OEE","unit":"%","drillTargets":[…],"panel":"oee" }, … }
  }
}
```

### 9.2 Component-level changes

| File | Change |
|---|---|
| `App.jsx` | Wrap in `<AuthProvider>` → `<ClientConfigProvider>`; theme is built from `client.theme` instead of the static `theme.js` |
| `router.jsx` | Routes become `/:plantSlug/:functionSlug`; the client comes from the token, not the URL. A `<RequireAuth>` guard wraps everything |
| `LandingPage.jsx` | `PHASE_1_ACTIVE_PLANTS` / `PHASE_1_NAVIGABLE_FUNCTIONS` **deleted** — `plants[].enabled` and `functions[].enabled` drive the cards and the "SOON" pill |
| `indiaMap.js` | Becomes `geo/<geoProfile>.js`, selected by `client.geoProfile`; markers come from `mapX`/`mapY` |
| `useDashboardFetch.js` | `sectionIdToName` / `categoryIdToName` **deleted** — slug→`source_value` comes from `taxonomy`. Initial state comes from `taxonomy.defaults`, not `"mix"`/`"p"` |
| `BanmoreProduction.jsx` | Renamed `FunctionDashboard.jsx`; the section map and `PROD_DRILL_TYPES` go; the drill-type→panel switch becomes a **registry lookup** on `kpis[name].panel` |
| `kpi-transformer.js` | The KPI catalogue is injected from `bootstrap.kpis` instead of mirroring `artifact.jsx`; unit aliases and granularity synonyms come from `value_map` |
| `api/client.js` | Attaches `Authorization`; on 401 refreshes once then retries; on `409 CONFIG_STALE` re-fetches bootstrap and remounts the shell |
| `QualityDashboard.jsx` | `QUALITY_DATA_DATE`/`QUALITY_MONTH_FROM/TO` come from the binding's discovered data range; the inline palette comes from `client.theme` |

**Rule:** a client name, plant name, section name or KPI name must not appear
as a literal anywhere in `frontend/src` after this migration. That is
enforceable with a lint rule and is the cheapest regression guard available.

---

## 10. API Surface

Additions and changes on top of [ARCHITECTURE.md §2.3](ARCHITECTURE.md#23-api-surface).

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Issue access + refresh tokens |
| POST | `/api/v1/auth/refresh` | Rotate |
| POST | `/api/v1/auth/logout` | Revoke refresh token |
| GET | `/api/v1/bootstrap` | **New** — the whole per-session client config (§9.1) |
| GET | `/api/v1/config/taxonomy` | Taxonomy alone, for a targeted refresh |
| GET | `/api/v1/plants` | Now returns **this tenant's** plants only |
| GET | `/api/v1/functions`, `/sections`, `/category-tabs` | Tenant-scoped; `sections`/`category-tabs` take `?functionSlug=` |
| ALL | `/api/v1/plants/:plantSlug/**` | `:plantSlug` resolved within the tenant; 404 on miss, 403 on unauthorised |
| POST | `/api/v1/dashboard/kpi-data` | Unchanged body **minus** `plantId` semantics — plant is validated against the tenant; `context` still rejects `plant`/`department`/`client` |
| — | **Admin** | |
| GET/PUT | `/api/v1/admin/clients/:slug/taxonomy` | Author the tree |
| GET/PUT | `/api/v1/admin/clients/:slug/bindings` | Author bindings + column/value maps |
| POST | `/api/v1/admin/clients/:slug/discovery` | Run §6.4 and return proposals |
| POST | `/api/v1/admin/clients/:slug/validate` | Dry-run the health checks of §14 |

New error codes: `UNAUTHENTICATED` (401), `FORBIDDEN_PLANT` (403),
`TENANT_NOT_FOUND` (404), `CONFIG_STALE` (409), `BINDING_ERROR` (500),
`CONFIG_INVALID` (500).

---

## 11. End-to-End Flow

### 11.1 Login → landing

```
POST /auth/login → JWT{cid, plants, cver}
GET  /bootstrap
       authenticate → resolveTenant → ConfigService.getEffectiveConfig(cid)
         cache hit?  → serve
         miss        → Postgres: client + plants + functions + sections + categories
                                 + bindings + column_map + value_map + vocabulary + kpi_traits
                       → resolve layers → freeze → cache under (cid, cver)
       → { client, user, plants, taxonomy, capabilities, kpis }
SPA renders the landing map from geoProfile + plants[].mapX/mapY
```

### 11.2 KPI grid for a section

```
POST /api/v1/dashboard/kpi-data
     Authorization: Bearer <jwt>
     { plantSlug:"banmore",
       context:{ section:"mix", category:"p", granularity:"DAY" },
       from, to, limit }
   ▼ authenticate → resolveTenant → authorizePlant("banmore")
   ▼ validate: section "mix"  ∈ tenant.taxonomy   → source_value "Mixing"
               category "p"   ∈ tenant.taxonomy   → source_value "Productivity"
               "Mixing" ∈ vocabulary(section, allowed=true)     else 400
   ▼ buildFetchQuery(tenant, params)
       FROM   binding.sql_table
       SELECT col(date), col(section), col(kpi_name), col(actual_value), …
       WHERE  isolationPredicate(binding)            -- 'dedicated' → none
              AND UPPER(col(plant)) = 'BANMORE'
              AND LOWER(col(department)) = 'production'
              AND col(section) = 'Mixing'
              AND col(category) = 'Productivity'
              AND col(granularity) = 'DAY'
              AND drill_down_level = 1
   ▼ assertIsolation(sql, binding)                   -- fails closed
   ▼ cache key  c:<cid>:v7:/dashboard/kpi-data?…
   ▼ DataSourceRegistry.get(binding.adapter).runQuery(sql, binding)
   ▼ transformers, driven by value_map + binding_options
   ▼ { data:[…], truncated:false, baseline:[…] }
```

Everything downstream of this point — paging, `truncated`, anchors, drills,
the transformer pipeline — is **unchanged** from
[ARCHITECTURE.md §5](ARCHITECTURE.md#5-end-to-end-flows). That is the point of
the canonical contract.

### 11.3 Admin edits config

```
PUT /admin/clients/jktyre/taxonomy
   ▼ validate → write in a transaction → clients.config_version += 1
   ▼ NOTIFY config_changed, '{"clientId":"…","version":8}'
   ▼ every backend instance LISTENs → evicts that client's config + query caches
   ▼ next SPA request carries cver=7 → 409 CONFIG_STALE → SPA re-bootstraps
```

---

## 12. Caching & Invalidation

Three tiers, all keyed by tenant **and** config version, so a config change can
never serve a stale mixture:

| Tier | Key | TTL | Invalidated by |
|---|---|---|---|
| Effective config | `cfg:<clientId>:v<version>` | 10 min | `NOTIFY config_changed` |
| Query results | `c:<clientId>:v<version>:<route>?<params>` | as today (2–30 min) | version bump, TTL |
| Frontend bootstrap | in-memory + `sessionStorage` | session | `409 CONFIG_STALE` |

Because the version is *in the key*, invalidation is a no-op eviction: new keys
simply miss and old ones expire. Multi-instance correctness comes from
Postgres `LISTEN/NOTIFY`; a periodic version poll is the fallback if a listener
connection drops.

The existing in-flight de-duplication in `utils/cache.js` is preserved
unchanged — it just operates on tenant-prefixed keys.

---

## 13. Security

- **Tenant identity is token-only.** No path, body, query or header can set it.
- **Isolation fails closed.** `assertIsolation(sql, binding)` runs on every
  generated statement; a builder that forgets the predicate throws before the
  SQL reaches an adapter. Covered by a test that iterates every builder.
- **Row-level security** in the config DB as a second layer: every repository
  connection sets `SET LOCAL app.client_id`, and RLS policies restrict each
  taxonomy table to that client. A missed `WHERE client_id` in application code
  returns zero rows rather than another tenant's.
- **`column_map.expression` is privileged input.** It is raw SQL and is
  writable only through the admin API by a platform operator, validated against
  an expression grammar (identifiers, casts, `COALESCE`, `SUBSTRING`, literals;
  no subqueries, no `;`, no DDL/DML keywords) and smoke-tested with `LIMIT 1`
  before it can be saved. Everything sourced from an end user stays on the
  existing `escapeLiteral` + vocabulary allow-list path.
- **Credentials** live in a secret store, referenced by `connection_ref`. The
  config DB never stores a key; the browser never sees one.
- **Read-only guard** (SELECT/WITH) is retained in every adapter.
- **Audit**: every admin write records actor, before/after JSON and the
  resulting `config_version`.

---

## 14. Onboarding a New Client

No release. The full path:

1. **Create the client** — slug, name, locale, timezone, theme, geo profile.
2. **Register the data binding** — adapter, `connection_ref`, `sql_table`,
   isolation (`dedicated`, or `shared` + tenant column/value), row limit,
   timeout.
3. **Map columns** — canonical field → expression, for whatever the client's
   table actually calls things. Mark absent fields `required=false`.
4. **Run discovery** — populates `vocabulary`, proposes `value_map` entries and
   `kpi_traits` (product-agnostic / product-split candidates, KPI list, data
   date range).
5. **Curate** — set `allowed=false` on sections/categories that are out of
   scope, confirm or reject the product-split proposals, add labels/units.
6. **Author the taxonomy** — plants, functions, sections, categories, ordering,
   `enabled` flags, map coordinates.
7. **Validate** — the health-check endpoint asserts: every required canonical
   field maps and returns rows; every taxonomy `source_value` exists in
   `vocabulary`; the isolation predicate appears in a sample query; a sample
   KPI fetch returns non-empty; the date encoding parses.
8. **Create users**, assign roles and plant scopes.
9. **Go live** — flip `status='active'`.

Steps 1–8 are data. Step 9 is a boolean.

---

## 15. Migration Plan

Strangler, in five phases. No phase requires a data migration of the gold layer.

| Phase | Work | Done when |
|---|---|---|
| **0 — Contract freeze** | Write the canonical gold contract down; add the `{sql, appliedPredicates}` return shape and `assertIsolation`; no behaviour change | All existing tests green |
| **1 — Config DB, shadow mode** | Stand up Postgres + migrations; seed **JK Tyres as client #1** with today's exact values (banmore/chennai, 4 sections, 6 tabs, both `sql_table`s, current allow-lists as `vocabulary`). `ConfigService` runs and is asserted equal to the hardcoded constants in CI, but nothing reads it yet | A CI test proves seeded config ≡ current constants |
| **2 — Backend cutover** | Middleware chain + auth; controllers and builders take `req.tenant`; delete `PLANTS`/`SECTIONS`/`ALLOWED_*`/`PLANT_SCOPES`. Single tenant, so output must be byte-identical | Acceptance tests unchanged and passing |
| **3 — Frontend cutover** | Login, `/bootstrap`, `ClientConfigProvider`; delete the id→name maps, `PHASE_1_*` sets, and the panel switch; lint rule forbids client/plant/section literals in `src/` | Lint rule passes with zero suppressions |
| **4 — Second client** | Onboard a real second client purely through §14; keep JK on `dedicated`, put the new client on `shared` so both isolation paths are exercised in production | New client live with no code change |

Phase 2 is the risky one: it rewrites the query builder's inputs. Mitigation is
that phase 1 guarantees the seeded config reproduces today's constants exactly,
so any behavioural diff in phase 2 is a genuine bug, not a config discrepancy.

---

## 16. Decisions, Risks & Open Questions

### Decisions

| Decision | Rationale |
|---|---|
| Postgres config DB, not files | Config must change without a deploy; needs transactions, audit, an admin UI later, and versioning for cache invalidation |
| Config cached in-process, versioned | The hot path must not touch Postgres; a version in the cache key makes invalidation trivially correct across instances |
| Canonical gold contract + per-client projection | One set of query builders, transformers and UI components serves every client; the diff between clients is data, not branches |
| Both isolation strategies | Existing clients already have dedicated tables (`ctp_gold.ctp_gold`); new clients may arrive in a shared warehouse. Refusing either would block real onboarding |
| JWT claim for tenancy | The only model where a malicious or buggy client cannot address another tenant; also unblocks per-user plant scoping |
| Vocabulary by discovery + curation | Hand-authoring allow-lists per client does not scale and drifts from the data; discovery keeps them honest, curation keeps them correct |
| Traits proposed, never auto-applied | A wrong `product_split` flag silently halves or doubles production numbers — exactly the class of bug documented in `new_change.md` C4 |
| Expression-level column mapping | A plain column-name map cannot express `CAST(date AS VARCHAR)` or `COALESCE(sec, dept)`, which real client schemas need immediately |

### Risks

| Risk | Mitigation |
|---|---|
| `column_map.expression` is raw SQL | Platform-operator-only, grammar-validated, smoke-tested before save, audited |
| Misconfiguration surfaces as "no data" rather than an error | Health-check endpoint (§14.7) + a per-client synthetic canary query alerting on zero rows |
| Config DB becomes a single point of failure | Read-through in-process cache with a long grace TTL; the app serves last-known-good config if Postgres is briefly unreachable |
| Cache-key explosion across many tenants | Keys already carry tenant + version; add a per-tenant entry cap and LRU eviction |
| Phase-2 regression on the query builder | Phase-1 equality test pins seeded config to today's constants |
| Frontend re-hardcoding creeps back | Lint rule banning client/plant/section/KPI literals under `frontend/src` |

### Open questions

1. **Config depth** — confirm the §1 assumption (bindings + discovery) versus
   hand-authored per-client KPI catalogues and drill trees.
2. **Auth provider** — own the credential store in `config.users`, or federate
   to the client's IdP (SAML/OIDC)? Enterprise clients usually demand the
   latter; that changes §7 substantially.
3. **Cross-client rollup** — will anyone need a view spanning clients (an Algo8
   internal console)? If yes, the `dedicated` strategy needs a federation story.
4. **Per-client drill panels** — is the fixed panel set plus a `panel` config
   key enough, or will clients need bespoke panels? Bespoke means a plugin
   boundary, which is a much larger design.
5. **Quality vertical** — does every client get Process/SPC, or is it a
   per-client capability? Currently modelled as `capabilities.quality`.
6. **Geo profiles** — how many maps do we need (India only today)? Bundling
   world geometry for a single client is expensive.
7. **Config DB hosting** — RDS, or the same box as the containers? Affects the
   availability story in the risk table.

---

*Target-state design. Companion to [ARCHITECTURE.md](ARCHITECTURE.md), which
documents the system as currently implemented.*
