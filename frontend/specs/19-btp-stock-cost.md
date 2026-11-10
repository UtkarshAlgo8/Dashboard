# 19 — BTP Stock Cost (Engineering → Maintenance)

Source: user-supplied `stock_cost_kpi_dashboard_guide.md` (2026-11-10).

## Confirmed scope

- Add one neutral **Stock Cost** card alongside the existing live Maintenance cards.
- Read raw `plant = 'BTP'`, `granularity = 'DAY'`, exact `Stock_Cost_o`, `Stock_Cost_Mt`, and `Stock_Qty_Mt` names. No category/department filter.
- Card: cost in ₹ Lakh, exact cost and distinct material-category count beneath, frontend percentage change against the previous published plant day. Missing/zero baseline gives no percentage. No quantity, target or RAG.
- **User-confirmed period rule:** day selects that exact date. Month/custom range selects the latest published plant day _within that selection_, explicitly labelled. Never sum costs across dates. Shift does not filter this DAY-only KPI; label All shifts.
- Card click: existing right-hand drill area, one-date top-three share, category/cost/quantity/unit-price table and cost-only total row. The Pareto plot was removed at the user's request; the category drill is table-only. Quantity is formatted per UoM (`7 NOS + 1 ST`); unit price is blank unless there is exactly one nonzero quantity unit.
- **User-confirmed trend presentation:** modal dialog with editable DAY date range and a single-select material-category filter, default All. Row shortcut opens the modal with the raw category selected.
- All trend: plant cost only. Selected category: daily cost bars and a separate quantity line/axis for each UoM. Missing category dates/units become zero. Unpublished plant totals remain gaps.
- **User-confirmed UoM extension:** live Gold also contains BT and L. Preserve any nonempty published UoM as its own quantity series; do not restrict to the guide's five example units, combine units, or convert them.
- Category labels are title-cased for display only. Raw `product_type` keys are retained for selection.
- No item-level drill. No MTD sum, movement/balance assumption, threshold or budget until confirmed (see Q-BTP-STOCK-02/03/04).

## Implementation

- `GET /api/v1/engineering/stock-cost?from=YYYY-MM-DD&to=YYYY-MM-DD`, existing auth gate and upstream Athena transport.
- Bounded inclusive range (366 days), strict date/filter validation, existing Gold history/daily source resolution, cache TTL 60 seconds with existing in-flight deduplication.
- One grouped read preserves date/category/UoM grain, plus the preceding published plant total for frontend comparison. Response includes selected overall points, preceding total, per-date category costs/quantity groups and reconciliation warnings. No date totals or cross-UoM quantity totals.
- Reject truncated/invalid responses or duplicate daily plant totals. Expose date-level category/plant cost mismatches (₹0.02 tolerance) without changing source values.
- Frontend aborts superseded requests and does not display prior-scope data while a new selection loads. No new dependencies or changes to synced common components.

## Verification

- Execute aggregate/window SQL on fixtures: exact scope, category/UoM sums, prior-day baseline, empty vs zero, reconciliation, truncation/invalid data, new UoMs, validation and HTTP/cache envelope.
- Live Gold 08/09-Nov values match the guide: ₹6,18,604.37 and ₹5,04,302.06, with category costs reconciling.
- Browser walkthrough against live example-date Stock Cost data: card, category table, overall trend, mixed-UoM trend, date controls, single-category filtering and row shortcut. Other dashboard APIs stubbed during the isolated walkthrough.
- Focused frontend lint and production build, existing frontend helper tests, and Engineering/Compliance/Safety/Stock Cost backend regressions.
