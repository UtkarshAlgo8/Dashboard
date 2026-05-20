# Frontend Conventions

These rules are strict. If a rule here conflicts with something the AI
thinks is "best practice", this file wins.

## Language

- JavaScript only. No TypeScript.
- JSDoc for non-trivial exported functions.
- `const` by default, `let` only when reassigning, never `var`.
- Early returns over nested conditionals.

## Components

- Functional components only, no classes.
- Default export, one component per file.
- Filename: PascalCase.jsx (e.g. UserCard.jsx).
- Destructure props in the signature, not inside the body.
- No inline component definitions inside render bodies.

## Material UI

- Use MUI layout primitives (Box, Stack, Grid, Container).
  No raw `<div>` with flex/grid CSS.
- MUI components before custom: Button, TextField, Card, Dialog,
  Table, Chip, Alert, Tooltip, Drawer, AppBar, Menu.
- Icons exclusively from @mui/icons-material.
- `sx` prop for one-off styling.
- `styled()` when the same styling appears 2+ times.
- Theme tokens only in project code: theme.palette.primary.main, not
  "#1976d2". No hex codes outside src/theme.js — with one exception:
  src/components/common/ may contain hex codes because it is upstream
  library code that doesn't know the consuming project's theme.
  The forbidden-pattern grep in scripts/check.sh enforces this
  (excludes theme.js + src/components/common/).

## Shared component library

- src/components/common/ is read-only here, synced from
  frontend-common-components/. Edits to that folder belong upstream.
- Before adding any new component to src/components/, search common/ first:
  - Match -> use it directly.
  - Near-match -> surface the diff to the human, decide use-as-is vs.
    configure vs. extend upstream.
  - No match -> propose the new component shape and ask whether it
    belongs in common/ (reusable across projects) or this project's
    src/components/ (project-specific).

## State

- `useState` for local UI state.
- `useReducer` when 3+ related pieces of state update together.
- React Query / TanStack Query for server state (if the project adopts it).
- React Context only if prop-drilling exceeds 3 levels.
- No Redux unless there is a specific, documented reason.

## API layer

- All network calls go through src/api/.
- src/api/client.js configures axios (base URL, auth header, errors).
- One module per resource: src/api/users.js, src/api/orders.js.
- Modules return parsed data, not raw axios responses.
- Errors throw; components catch with try/catch or React Query `onError`.
- Components never construct URLs or call `fetch` directly.

## Forms

- react-hook-form for anything beyond 2 fields.
- Client-side validation is for UX — backend is authoritative.
- Error messages come from `backend error.details` where possible.

## Imports

- Alias `@/` -> `src/` (configured in vite.config.js).
- Order: React -> libraries -> `@/` aliased -> relative -> CSS.
- One blank line between import groups.
- No relative imports beyond one level (./helpers is fine, ../../ is not
  — use `@/` instead).

## Naming

- Components: PascalCase
- Hooks: useCamelCase
- Functions, vars: camelCase
- Constants: SCREAMING_SNAKE_CASE (only for true module constants)
- Files: PascalCase.jsx for components, camelCase.js for rest
- Booleans: isLoading, hasError, canSubmit
- Event handlers: handleClick locally, onSave as props

## Error handling

- Network errors surface via a toast hook (MUI Snackbar).
- 401 responses trigger the refresh flow; if refresh fails, logout + redirect.
- Unexpected errors: console.error in dev, silent in prod.

## Anti-patterns

- Business logic in components (extract to hooks or lib/).
- Memoisation without profiling evidence (useMemo, useCallback, memo).
- Inline styles via the `style` prop.
- prop-types library (we use JSDoc).
- Error boundaries unless a spec calls for one.
- Premature abstraction for "future flexibility".
- Editing src/components/common/ instead of frontend-common-components/.
