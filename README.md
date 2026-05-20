# JK Dashboard — Monorepo

Plant operations dashboard for JK Tyres. Phase 1: Banmore plant,
Production function.

## Layout

```
JK-Dashboard-Full/
├── PLAYBOOK.pdf       # AI-Assisted Development Playbook (shared)
├── docs/
│   └── brd.docx       # Authoritative BRD (shared input for FE + BE)
├── frontend/          # React 18+ + Vite + Material UI v5
│   └── (Part II Day-0 scaffold)
├── backend/           # Node.js + Express/Fastify + Prisma/Knex — TBD
│   └── (Part III not yet scaffolded)
└── .githooks/         # Monorepo post-commit hook (dispatches to each side)
```

Each side owns its own CLAUDE.md, AGENTS.md, conventions.md, docs/,
specs/, scripts/, and logs/. The Playbook treats them as independent
projects that share a BRD.

## Quick start

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

See [frontend/README.md](frontend/README.md) for full FE quick-start.

### Backend

Not yet scaffolded. See [backend/README.md](backend/README.md). When ready,
run the Part III Day-0 setup against the `backend/` directory.

## Wiring the post-commit hook (once per clone)

```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-commit frontend/scripts/*.sh frontend/.githooks/post-commit
```

The root hook dispatches to each side's `scripts/log-history.sh` so each
side maintains its own `logs/history.md`.

## Before writing any specs

Run the **BRD intake pass** (PLAYBOOK Part I.5) against [docs/brd.docx](docs/brd.docx).
The output seeds [frontend/docs/open-questions.md](frontend/docs/open-questions.md)
(and later `backend/docs/open-questions.md`). This is the cheapest 1.5 hours
you will spend on the project.
