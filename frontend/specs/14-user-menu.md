# Spec: user-menu

**Phase:** 1
**Route:** cross-cutting (avatar dropdown in Landing + Production headers)
**Status:** ready
**Blast radius:** YELLOW — one feature with 5 modals; no auth in Phase 1

## Prerequisites
- Specs 03 + 04 — avatars render in both headers

## Context

- CLAUDE.md, conventions.md
- BRD §9.4 (`FR-X18`–`FR-X25`)
- docs/open-questions.md (Q-AUTH-01 — no auth in Phase 1;
  Q-USR-01 — single role)
- src/components/landing/LandingHeader.jsx — avatar host
- src/components/production/ProductionHeader.jsx — avatar host
- src/components/common/ConfirmDialog.jsx — for any confirmation
  needed
- src/lib/mockData.js — adds MOCK_USER + APP_VERSION
- package.json — read version at build time

## Assumptions in play

None active. Q-AUTH-01 + Q-USR-01 both RESOLVED — no auth, single
role. All actions that would normally hit a backend (password
change, profile edit) are stubs that toast "Backend pending".

## Purpose

Replace the visual-only Avatar in both headers with an interactive
dropdown menu + the 5 sub-modals listed by `FR-X18`. Logout
navigates to `/` (no token to clear in Phase 1).

## Scope

### Mock data

`src/lib/mockData.js` gains:

- `MOCK_USER` — single user matching the "PH" role:
  ```js
  {
    name: "Rakesh Patel",
    role: "Plant Head",
    plant: "Banmore Plant",
    email: "rakesh.patel@jktyre.example",
    phone: "+91 98765 43210",
    employeeId: "JK-PH-00142",
    joinedDate: "2018-04-12",
    avatarInitials: "PH",
  }
  ```

### Components in `src/components/user-menu/`

- **`UserMenu.jsx`** — clickable Avatar + MUI Menu dropdown. Menu
  items per `FR-X18`: My Profile / Change Password / Theme / Help /
  About / divider / Logout (red text per `FR-X19`). Owns active-modal
  state (one open at a time).
- **`ProfileModal.jsx`** — read-only Dialog showing all `MOCK_USER`
  fields per `FR-X20`. Close button.
- **`ChangePasswordModal.jsx`** — 3 password fields (current, new,
  confirm) + a basic strength hint (length ≥ 8, mixed case, digit).
  Submit → toast "Backend pending" + close (`FR-X21`).
- **`ThemeModal.jsx`** — 3 radio options: Light (active), Dark
  (disabled, "coming soon"), System (disabled, "coming soon")
  (`FR-X22`).
- **`HelpModal.jsx`** — static link list: User Guide, Keyboard
  Shortcuts, FAQs, Support (`FR-X23`). Phase 1: all links are
  visual; no destinations.
- **`AboutModal.jsx`** — app name ("One Factory One Dashboard"),
  version (`__APP_VERSION__` global injected by Vite from package.json
  at build time), build date (`new Date()` at runtime — close
  enough for Phase 1), credits (`FR-X24`).

### Vite define for version

Add to `vite.config.js`:
```
define: { __APP_VERSION__: JSON.stringify(pkg.version) }
```

This avoids importing `package.json` at runtime.

### Wiring

`LandingHeader` + `ProductionHeader` replace their `<Avatar>` JSX
with `<UserMenu user={MOCK_USER} accent="primary" />`. Avatar look
unchanged.

### Logout behaviour

`FR-X25`: Logout returns to `/`. No token to clear in Phase 1; the
menu item just calls `navigate("/")` and closes.

## Reuse check

- [x] `useToast` for Backend-pending stubs.
- [x] No new common primitive yet — UserMenu may move to `common/`
  later if other dashboards need it (Quality/Engineering
  surfaces — Phase 2).

## Data

- `MOCK_USER` from mock data; no API call.

## States

- Menu closed (default) → just the avatar.
- Menu open → MUI Menu list.
- One of 5 modals open → menu closed, modal centered.

## Out of scope

- Real password change / profile edit (no backend).
- Dark / System themes (`FR-X22` explicit deferral).
- Role switching (Q-USR-01: single role).
- Multi-language Help content.
- "Logged in as" badge — single-role app doesn't need it.

## Done when

- Clicking the avatar in either header opens the dropdown with 6
  menu items (Logout visually separated with a divider + red text).
- Each menu item opens its corresponding modal (except Logout).
- Modals close via X button, Escape, or backdrop click (MUI
  Dialog defaults).
- About modal shows the version from `package.json`.
- Change Password submit → toast "Backend pending" + closes.
- Logout from any route returns to `/` and closes the menu.
- `npm run check` exits zero.
- Manual click-through.
- Commit lands → `logs/history.md`.
