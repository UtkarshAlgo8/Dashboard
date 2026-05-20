# Spec: other-drills

**Phase:** 1
**Route:** `/banmore/production` (drill panels for Downtime and Plan Compliance KPIs)
**Status:** draft
**Blast radius:** GREEN — two drill panels using established patterns

## Prerequisites
- Spec 05 (KPI grid + drill toggle)

## Purpose

Cover the remaining drill panels in BRD §6.12: Downtime and Plan
Compliance.

## Scope

- **Downtime KPI drill (`FR-P60`)** — table columns: Reason Category |
  Machine | Reason Description | Events | Duration (min) | Loss (hrs).
  Categories: Breakdown (Electrical / Mechanical / Instrumentation),
  Setup (FTC, size change), PM, Process, Utility (power failure), Other.
- **Plan Compliance KPI drill (`FR-P61`)** — sub-drill control with
  SKU-wise and Machine-wise views. Each shows Planned, Actual,
  % compliance.

## Out of scope
- Drill-into-row for individual events.
