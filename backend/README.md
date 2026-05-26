# JK Dashboard — Backend (not yet scaffolded)

Stack target: Node.js 20+ with Express or Fastify, Prisma or Knex,
PostgreSQL. Serves the JSON REST API consumed by `../frontend/`.

## Status

Empty placeholder. The Part III Day-0 pass (PLAYBOOK.pdf Part III) has
not been run yet. When it is, scaffolded into this directory you should
see:

```
backend/
  CLAUDE.md                # Agent entrypoint
  AGENTS.md                # Cheat sheet
  conventions.md           # Code rulebook
  README.md                # Replaces this file
  docs/
    product.md             # BRD/PRD (references ../../docs/brd.docx)
    architecture.md        # TRD — layering, boundaries
    data-model.md          # TRD — entities, invariants
    api-contract.md        # TRD — authoritative API shape
    open-questions.md      # OQR
    roadmap.md
  specs/
    _template.md
    _change-request-template.md
  scripts/
    check.sh
    log-history.sh
    snapshot.sh
    prompt-context.sh
    scaffold-spec.sh
    scaffold-cr.sh
    scaffold-endpoint.sh
  .githooks/post-commit    # delegated by root .githooks/post-commit
  logs/
    history.md
  prisma/                  # if Prisma
    schema.prisma
  src/
    index.js, app.js, routes/, controllers/, services/,
    repositories/, middleware/, validators/, lib/, config/, jobs/
```

## When to run Part III Day-0

Run it once Q-BE-01 in [../frontend/docs/open-questions.md](../frontend/docs/open-questions.md)
is resolved — i.e. once stakeholders decide whether this monorepo houses
the backend or whether a separate repo does.

Until then the frontend uses deterministic mock data
(`VITE_USE_MOCK_DATA=true` in `../frontend/.env.local`).
