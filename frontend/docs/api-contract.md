# API Contract (as seen by the frontend)

This is the shape the frontend expects. The backend is authoritative on
the real contract — this file documents what we rely on.

**Status: LIVE (Phase 1).** Backend at [`../../backend/`](../../backend/)
implements this contract (CR-07, 2026-05-27 — Q-BE-01 re-resolved).
The frontend talks to it via
`VITE_API_BASE_URL=http://localhost:3001/api/v1` with
`VITE_USE_MOCK_DATA=false`. Backend proxies a single upstream API
(SELECT/WITH-only SQL against the `gold_dummy` parquet table); the
upstream key never leaves `backend/.env.local`.

Staging and Production rows in §"Base URL" are placeholders — Phase 1
runs on `localhost` only (Q-ENV-01 resolved 2026-05-20).

## Base URL

`VITE_API_BASE_URL` is the host + version prefix. All endpoint paths
below are appended directly.

- Development: http://localhost:[PORT]/api/v1
- Staging: https://api.staging.[domain]/api/v1
- Production: https://api.[domain]/api/v1

> Design note: the version (/api/v1) is embedded in the base URL rather
> than handled as a separate concern. For apps that may need to call v1
> and v2 simultaneously, move the version out of VITE_API_BASE_URL and
> into each resource module.

## URL style

- Plural, kebab-case resources: /plants, /kpis, /production-runs.
- Nested when owned: /plants/:id/production-kpis.
- HTTP verbs carry the action — no verbs in the path.
- GET list, GET /:id one, POST create (201), PATCH /:id partial,
  PUT /:id full replace (rare), DELETE /:id (204).

Phase 1 endpoints we expect to consume (target shape):

- `GET /plants/banmore/production/kpis?from=<iso>&to=<iso>&tyreType=<code>`
  → KPI grid data for the Production landing.
- `GET /plants/banmore/production/kpis/:kpiId/drill?sub=<subKey>`
  → DrillPanel content (sub-metric bars, control chart, etc.).
- `GET /plants/banmore/production/kpis/:kpiId/trend?range=<preset|custom>&from=&to=`
  → Trend series for the TrendPanel.
- `GET /plants/banmore/production/anomalies`
  → Anomaly strip entries.

All four are Phase 1 read-only. No mutation endpoints in Phase 1.

## Response shape

Success: `{ "data": { ... } }` or `{ "data": [ ... ] }`
Error:
```
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { "field": "email", "issue": "already_taken" }
  }
}
```

## Status codes we handle

- 200 OK            successful GET/PATCH
- 201 Created       successful POST
- 204 No Content    successful DELETE
- 400 Bad Request   show field errors from error.details
- 401 Unauthorized  trigger refresh flow; on refresh failure, logout + redirect
- 403 Forbidden     show "you don't have access" page
- 404 Not Found     show not-found page or inline state
- 409 Conflict      show specific toast
- 422 Unprocessable show toast with error.message
- 5xx               generic "something went wrong" toast + retry

## Auth

- Bearer token in Authorization header, injected by the axios request
  interceptor.
- Access token storage: localStorage "accessToken" (Pattern A) or
  memory-only (Pattern B) — see docs/architecture.md#authentication.
- Refresh token storage: cookie "refreshToken" via js-cookie (Pattern A)
  or httpOnly backend-set cookie (Pattern B).

### Refresh flow

On any 401 (except for the refresh call itself), the client:

1. Pauses the failing request, queues any others that 401 while a refresh
   is in flight.
2. Calls POST /auth/refresh-token with body `{ "refreshToken": "<cookie>" }`
   (or with no body if the refresh cookie is httpOnly).
3. On success the response is `{ "data": { "accessToken": "...",
   "refreshToken": "..." } }` — the client stores both and retries the
   queued requests with the new access token.
4. On failure (or if the refresh token is missing) the client clears auth
   state and redirects to /login.

The refresh must be single-flight: only one refresh call at a time
across all queued 401s, or you will thrash the backend and race the token.

## Pagination

Cursor-based for lists, appended to the base URL:

```
GET {VITE_API_BASE_URL}/plants/banmore/production/anomalies?cursor=abc123&limit=20
```

Response includes `pageInfo`:

```
{
  "data": [ ... ],
  "pageInfo": { "nextCursor": "xyz789", "hasMore": true }
}
```
