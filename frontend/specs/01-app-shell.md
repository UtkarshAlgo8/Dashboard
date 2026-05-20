# Spec: app-shell

**Phase:** 1
**Route:** app-wide foundation (covers `/` and `/banmore/production` route stubs)
**Status:** ready
**Blast radius:** YELLOW — one feature (app foundation). No API, no auth, but everything Phase 1 ships sits on top of it.

## Context

Files to read for this feature (the AI should not need anything beyond
these):

- CLAUDE.md
- conventions.md
- docs/product.md (Phase 1 scope and non-goals)
- docs/architecture.md (folder layout, routing, env vars, theme guidance)
- docs/open-questions.md (all 10 seed Q-* items RESOLVED — read the
  resolution log; do not invent new behaviour beyond those decisions)
- docs/artifact.jsx (visual reference: color palette object `C`,
  typography, header chrome, brand block)
- src/components/common/ (PageContainer, PageHeader, ToastProvider —
  search before building new UI)
- src/main.jsx (current state: Vite default with StrictMode)
- src/App.jsx (current state: Vite default landing — to be replaced)
- vite.config.js, jsconfig.json (already alias `@/` → `src/`)
- package.json (verify MUI v6, react-router-dom v7 are present)

## Assumptions in play

**None active.** All ten seed OQR items (Q-AUTH-01 through Q-MOBILE-01)
were resolved on 2026-05-20. The decisions this spec relies on:

- Q-AUTH-01 — no auth, no `<RequireAuth>` wrapper, no login route.
- Q-BE-01 — no backend, no axios setup in this spec (spec 02 builds
  the dummy API layer).
- Q-USR-01 — single role, no role-based routing.
- Q-NAV-01 — non-Banmore plants and non-Production functions render
  visible-but-disabled when those surfaces are built (spec 03+
  implements; this spec just stubs the two routes).
- Q-MOBILE-01 — desktop + tablet supported; phone not supported.
- Q-ENV-01 — dev / localhost only.

The 122-row broader BRD intake at `docs/brd-intake-2026-05-20.md` is
still pending a PM walk; no row from that table blocks this spec.

## Purpose

Replace the Vite default scaffold with the JK Dashboard app foundation
so subsequent specs can build the artifact's surfaces (Landing,
Production dashboard, drills, trend modal) inside a real MUI + Router
shell.

## User flow

1. User visits `http://localhost:5173/`.
2. Sees the Landing placeholder page (titled "Landing — pending spec 03")
   styled with the artifact's palette and Montserrat typography.
3. Navigates to `/banmore/production` via direct URL.
4. Sees the Banmore Production placeholder page (titled "Banmore
   Production — pending spec 04+").

## UI elements

This spec touches the global shell only. No page-specific UI yet.

- **`src/theme.js`** — MUI v6 `createTheme()` exporting a light theme.
  - **Palette mapping (Option A — minimal MUI roles + `theme.custom`)**.
    The artifact's `C` object (`docs/artifact.jsx`) is the authoritative
    palette:
    ```
    const C = {
      bg:"#F3F4F8", cd:"#FFFFFF", c2:"#F7F8FA", bd:"#E0E3EA",
      tx:"#1A1D26", md:"#4A5168", mu:"#8891A5",
      ac:"#E8651A", aL:"rgba(232,101,26,.07)", aB:"rgba(232,101,26,.28)",
      tl:"#1A9A3E", bl:"#2563EB", rd:"#DC2626", am:"#CA8A04",
      gn:"#1A9A3E", pp:"#7C3AED", cy:"#0D9488",
      sh:"0 1px 3px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)",
      r:8
    };
    ```
    MUI palette mapping:
    - `primary.main` ← `C.ac` (#E8651A — orange accent)
    - `primary.light` ← `C.aL`
    - `primary.dark` ← `C.aB`
    - `success.main` ← `C.gn` (#1A9A3E)
    - `warning.main` ← `C.am` (#CA8A04)
    - `error.main`   ← `C.rd` (#DC2626)
    - `info.main`    ← `C.bl` (#2563EB)
    - `text.primary` ← `C.tx`
    - `text.secondary` ← `C.md`
    - `text.disabled`  ← `C.mu`
    - `background.default` ← `C.bg`
    - `background.paper`   ← `C.cd`
    - `divider`            ← `C.bd`

    Everything else lives on `theme.custom`:
    ```
    theme.custom = {
      surface: { default: C.bg, paper: C.cd, soft: C.c2 },
      text:    { strong: C.tx, medium: C.md, muted: C.mu },
      brand:   { orange: C.ac, orangeSoft: C.aL, orangeRing: C.aB,
                 teal: C.tl, blue: C.bl, green: C.gn, amber: C.am,
                 red: C.rd, purple: C.pp, cyan: C.cy },
      shadow:  C.sh,
      radius:  C.r,
    };
    ```
    Rationale: `primary` etc. follow MUI semantics so MUI components
    (`<Button color="primary">`) work out of the box. Artifact-specific
    tokens (`brand.teal`, `brand.cyan`, surface tiers) ride on `custom.`
    so it's obvious they're project-specific. No hex codes anywhere
    outside `src/theme.js` (`scripts/check.sh` enforces this).

  - **Typography: Montserrat** loaded via Google Fonts CDN. Weights
    400, 500, 600, 700. `<link>` tags added to `index.html` (no npm
    package). MUI typography uses
    `"Montserrat, system-ui, -apple-system, sans-serif"` as the
    fallback chain.

  - **Breakpoints**: MUI defaults. Phase 1 minimum viewport = 768px
    (tablet). Pages should look usable at `md` and above. No
    phone-breakpoint usage required (Q-MOBILE-01).

  - **Component overrides (light)**:
    - `MuiButton`: `textTransform: "none"` (no uppercase).
    - `MuiCard`: `borderRadius: 10` (artifact uses 10px).
    - `MuiDialog`: `Paper` borderRadius 10.

- **`src/App.jsx`** — replaces the Vite default. Mounts:
  ```
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </ThemeProvider>
  ```
  Imports `theme` from `@/theme`, `router` from `@/router`,
  `ToastProvider` from `@/components/common`.

- **`src/main.jsx`** — keep current StrictMode wrapping App.

- **`src/router.jsx`** — `createBrowserRouter` with two routes,
  **direct (non-lazy) imports** for Phase 1 simplicity. Lazy loading
  is revisited in spec 04+ when component trees are heavy enough to
  warrant code-splitting.
  - `/` → `LandingPagePlaceholder`
  - `/banmore/production` → `BanmoreProductionPlaceholder`

  No `<RequireAuth>`. No 404 route in this spec (polish phase).

- **`src/pages/LandingPagePlaceholder.jsx`** — uses `PageContainer`
  with title "Landing" and a body reading "Landing page pending —
  see `specs/03-landing-page.md`".

- **`src/pages/BanmoreProductionPlaceholder.jsx`** — same shape, title
  "Banmore Production", body "Production dashboard pending — see
  `specs/04-production-dashboard-shell.md` and following".

- **Deletes** (Vite default cruft):
  - `src/App.css`
  - `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`
  - `public/vite.svg`, `public/icons.svg` (if present)

- **`index.html`** —
  - `<title>` → "JK Dashboard"
  - Add Google Fonts `<link>` tags for Montserrat (preconnect +
    stylesheet).
  - **Remove** the default `<link rel="icon" href="/vite.svg" />` line
    (vite.svg is deleted). Replace with `<link rel="icon" href="data:,">`
    to suppress the 404 until a real favicon is added in a later spec.

- **`package.json`** — `"name"` from `"jk-dashboard-full"` to
  `"jk-dashboard-frontend"` for monorepo clarity. No version bump.

## Reuse check

- [x] Searched `src/components/common/`.
  - Match: `PageContainer` — use for both placeholder pages.
  - Match: `PageHeader` — used internally by `PageContainer`.
  - Match: `ToastProvider` from `useToast.jsx` — mount in App.jsx.
  - No new common components needed for this spec.
- No new project-only components needed either. A real layout shell
  belongs to spec 04.

## Data

- Reads from: none (no API; no mock data layer yet).
- Writes to: none.
- Local state shape: none.

## States

- Loading: route renders directly (no lazy load), so no fallback needed.
- Empty: each placeholder page renders its placeholder copy.
- Error: no error states in this spec.
- Success: page renders with the correct title and copy in Montserrat.

## Out of scope (deferred to later specs)

- Mock data layer + dummy API → spec 02.
- Landing page UI → spec 03.
- Production dashboard shell + chrome → spec 04.
- KPI cards, drills, trend modal, print, user menu, inventory → specs 05–15.
- 404 page, error boundary, loading skeletons, mobile polish, real
  favicon → polish phase.

## Done when

- `npm run dev` runs without console errors at `http://localhost:5173/`.
- Visiting `/` renders the Landing placeholder page using
  `PageContainer`, with the page background = `theme.palette.background.default`
  (= `#F3F4F8` from `C.bg`).
- Visiting `/banmore/production` renders the Banmore Production
  placeholder page.
- Page title and body text render in **Montserrat** (verified via
  devtools → Computed → `font-family`).
- `src/theme.js` exports `theme` and `palette` tokens match the
  artifact's `C` mapping listed above (eyeball check against
  `docs/artifact.jsx` acceptable).
- `ToastProvider` wraps the router. **Verification:**
  `BanmoreProductionPlaceholder` mounts a temporary `useEffect` that
  calls `toast.info('shell up')` once; the snackbar appears bottom-right
  on first visit. The debug toast and its `useEffect` are removed
  before the spec is marked `done` (and before commit). This proves
  the provider is mounted at the right scope.
- Vite default artwork fully deleted from `src/` and `public/`.
- `index.html` `<title>` reads "JK Dashboard"; favicon `<link>` no
  longer points to the deleted `vite.svg` (no 404 in devtools Network).
- `package.json` `"name"` = `"jk-dashboard-frontend"`.
- **Manual click-through (working agreement step 7):** open both routes
  in the browser, confirm placeholder pages render, no console errors,
  no network 404s.
- `npm run check` exits zero.
- Commit lands → `logs/history.md` gets the entry automatically via
  the post-commit hook.

## Spec roadmap (informational)

| # | Spec | Surface |
|---|------|---------|
| 01 | **app-shell** *(this spec)* | Theme, providers, router stubs |
| 02 | mock-data-layer | `src/lib/mockData.js`, dummy `src/api/*.js`, `usePolledQuery` (60s) |
| 03 | landing-page | India map, plant cards (Banmore active, others disabled), function tiles (Production active) |
| 04 | production-dashboard-shell | Section sidebar (MIX/TBM/CUR/STK), category tabs (P/Q/C/D/M/S/I), plant card, header chrome (TimeRange, TyreType, Export, Avatar) |
| 05 | mixing-productivity-kpis | KPI grid for Mixing → Productivity (default tab+section) |
| 06 | oee-drill | OEE drill-down (A/P/Q tiles, machine table, sub-drill) |
| 07 | production-drill | Compound-wise table + machine search |
| 08 | scrap-traceability | Item → Production IDs → CSV with UTF-8 BOM |
| 09 | other-drills | Downtime, Plan Compliance |
| 10 | trend-modal | KPI trend modal, chart auto-select, time-range component |
| 11 | other-sections | TBM, Curing, Stock parity |
| 12 | other-tabs | Q, C, D, M, S tabs |
| 13 | export-print | `window.print()` + print stylesheet |
| 14 | user-menu | Avatar dropdown placeholders |
| 15 | inventory-page | Phase 1 stretch — only if scope allows |
