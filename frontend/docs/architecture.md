# Frontend Architecture

## Stack

- React 18+ with hooks
- Vite dev server and build
- JavaScript with JSDoc for type hints
- Material UI v5 (@mui/material, @mui/icons-material)
- React Router v6 for navigation
- Axios for HTTP
- js-cookie for cookie-stored refresh tokens (if Pattern A is chosen — see Authentication below)

## Folder layout

```
src/
  main.jsx              # Vite entry
  App.jsx               # Top-level layout + providers (ThemeProvider, ToastProvider, RouterProvider)
  router.jsx            # Route definitions
  theme.js              # MUI theme (palette, typography, components)
  api/                  # HTTP client and per-resource modules
  pages/                # One file per route (BanmoreProduction.jsx, etc.)
  components/
    common/             # Shared Algo8 primitives — synced, read-only
    [project-only]/     # Components specific to this app (KpiCard, DrillPanel, ...)
  hooks/                # Custom hooks
  lib/                  # Framework-agnostic helpers (formatters, mock data)
  context/              # React context — sparingly
```

The deterministic-mock prototype lives at [../docs/artifact.jsx](../docs/artifact.jsx).
That file is a flat single-file React component. As Phase 1 progresses, its
pieces (KpiCard, DrillPanel, ProductionDashboard, etc.) move into the
folder layout above. The prototype is not deleted until the structured app
reaches visual + behavioural parity.

## Data flow

```
Page / Component  <->  src/api/[resource].js  <->  HTTP  <->  Backend
                            |
                            v
                   src/api/client.js (axios instance, interceptors, base URL, auth header)
```

Pages call resource modules. Resource modules call the client. The client
handles base URL, auth, and common errors.

**Phase 1 data path (Q-BE-01 resolved 2026-05-20):** there is no backend
in Phase 1. Resource modules at `src/api/*.js` keep the production
shape — exported async functions, parsed return values — but their
implementation reads from `src/lib/mockData.js` (parity with
docs/artifact.jsx) and returns after a short artificial delay so
loading states render. When the backend is built later, only the
internals of `src/api/*.js` change; pages and hooks stay the same.

**Polling cadence (Q-DATA-01 resolved 2026-05-20):** KPI grids, drill
panels, and trend modal data refresh every **60 seconds**. No
WebSocket / SSE push in Phase 1. The polling lives in a custom hook
(`src/hooks/usePolledQuery.js` — TBD by spec) that pages call instead
of `useEffect` + `fetch`. The 60s cadence is hard-coded as a constant
in the hook with an override prop for specs that need a different
interval.

## Routing

React Router v7 with a single router.jsx defining the tree. URLs are
semantic. Phase 1 routes:

- `/` — Landing page (India map, plant cards, function tiles per BRD §5).
  Banmore + Production tile are active; other plants and other function
  tiles render visible-but-disabled per Q-NAV-01.
- `/banmore/production` — Banmore Production dashboard (the only fully
  implemented dashboard in Phase 1).
- `/banmore/production/kpi/:kpiId` *(optional)* — deep-link into an open
  drill panel; defer if not needed.

Phase 2+ routes (sketched, not built):
`/[plant]/production`, `/[plant]/quality`, `/[plant]/engineering`,
`/[plant]/inventory`.

No `<RequireAuth>` wrapper in Phase 1 — see Authentication below.

## Authentication

**Phase 1 (Q-AUTH-01 resolved 2026-05-20): no auth.** Frontend-only
build against dummy APIs. No login page, no token, no `<RequireAuth>`,
no axios auth header. The dashboard is reachable directly at any route.
This is acceptable because Phase 1 runs against `localhost` only and
ships no backend (Q-BE-01).

When the backend is built (post-Phase-1), the auth pattern decision is
revisited. The candidate patterns at that point are documented below
for reference; they are NOT implemented now.

> **Phase 2+ reference — do not implement in Phase 1.**
>
> **Pattern A: Access token in localStorage, refresh token in cookie (js-cookie)**
> Access token in localStorage, attached as `Authorization: Bearer <token>` by
> the axios request interceptor. Refresh token in a js-cookie named "refreshToken".
> 401 → single-flight refresh + retry; refresh fail → clear + redirect to /login.
>
> **Pattern B: Tokens in memory + httpOnly refresh cookie (backend-set)**
> Access token in a module-level variable; refresh token in an httpOnly Secure
> SameSite=Strict cookie set by the backend. Refresh call sends no body.
>
> **Pattern C: None (public app)**
> Used when network-layer protection (corporate VPN / SSO at the proxy) is
> sufficient. This is what Phase 1 ships as.

## Styling

MUI theme in src/theme.js defines palette, typography, spacing, and
component overrides. Component styling uses `sx` for one-offs, `styled()`
for reused patterns. No global CSS beyond a minimal reset.

The prototype uses an inline `C` color palette object (see
docs/artifact.jsx) — those tokens migrate into src/theme.js as part of
Phase 1 scaffold.

## Environment variables

- All env vars prefixed with `VITE_` (Vite requirement).
- Declared in .env.example, actual values in .env.local (gitignored).
- Access via `import.meta.env.VITE_XYZ`.
- Never commit real keys.

**Phase 1 (Q-ENV-01 resolved 2026-05-20): dev / localhost only.**
Staging and production hosting are deferred to the backend phase.

Expected vars for Phase 1:

- `VITE_API_BASE_URL` — defaults to `http://localhost:3000/api/v1`.
  Unused while `VITE_USE_MOCK_DATA=true` (which is the Phase 1 default),
  but the resource modules still read it so the backend swap is local.
- `VITE_USE_MOCK_DATA` — `"true"` for Phase 1 (default). Resource
  modules read from `src/lib/mockData.js`. Setting `"false"` later
  enables the HTTP path for backend integration testing.
