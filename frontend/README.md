# JK Dashboard — Frontend

Self-hosted SigNoz configuration: [observability guide](../observability/README.md).

Plant operations dashboard for JK Tyres. Phase 1: Banmore plant, Production
function. Built with React 18 + Vite + Material UI v6 (React 19 compatible).

This is the `frontend/` side of the monorepo at `../`. See `../README.md`
for the layout overview.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
```

## Useful commands

```bash
npm run dev          # Vite dev server
npm run build        # Production build
npm run check        # Lint + format-check + build + forbidden-pattern grep
npm run sync:common  # Pull frontend-common-components/ -> src/components/common/
npm run snapshot     # Generate docs/snapshots/state-YYYY-MM-DD.md
```

## Where to read first

- [CLAUDE.md](CLAUDE.md) — agent entrypoint, working agreement
- [AGENTS.md](AGENTS.md) — paths, commands, conventions cheat sheet
- [conventions.md](conventions.md) — code rulebook
- [docs/product.md](docs/product.md) — what the product is (BRD/PRD slim)
- [../docs/brd.docx](../docs/brd.docx) — authoritative BRD source (shared, monorepo root)
- [docs/artifact.jsx](docs/artifact.jsx) — visual + behavioural prototype
  (deterministic mock data)
- [docs/architecture.md](docs/architecture.md) — frontend TRD
- [docs/api-contract.md](docs/api-contract.md) — backend contract (as the
  frontend sees it)
- [docs/open-questions.md](docs/open-questions.md) — unresolved questions
  and live assumptions
- [docs/roadmap.md](docs/roadmap.md) — phased plan
- [logs/history.md](logs/history.md) — dated change log (auto-written by
  post-commit hook)

## Wiring the post-commit hook (once per clone)

The hook is wired at the monorepo root and dispatches to this side:

```bash
# from the monorepo root, not here:
cd ..
git config core.hooksPath .githooks
chmod +x .githooks/post-commit frontend/scripts/*.sh
```

After that, every commit appends an entry to `frontend/logs/history.md`
automatically (and later `backend/logs/history.md` once that side is
scaffolded).

## Before writing the first spec

Run the **BRD intake pass** from `../PLAYBOOK.pdf` Part I.5 against
`../docs/brd.docx`. The output seeds `docs/open-questions.md` with the
full gap-analysis table; the seed entries currently in that file are
placeholders to be replaced.
