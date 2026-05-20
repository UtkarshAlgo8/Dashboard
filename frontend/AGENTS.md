# Frontend Agent Reference

## Stack

React 18+, Vite, JavaScript, Material UI v5, React Router v6, Axios,
js-cookie (if the project uses cookie-stored refresh tokens).

## Where to look

| Task                          | Location                                    |
|-------------------------------|---------------------------------------------|
| Add a page/route              | src/pages/[Name].jsx + src/router.jsx       |
| Use a shared Algo8 primitive  | src/components/common/ (read-only — synced) |
| Add a project-only component  | src/components/ (check common/ first!)      |
| Add an API call               | src/api/[resource].js                       |
| Shared helper (sleep, uid...) | src/lib/                                    |
| Custom hook                   | src/hooks/useX.js                           |
| Theme tweaks                  | src/theme.js                                |
| New feature spec              | specs/NN-feature.md                         |
| New change request            | specs/cr-NN-name.md                         |
| Read the dated change log     | logs/history.md                             |
| Check open questions          | docs/open-questions.md                      |
| Visual reference (prototype)  | docs/artifact.jsx                           |

## Commands

```
npm run dev          # Vite dev server — http://localhost:5173
npm run build        # Production build to dist/
npm run preview      # Preview the production build
npm run lint         # ESLint
npm run format       # Prettier
npm run check        # Lint + format-check + build + forbidden-pattern grep
npm run sync:common  # Refresh src/components/common/ from frontend-common-components/
npm run log-history  # Append latest commit to logs/history.md (also runs from post-commit)
npm run snapshot     # Generate docs/snapshots/state-YYYY-MM-DD.md
```

Run `npm run check` before every commit. It is the gate.

## Conventions summary (full rules in conventions.md)

- Functional components only, default export, PascalCase.jsx
- MUI components over custom CSS — `sx` for one-offs, `styled()` for reused
- Import alias `@/` -> `src/` — never deep relative paths
- All network calls through src/api/ — never `fetch` in components
- `useState` / `useReducer` for state — no Redux unless discussed
- Shared primitives come from src/components/common/; do not invent local copies

## Anti-patterns

| Forbidden                                          | Reason                              |
|----------------------------------------------------|-------------------------------------|
| fetch/axios directly in a component                | Use src/api/ layer                  |
| Inventing a new Button / Card / Modal              | MUI / common/ already has it        |
| Hex colour codes outside theme.js                  | Use theme tokens                    |
| Relative import deeper than `../`                  | Use `@/` alias                      |
| New npm package without asking                     | Stack is intentional                |
| Tests written unprompted                           | Out of scope by default             |
| Inline styles as string props                      | Use `sx` or `styled()`              |
| Editing files under src/components/common/         | Change frontend-common-components/  |
| Empty "What changed:" line in logs/history.md      | Defeats rollback workflow           |
| Silently resolving OQR-relevant ambiguity          | Surface it, log it                  |

## Before committing

1. `npm run check` exits zero
2. Feature clicked through manually in the browser
3. No console.log left behind
4. No commented-out code
5. Commit message is meaningful — the post-commit hook uses it as the
   logs/history.md summary if you don't supply one explicitly
6. Any new assumption logged in docs/open-questions.md
