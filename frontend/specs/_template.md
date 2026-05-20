# Spec: [Feature Name]

**Phase:** [N]
**Route:** /path/to/page
**Status:** draft | ready | in-progress | done
**Blast radius:** single component | single page | crosses API boundary
                  | auth / critical path

## Context

Files to read for this feature (the AI should not need anything beyond
these):

- CLAUDE.md
- conventions.md
- docs/api-contract.md (if this touches the API)
- docs/open-questions.md (always — surface any OPEN items affecting this spec)
- src/api/client.js (if this touches the API)
- src/components/common/ (always — search before building new UI)
- src/pages/[Similar].jsx (as a pattern to follow)
- [other files]

## Assumptions in play

OQR items this spec depends on. If any of these resolve differently
from the current default, this spec must be revisited.

- Q01 (short description — assuming X)
- Q05 (short description — assuming Y)

If no OQR items apply, write "None".

## Purpose

One or two sentences. What does this page/feature do, and why does it
exist in the product?

## User flow

1. User arrives from [where]
2. Sees [what]
3. Does [what]
4. Ends up at [where]

## UI elements

- [Element]: [description, MUI component or common/ primitive to use]
- [Element]: [description]

## Reuse check

- [ ] Searched src/components/common/ — match: [name] / near-match: [name + diff] / none
- If "none", does the new component belong in common/ (reusable) or
  this project's src/components/ (specific)?

## Data

- Reads from: [API endpoints]
- Writes to: [API endpoints]
- Local state shape: [if non-trivial]

## States

- Loading: [skeleton / spinner / nothing]
- Empty: [copy, call-to-action]
- Error: [how errors surface]
- Success: [what the user sees]

## Out of scope

- [Things tempting to add but not doing in this spec]

## Done when

- [Concrete clickable outcome]
- [Another outcome]
- `npm run check` exits zero
- Commit lands -> logs/history.md gets the entry automatically
