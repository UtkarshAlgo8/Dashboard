# JK Dashboard — Frontend

Plant operations dashboard for JK Tyres. Phase 1 ships Banmore plant + Production function only. Built as a deterministic-mock prototype today (see [docs/artifact.jsx](docs/artifact.jsx)); migrating to a structured Vite + MUI app.

React 18+ + Vite + JavaScript + Material UI v5. Talks to a Node.js backend over a JSON REST API. Backend lives at `../backend/` (not yet scaffolded — see [docs/open-questions.md](docs/open-questions.md), Q-BE-01).

Monorepo layout: this is the `frontend/` side. The shared BRD lives at
`../docs/brd.docx`. The root `../README.md` describes the monorepo
layout and the dispatching post-commit hook.

## Context you need

- Product context (BRD/PRD): docs/product.md
- BRD source-of-truth (Word, shared): ../docs/brd.docx
- Visual reference (deterministic-mock prototype): docs/artifact.jsx
- Architecture (TRD): docs/architecture.md
- Backend API shape (TRD): docs/api-contract.md
- Open questions and live assumptions: docs/open-questions.md
- What to build next: docs/roadmap.md
- Code rulebook: conventions.md
- Quick reference: AGENTS.md
- Dated change log + rollback: logs/history.md
- Shared component library: src/components/common/
  (synced from frontend-common-components/ — read-only here)

## Working agreement

1. I specify the task, usually via a spec in specs/.
2. You review the spec for gaps, ambiguities, contradictions. Check
   docs/open-questions.md for OPEN items that affect this spec. No plan yet.
3. I revise the spec or confirm it's ready.
4. You produce a plan (files to create/modify, approach, open questions).
   Before proposing any NEW component, search src/components/common/ for an
   existing primitive that fits. Surface near-matches. No code yet.
5. I review and approve the plan.
6. You implement.
7. I run `npm run check`, click through the feature, verify behaviour.
8. I commit. The post-commit hook runs scripts/log-history.sh, which
   appends an entry to logs/history.md. Fresh session for the next feature.

Never skip the spec-review or plan steps, even for small tasks.

## Open questions and assumptions

- Before producing any plan, read docs/open-questions.md and list any
  OPEN items relevant to the current spec.
- If you make an assumption that is not in the BRD, conventions.md, or
  the spec itself, STOP and propose adding it to docs/open-questions.md
  before continuing. Do not silently resolve ambiguity.
- If the spec depends on an OPEN OQR item and the default assumption
  could plausibly be wrong, flag it explicitly in your plan rather than
  proceeding.

## Scope discipline

- Do not introduce new dependencies without asking.
- Do not refactor code outside the scope of the current task.
- Do not write tests unless explicitly asked.
- Do not add features that were not requested.
- Phase 1 ships **Banmore plant + Production dashboard only**. Chennai,
  Laksar, Mysore, Quality, Engineering, and Inventory are visible in
  docs/artifact.jsx as the eventual target — they are out of scope for
  Phase 1. Do not implement them unless a spec calls for it.
- Only read the files listed in the spec's `Context` field unless you need
  something specific; in that case, tell me what you need and why.

## Shared component rules

- src/components/common/ is synced from frontend-common-components/.
  Treat it as read-only. If a primitive is missing or wrong, propose a
  change to frontend-common-components/ itself, do not edit the project copy.
- Before writing a custom component, search src/components/common/ for a
  match. If one is close-but-not-exact, surface that and let me decide
  whether to use it, configure it, or extend the library.

## Model selection

Default: Sonnet for implementation work.

Use Opus for:
- BRD intake pass (Part I.5 — once per project)
- Spec review (gap-finding mode, before planning)
- Plan generation for RED or cross-cutting specs
- Auth, payments, data-mutation critical paths
- Change-request impact analysis
- Debugging where the cause is unknown

Use Sonnet for:
- Implementation against an approved plan
- Conventional refactors (rename, extract, inline)
- Plan generation for GREEN or YELLOW blast radius specs
- Writing tests against a fixed interface
- Spec drafting from a template

Use Haiku for:
- Commit message rewrites, mechanical search-and-replace, boilerplate
  from templates, summarising logs/history.md.

## Rollback awareness

- logs/history.md is the dated change log written by the post-commit hook.
- "Roll me back to <date>" or "what did we ship last week" → read history.md,
  not git log. Pick a target hash from there.
- See the rollback investigation prompt in Part IV.

## When uncertain

Ask one clarifying question rather than inventing requirements. Technical
defaults (naming, imports, formatting) follow conventions.md — no need to
ask about those.

## Non-goals for this repo

- TypeScript (this is JavaScript with JSDoc)
- Custom CSS frameworks (MUI only)
- State libraries beyond React itself (no Redux, no Zustand) unless a
  spec documents why
- Server-side rendering
- Editing src/components/common/ in-project — go through
  frontend-common-components/
- Phase 2+ scope (multi-plant, Quality, Engineering, Inventory) — see
  docs/roadmap.md
