# Spec: user-menu

**Phase:** 1
**Route:** cross-cutting (avatar dropdown in every dashboard header)
**Status:** draft
**Blast radius:** YELLOW — dropdown + 5 modals (most are placeholders)

## Prerequisites
- Spec 03 / 04 (avatar rendered in headers)

## Purpose

Implement the user-menu dropdown and its sub-modals per BRD §9.4
(`FR-X18`–`FR-X25`). All five sub-modals exist in the prototype; Phase 1
ships them as placeholders since the underlying behaviour is out of
scope (no auth, no profile editing, no dark theme — see Q-AUTH-01 and
BRD `FR-X22` "coming soon" markers).

## Scope

- Avatar click → dropdown with items: My Profile / Change Password /
  Theme / Help / About / Logout (`FR-X18`).
- Logout visually separated (divider above, red text) — `FR-X19`.
- **My Profile modal** (`FR-X20`) — read-only fields populated from
  mock user (name, role, plant, email, phone, employee ID, joined).
- **Change Password modal** (`FR-X21`) — UI only, no backend; submit
  triggers a toast "Backend pending" and closes the modal.
- **Theme modal** (`FR-X22`) — Light / Dark / System options; Light
  is the only one active (BRD-confirmed deferral). Dark / System
  show "coming soon" labels.
- **Help modal** (`FR-X23`) — static text with quick-link placeholders.
- **About modal** (`FR-X24`) — app name, version (from package.json),
  build date, credits.
- **Logout (`FR-X25`)** — clears nothing (no auth in Phase 1),
  navigates back to `/`.

## Out of scope
- Real password change (Phase 2 — needs backend).
- Real profile edit (Phase 2 — needs backend).
- Dark theme implementation (deferred per `FR-X22`).
- Multi-language switching in Help.
