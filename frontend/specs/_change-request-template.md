# Change Request: [short name]

**ID:** CR-NN
**Raised by:** [PM / stakeholder / engineer]
**Raised on:** YYYY-MM-DD
**Status:** draft | analyzed | decided | implementing | done | rejected
**Relates to OQR:** [Q01, Q05] or "new — adds Q-NN"

## What changes

One or two sentences. The actual behavioural delta — not the reasoning,
not the history, just what's different after this lands.

## Why now (what gap surfaced)

Why didn't we know this earlier? Was it in the BRD and missed? Was it
genuinely new information from a customer? Was it a stakeholder who
wasn't in the BRD review?

This question is diagnostic, not blame-assigning. The answers feed the
next BRD intake pass.

## Impact analysis

Filled in by Claude via the change-request impact prompt, BEFORE any
code is written.

- **Files affected:** [list]
- **Specs needing rewrite or revision:** [list of spec IDs]
- **Specs already shipped that are now wrong:** [list]
- **Migrations required:** [yes/no, and what]
- **API contract breakage:** [none / additive / breaking]
- **Frontend reuse-library impact:** [none / new primitive needed / existing primitive changes]
- **Auth or data-model touchpoints:** [list]
- **Blast radius:** GREEN (single file/component) | YELLOW (one feature) | RED (cross-cutting or critical path)

## Decision

```
[ ] Take now      - sliding [feature X] to next phase
[ ] Queue         - after current phase ships
[ ] Defer         - logged in docs/decisions.md, revisit trigger: ___
[ ] Reject        - reason: ___
```

**Decided by:** [name]
**Decided on:** YYYY-MM-DD

## Implementation plan

If decision is "take now" or "queue", produced after decision via the
normal spec-review and planning flow. Treated as a new spec from this point.

## Done when

- Affected specs patched or superseded
- OQR updated (questions resolved or new ones added)
- logs/history.md reflects the change
- If RED blast radius: a short retro note in docs/decisions.md about what
  the BRD should have caught
