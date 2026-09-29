import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import TechDrillCard from "@/components/technical/TechDrillCard.jsx";
import { canonicalUnit } from "@/lib/kpi-transformer.js";
import { displayUnit, toDisplayQuantity } from "@/lib/units.js";
import {
  breakdownDiscipline,
  distinctValues,
  groupTotals,
  rowsOf,
  toDowntimeEvents,
  totalOf,
} from "@/lib/technicalDrills.js";

// Rows beyond this are summarised in the footnote rather than rendered.
const MAX_TABLE_ROWS = 200;

// The product whose rows already total every other product in the section —
// summing it with its children would double-count (Cured Tyre = Passenger
// Radial + LCV + Unknown). Same defaults as the Production dashboard.
const AGGREGATE_PRODUCT = { Curing: "Cured Tyre", TBM: "Green Tyre" };
const ALL_PRODUCTS = "All";

function fmt(value) {
  return Number(value ?? 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function pct(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function quantity(value, unit) {
  const shown = toDisplayQuantity(value, unit);
  return shown.unit ? `${fmt(shown.value)} ${shown.unit}` : fmt(shown.value);
}

function unitOf(rows) {
  return canonicalUnit(
    rows.find((r) => r.unit_of_measurement)?.unit_of_measurement,
  );
}

function capped(rows) {
  return rows.slice(0, MAX_TABLE_ROWS);
}

function cappedNote(total) {
  return total > MAX_TABLE_ROWS
    ? ` Showing the top ${MAX_TABLE_ROWS} of ${fmt(total)} rows.`
    : "";
}

/** Grouped table rows: key · quantity · share · cumulative share. */
function groupedRows(groups, unit) {
  return capped(groups).map((g) => [
    g.key,
    fmt(toDisplayQuantity(g.value, unit).value),
    pct(g.share),
    pct(g.cumulative),
  ]);
}

function groupedCols(view, unit) {
  const shown = displayUnit(unit);
  return [
    view,
    shown ? `Quantity (${shown})` : "Quantity",
    "Share",
    "Cumulative %",
  ];
}

/**
 * Picks the Technical drill for an open KPI card. `rawRows` are the rows of
 * the fetch that owns the KPI (Productivity or Quality), including the drill
 * children requested on click; `downtimeRows` are the reason leaves.
 */
function TechnicalDrillPanel({ kpiId, ...props }) {
  switch (kpiId) {
    case "prod":
      return <ProductionDrill {...props} />;
    case "scrap":
    case "ctscrap":
      return <ScrapDrill {...props} />;
    case "ncr":
      return <NcrDrill {...props} />;
    case "bdown":
      return <BreakdownDrill {...props} />;
    case "bcs":
      return <SetupDrill {...props} />;
    default:
      return null;
  }
}

function ProductionDrill({
  title,
  breadcrumb,
  sectionName,
  rawRows,
  card,
  planCard,
  isLoading,
  onClose,
}) {
  const theme = useTheme();
  const byMachine = rowsOf(rawRows, "Production_m", sectionName);
  const products = distinctValues(byMachine, "product_type");
  const aggregate = AGGREGATE_PRODUCT[sectionName];
  const productOptions = products.includes(aggregate)
    ? [aggregate, ...products.filter((p) => p !== aggregate)]
    : [ALL_PRODUCTS, ...products];
  const [productPick, setProduct] = useState(null);
  const product = productOptions.includes(productPick)
    ? productPick
    : productOptions[0];
  const inProduct = (rows) =>
    product === ALL_PRODUCTS
      ? rows
      : rows.filter((r) => r.product_type === product);

  // Mixing (Batch / KG) and Stock (NOS / M) record one output in two units
  // that may never be added together — pick one, defaulting to the card's.
  const unitOptions = [
    ...new Set(
      inProduct(byMachine)
        .map((r) => canonicalUnit(r.unit_of_measurement))
        .filter(Boolean),
    ),
  ];
  const cardUnit = unitOptions.find((u) => displayUnit(u) === card?.unit);
  const [unitPick, setUnit] = useState(null);
  const unit = unitOptions.includes(unitPick)
    ? unitPick
    : (cardUnit ?? unitOptions[0] ?? null);
  const scoped = (rows) =>
    inProduct(rows).filter(
      (r) => canonicalUnit(r.unit_of_measurement) === unit,
    );

  const [view, setView] = useState("Machine");
  // A single machine's fetch has no Production_sku (it carries no machine),
  // so its item view comes from that machine's Production_m_sku rows.
  const skuRows = rowsOf(rawRows, "Production_sku", sectionName);
  const itemRows = skuRows.length
    ? skuRows
    : rowsOf(rawRows, "Production_m_sku", sectionName);
  const groups =
    view === "Machine"
      ? groupTotals(scoped(byMachine), (r) => r.machine)
      : view === "Item Code"
        ? groupTotals(scoped(itemRows), (r) => r.itemcode)
        : groupTotals(
            scoped(rowsOf(rawRows, "Production_m_sku", sectionName)),
            (r) => `${r.machine}  ·  ${r.itemcode}`,
          );
  const actual = totalOf(scoped(byMachine));

  // Plan only exists for Building / Curing (SKU Plan Fulfillment), and it
  // covers the section total — so it is shown for the aggregate product only.
  const hasPlan =
    planCard?.planned != null && (product === aggregate || !aggregate);
  const tiles = [
    ["Actual", quantity(actual, unit)],
    ["Plan", hasPlan ? quantity(planCard.planned, unit) : "—"],
    ["Achievement", hasPlan ? `${fmt(planCard.value)}%` : "—"],
    [
      "Gap",
      hasPlan && planCard.shortfall != null
        ? quantity(planCard.shortfall, unit)
        : "—",
    ],
  ];

  return (
    <TechDrillCard
      title={title}
      accent={theme.custom.brand.teal}
      breadcrumb={breadcrumb}
      tiles={tiles}
      chipRows={[
        {
          label: "Product",
          options: productOptions,
          value: product,
          onChange: setProduct,
        },
        {
          label: "Unit",
          options: unitOptions.map(displayUnit),
          value: displayUnit(unit),
          onChange: (shown) =>
            setUnit(unitOptions.find((u) => displayUnit(u) === shown)),
        },
        {
          label: "View by",
          options: ["Machine", "Item Code", "Machine + Item Code"],
          value: view,
          onChange: setView,
        },
      ]}
      cols={groupedCols(view, unit)}
      rows={groupedRows(groups, unit)}
      footnote={`${product === ALL_PRODUCTS ? "All products" : product} — ${quantity(actual, unit)} in this window.${cappedNote(groups.length)}`}
      downloadFilename={`technical-production-${sectionName}`.toLowerCase()}
      isLoading={isLoading && byMachine.length === 0}
      onClose={onClose}
    />
  );
}

const SCRAP_VIEWS = [
  { label: "Reason", kpi: "Scrap_reason", key: (r) => r.remarks },
  { label: "Discipline", kpi: "Scrap_s", key: (r) => r.sub_section },
  { label: "Machine", kpi: "Scrap_m", key: (r) => r.machine },
  { label: "Item Code", kpi: "Scrap_sku", key: (r) => r.itemcode },
  {
    label: "Machine + Item Code",
    kpi: "Scrap_m_sku",
    key: (r) => `${r.machine}  ·  ${r.itemcode}`,
  },
];

function ScrapDrill({
  title,
  breadcrumb,
  sectionName,
  rawRows,
  isLoading,
  onClose,
}) {
  const theme = useTheme();
  const [view, setView] = useState(SCRAP_VIEWS[0].label);
  const active = SCRAP_VIEWS.find((v) => v.label === view) ?? SCRAP_VIEWS[0];
  const rowsFor = (kpi) => rowsOf(rawRows, kpi, sectionName);
  const groups = groupTotals(rowsFor(active.kpi), active.key);
  const bySubSection = rowsFor("Scrap_s");
  const byReason = rowsFor("Scrap_reason");
  const unit = unitOf(bySubSection) ?? unitOf(byReason);
  const total = totalOf(bySubSection.length ? bySubSection : byReason);
  const topReason = groupTotals(byReason, (r) => r.remarks)[0]?.key ?? "—";
  const topDiscipline =
    groupTotals(bySubSection, (r) => r.sub_section)[0]?.key ?? "—";

  return (
    <TechDrillCard
      title={title}
      accent={theme.custom.brand.red}
      breadcrumb={breadcrumb}
      tiles={[
        ["Total scrap", quantity(total, unit)],
        ["Top reason", topReason],
        ["Top discipline", topDiscipline],
        [
          "Machines affected",
          fmt(distinctValues(rowsFor("Scrap_m"), "machine").length),
        ],
      ]}
      chipRows={[
        {
          label: "View by",
          options: SCRAP_VIEWS.map((v) => v.label),
          value: view,
          onChange: setView,
        },
      ]}
      cols={groupedCols(view, unit)}
      rows={groupedRows(groups, unit)}
      footnote={`Grouped by ${view.toLowerCase()}, summing to ${quantity(totalOf(rowsFor(active.kpi)), unit)}. Cumulative % shows the Pareto — the rows that make up 80% of the scrap.${cappedNote(groups.length)}`}
      downloadFilename={`technical-scrap-${sectionName}`.toLowerCase()}
      isLoading={
        isLoading && bySubSection.length === 0 && byReason.length === 0
      }
      onClose={onClose}
    />
  );
}

const NCR_VIEWS = ["Records", "Reason", "Status", "Item Code"];

function NcrDrill({
  title,
  breadcrumb,
  sectionName,
  rawRows,
  isLoading,
  onClose,
}) {
  const theme = useTheme();
  // NCM_Hold_sku rows are additive across days (see NcmDrillPanel), so the
  // window's rows are summed as they are.
  const held = rowsOf(rawRows, "NCM_Hold_sku", sectionName);
  const unitOptions = [
    ...new Set(
      held.map((r) => canonicalUnit(r.unit_of_measurement)).filter(Boolean),
    ),
  ];
  const [unitPick, setUnit] = useState(null);
  const unit = unitOptions.includes(unitPick) ? unitPick : unitOptions[0];
  const rows = unit
    ? held.filter((r) => canonicalUnit(r.unit_of_measurement) === unit)
    : held;
  const [view, setView] = useState(NCR_VIEWS[0]);
  const total = totalOf(rows);
  const shownUnit = displayUnit(unit);

  const groupKey = {
    Reason: (r) => r.remarks,
    Status: (r) => r.status,
    "Item Code": (r) => r.itemcode,
  }[view];
  const groups = groupKey ? groupTotals(rows, groupKey) : [];
  const records = [...rows].sort((a, b) => b.actual_value - a.actual_value);

  return (
    <TechDrillCard
      title={title}
      accent={theme.custom.brand.red}
      breadcrumb={breadcrumb}
      tiles={[
        ["Total held", quantity(total, unit)],
        ["Items on hold", fmt(distinctValues(rows, "itemcode").length)],
        ["Top reason", groupTotals(rows, (r) => r.remarks)[0]?.key ?? "—"],
      ]}
      chipRows={[
        {
          label: "Unit",
          options: unitOptions.map(displayUnit),
          value: shownUnit,
          onChange: (shown) =>
            setUnit(unitOptions.find((u) => displayUnit(u) === shown)),
        },
        {
          label: "View by",
          options: NCR_VIEWS,
          value: view,
          onChange: setView,
        },
      ]}
      cols={
        groupKey
          ? groupedCols(view, unit)
          : [
              "Item Code",
              "Machine / Location",
              "Reason for Hold",
              "Current Status",
              shownUnit ? `Quantity Held (${shownUnit})` : "Quantity Held",
            ]
      }
      rows={
        groupKey
          ? groupedRows(groups, unit)
          : capped(records).map((r) => [
              r.itemcode ?? "—",
              r.machine ?? "—",
              r.remarks ?? "—",
              r.status ?? "—",
              fmt(toDisplayQuantity(r.actual_value, unit).value),
            ])
      }
      footnote={`Held material cannot be issued until it is dispositioned. Total of the item rows: ${quantity(total, unit)}. The card reads the section NCM Hold total, which the gold data does not keep equal to its item rows (same on the Production dashboard).${cappedNote(groupKey ? groups.length : records.length)}`}
      downloadFilename={`technical-ncr-${sectionName}`.toLowerCase()}
      isLoading={isLoading && held.length === 0}
      onClose={onClose}
    />
  );
}

const BREAKDOWN_VIEWS = [
  "Machine",
  "Breakdown Reason",
  "Discipline",
  "Timeline",
];

function BreakdownDrill({
  title,
  breadcrumb,
  sectionName,
  downtimeRows,
  downtimeGranularity,
  eventDate,
  onClose,
}) {
  const theme = useTheme();
  const [view, setView] = useState(BREAKDOWN_VIEWS[0]);
  const events = toDowntimeEvents(downtimeRows, {
    section: sectionName,
    reason: "Breakdown",
    granularity: downtimeGranularity,
    date: eventDate,
  });
  const minutes = events.reduce((sum, e) => sum + e.minutes, 0);
  const groupKey = {
    Machine: (e) => e.machine,
    "Breakdown Reason": (e) => e.detail,
    Discipline: (e) => breakdownDiscipline(e.category),
  }[view];
  const groups = groupKey
    ? groupTotals(events, groupKey, (e) => e.minutes)
    : [];

  return (
    <TechDrillCard
      title={title}
      accent={theme.custom.brand.red}
      breadcrumb={breadcrumb}
      tiles={[
        ["Breakdown duration", `${fmt(minutes)} min`],
        ["Breakdown count", fmt(events.length)],
        ["Machines affected", fmt(new Set(events.map((e) => e.machine)).size)],
        [
          "MTTR",
          events.length
            ? `${(minutes / events.length / 60).toFixed(2)} hrs`
            : "—",
        ],
      ]}
      chipRows={[
        {
          label: "View by",
          options: BREAKDOWN_VIEWS,
          value: view,
          onChange: setView,
        },
      ]}
      cols={
        groupKey
          ? [view, "Duration (min)", "Share", "Cumulative %"]
          : [
              "Date",
              "Machine",
              "Breakdown Reason",
              "Discipline",
              "Duration (min)",
            ]
      }
      rows={
        groupKey
          ? capped(groups).map((g) => [
              g.key,
              fmt(g.value),
              pct(g.share),
              pct(g.cumulative),
            ])
          : capped(events).map((e) => [
              e.date,
              e.machine,
              e.detail,
              breakdownDiscipline(e.category),
              fmt(e.minutes),
            ])
      }
      footnote={`Totals are machine-minutes across every ${sectionName} machine; the card shows the average per machine. Same reason rows as the Production dashboard's Total Downtime.${cappedNote(groupKey ? groups.length : events.length)}`}
      downloadFilename={`technical-breakdown-${sectionName}`.toLowerCase()}
      onClose={onClose}
    />
  );
}

const SETUP_VIEWS = ["Events", "Machine", "Change Type"];

function SetupDrill({
  title,
  breadcrumb,
  sectionName,
  downtimeRows,
  downtimeGranularity,
  eventDate,
  onClose,
}) {
  const theme = useTheme();
  const [view, setView] = useState(SETUP_VIEWS[0]);
  const events = toDowntimeEvents(downtimeRows, {
    section: sectionName,
    reason: "Setup & Change",
    granularity: downtimeGranularity,
    date: eventDate,
  });
  const minutes = events.reduce((sum, e) => sum + e.minutes, 0);
  const groupKey = {
    Machine: (e) => e.machine,
    "Change Type": (e) => e.detail,
  }[view];
  const groups = groupKey
    ? groupTotals(events, groupKey, (e) => e.minutes)
    : [];

  return (
    <TechDrillCard
      title={title}
      accent={theme.custom.brand.purple}
      breadcrumb={breadcrumb}
      tiles={[
        ["Batch changes", fmt(events.length)],
        ["Setup loss", `${fmt(minutes)} min`],
      ]}
      chipRows={[
        {
          label: "View by",
          options: SETUP_VIEWS,
          value: view,
          onChange: setView,
        },
      ]}
      cols={
        groupKey
          ? [view, "Setup Time (min)", "Share", "Cumulative %"]
          : ["Date", "Machine", "Change Type", "Setup Time (min)"]
      }
      rows={
        groupKey
          ? capped(groups).map((g) => [
              g.key,
              fmt(g.value),
              pct(g.share),
              pct(g.cumulative),
            ])
          : capped(events).map((e) => [
              e.date,
              e.machine,
              e.detail,
              fmt(e.minutes),
            ])
      }
      footnote={`Setup loss is machine time lost to changeovers, summed across every machine; the card shows the average per machine.${cappedNote(groupKey ? groups.length : events.length)}`}
      downloadFilename={`technical-setup-${sectionName}`.toLowerCase()}
      onClose={onClose}
    />
  );
}

export default TechnicalDrillPanel;
