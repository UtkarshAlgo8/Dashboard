/**
 * CTP Quality — Product tab drill panel (right side of the split layout).
 *
 * Every table comes from the one Product summary payload. Cards with more
 * than one first-level table show a "View by" toggle; SKU tables are searchable
 * and sorted worst first. Flow per card (handoff Drill Down Map):
 *   Uniformity → by machine | by SKU
 *   1st Line VI / Dispatch → by SKU
 *   2nd Line   → size-wise | defect-wise
 *   E-Grade / DBM → machine → sizes of the machine
 *   Scrap %    → by SKU → defect Pareto of the SKU | plant-wide Pareto
 *   GT Weight  → by machine | by size (±1 / ±2 / ±3 % side by side)
 *   OE Yield   → by SKU | by OEM
 *   Bay Area   → by line | rejection reasons
 */
import { useState } from "react";
import { Breadcrumb } from "@/components/quality/shared/Breadcrumb.jsx";
import { Card } from "@/components/quality/shared/Card.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import { C } from "@/components/quality/shared/theme.js";
import { ViewToggle } from "@/components/quality/shared/ViewToggle.jsx";
import { Empty, GroupDrill, Hint } from "./CtpDrillParts.jsx";
import { count, pct, text } from "./ctpFormat.js";

const NO_DATA = "No data for this period.";

/** One card with "View by" pills; each view renders its own table. */
function ViewsDrill({ kpi, periodLabel, accent, views }) {
  const [view, setView] = useState(views[0].id);
  const current = views.find((v) => v.id === view) ?? views[0];
  return (
    <Card title={`${current.title} — ${periodLabel}`} accent={accent}>
      <Breadcrumb path={[kpi.n, current.label]} />
      {views.length > 1 && (
        <ViewToggle
          options={views.map((v) => ({ value: v.id, label: v.label }))}
          value={current.id}
          onChange={setView}
          sx={{ mb: 1.25 }}
        />
      )}
      {current.rows.length === 0 ? (
        <Empty>{NO_DATA}</Empty>
      ) : (
        <DTable
          key={current.id}
          cols={current.cols}
          rows={current.rows}
          searchable={Boolean(current.search)}
          searchPlaceholder={current.search}
        />
      )}
      {current.hint && <Hint>{current.hint}</Hint>}
    </Card>
  );
}

/** Scrap %: SKU table (click → that SKU's Pareto) or the plant-wide Pareto. */
function ScrapDrill({ kpi, periodLabel, skus, defects }) {
  const [view, setView] = useState("sku");
  const pareto = new Map();
  for (const d of defects) {
    const key = `${d.defectArea ?? ""}|${d.defect ?? ""}`;
    const row = pareto.get(key) ?? {
      defectArea: d.defectArea,
      defect: d.defect,
      count: 0,
    };
    row.count += d.count;
    pareto.set(key, row);
  }
  const plantPareto = [...pareto.values()].sort((a, b) => b.count - a.count);
  const pills = (
    <ViewToggle
      options={[
        { value: "sku", label: "By SKU" },
        { value: "pareto", label: "Defect Pareto (all)" },
      ]}
      value={view}
      onChange={setView}
      sx={{ mb: 1.25 }}
    />
  );
  if (view === "pareto") {
    return (
      <Card title={`Scrap Defect Pareto — ${periodLabel}`} accent={C.rd}>
        <Breadcrumb path={[kpi.n, "Defect Pareto"]} />
        {pills}
        {plantPareto.length === 0 ? (
          <Empty>{NO_DATA}</Empty>
        ) : (
          <DTable
            cols={["Defect Area", "Defect", "Scrap Tyres"]}
            rows={plantPareto.map((d) => [
              text(d.defectArea),
              text(d.defect),
              count(d.count),
            ])}
            searchable
            searchPlaceholder="Search defect"
          />
        )}
      </Card>
    );
  }
  return (
    <GroupDrill
      kpi={kpi}
      periodLabel={periodLabel}
      title="Scrap % by SKU"
      accent={C.rd}
      cols={["SKU", "Scrap %"]}
      rows={skus}
      toCells={(s) => [s.sku, pct(s.scrapPct)]}
      detailTitle="Defect Pareto"
      detailCols={["Defect Area", "Defect", "Curing Press", "Scrap Tyres"]}
      detailRows={defects}
      detailKey="sku"
      toDetailCells={(d) => [
        text(d.defectArea),
        text(d.defect),
        text(d.press),
        count(d.count),
      ]}
      emptyDetail="No defect detail for this SKU."
      groupLabel="SKU"
      emptyRows={NO_DATA}
      searchable
      toolbar={pills}
    />
  );
}

export default function CtpProductDrillPanel({
  kpi,
  drills,
  periodLabel,
  tyre,
}) {
  if (!kpi || !drills) return null;
  // `key` resets the view and selected row when the card, tyre or period
  // changes.
  const key = `${kpi.id}|${tyre}|${periodLabel}`;
  const common = { kpi, periodLabel };

  switch (kpi.drill) {
    case "uy":
      return (
        <ViewsDrill
          key={key}
          {...common}
          accent={C.bl}
          views={[
            {
              id: "machine",
              label: "Machine",
              title: "Uniformity Yield by Machine",
              cols: ["Machine", "Yield", "Tested", "Passed"],
              rows: drills.uy.machines.map((m) => [
                m.machine,
                pct(m.yield),
                count(m.tested),
                count(m.passed),
              ]),
              hint: "Lowest yield first. Pass = grade A or B.",
            },
            {
              id: "sku",
              label: "SKU",
              title: "Uniformity Yield by SKU",
              cols: ["SKU", "Yield"],
              rows: drills.uy.skus.map((s) => [s.sku, pct(s.yield)]),
              search: "Search SKU",
              hint: "Lowest yield first.",
            },
          ]}
        />
      );

    case "fvi":
    case "dy":
      return (
        <ViewsDrill
          key={key}
          {...common}
          accent={C.bl}
          views={[
            {
              id: "sku",
              label: "SKU",
              title: `${kpi.n} by SKU`,
              cols: ["SKU", "Yield"],
              rows: drills[kpi.drill].skus.map((s) => [s.sku, pct(s.yield)]),
              search: "Search SKU",
              hint: "Lowest yield first.",
            },
          ]}
        />
      );

    case "sl":
      return (
        <ViewsDrill
          key={key}
          {...common}
          accent={C.bl}
          views={[
            {
              id: "size",
              label: "Size",
              title: "2nd Line Yield by Size",
              cols: ["Tyre Size / SKU", "Yield", "Inspected"],
              rows: drills.sl.skus.map((s) => [
                s.sku,
                pct(s.yield),
                count(s.inspected),
              ]),
              search: "Search size",
              hint: "Lowest yield first.",
            },
            {
              id: "defect",
              label: "Defect",
              title: "2nd Line Defects",
              cols: ["Category", "SKU", "Defect", "Tyres"],
              rows: drills.sl.defects.map((d) => [
                text(d.category),
                text(d.sku),
                text(d.defect),
                count(d.count),
              ]),
              search: "Search defect or SKU",
              hint: "Most tyres first.",
            },
          ]}
        />
      );

    case "eg":
      return (
        <GroupDrill
          key={key}
          {...common}
          title="E-Grade Tyres by Machine"
          accent={C.rd}
          cols={["Machine", "E-Grade Tyres", "Sizes"]}
          rows={drills.eg.machines}
          toCells={(m) => [m.machine, count(m.count), count(m.sizes)]}
          detailTitle="Sizes"
          detailCols={["Size / SKU", "E-Grade Tyres"]}
          detailRows={drills.eg.cells}
          detailKey="machine"
          toDetailCells={(c) => [text(c.sku), count(c.count)]}
          emptyDetail="No E-grade tyres on this machine."
          groupLabel="machine"
          emptyRows={NO_DATA}
        />
      );

    case "dbm":
      return (
        <GroupDrill
          key={key}
          {...common}
          title="DBM Yield by Machine"
          accent={C.bl}
          cols={["Machine", "Sizes", "Lowest Size Yield"]}
          rows={drills.dbm.machines}
          toCells={(m) => [m.machine, count(m.sizes), pct(m.lowest)]}
          detailTitle="Sizes"
          detailCols={["Size / SKU", "Yield"]}
          detailRows={drills.dbm.cells}
          detailKey="machine"
          toDetailCells={(c) => [text(c.sku), pct(c.yield)]}
          emptyDetail="No sizes balanced on this machine."
          groupLabel="machine"
          emptyRows={NO_DATA}
        />
      );

    case "sc":
      return (
        <ScrapDrill
          key={key}
          {...common}
          skus={drills.sc.skus}
          defects={drills.sc.defects}
        />
      );

    case "gtw":
      return (
        <ViewsDrill
          key={key}
          {...common}
          accent={C.tl}
          views={[
            {
              id: "machine",
              label: "Machine",
              title: "GT Weight Variation by Machine",
              cols: ["TBM / Weighing Machine", "Within ±1%", "±2%", "±3%"],
              rows: drills.gtw.machines.map((m) => [
                m.machine,
                pct(m.within1),
                pct(m.within2),
                pct(m.within3),
              ]),
              hint: "Lowest ±1% share first.",
            },
            {
              id: "size",
              label: "Size",
              title: "GT Weight Variation by Size",
              cols: ["Size / SKU", "Weighed", "Within ±1%", "±2%", "±3%"],
              rows: drills.gtw.skus.map((s) => [
                s.sku,
                count(s.weighed),
                pct(s.within1),
                pct(s.within2),
                pct(s.within3),
              ]),
              search: "Search size",
              hint: "Lowest ±1% share first.",
            },
          ]}
        />
      );

    case "oe":
      return (
        <ViewsDrill
          key={key}
          {...common}
          accent={C.bl}
          views={[
            {
              id: "sku",
              label: "SKU",
              title: "OE Yield by SKU",
              cols: ["SKU", "OEM", "Yield", "Graded", "Passed"],
              rows: drills.oe.skus.map((s) => [
                s.sku,
                text(s.oem),
                pct(s.yield),
                count(s.graded),
                count(s.passed),
              ]),
              search: "Search SKU or OEM",
              hint: "Lowest yield first.",
            },
            {
              id: "oem",
              label: "OEM",
              title: "OE Yield by OEM",
              cols: ["OEM", "Yield"],
              rows: drills.oe.oems.map((o) => [o.oem, pct(o.yield)]),
            },
          ]}
        />
      );

    case "bay":
      return (
        <ViewsDrill
          key={key}
          {...common}
          accent={C.bl}
          views={[
            {
              id: "line",
              label: "Line",
              title: "Bay Area Inspection by Line",
              cols: ["Line / Station", "Checked", "Rejections", "Dispatched"],
              rows: drills.bay.lines.map((l) => [
                l.line,
                count(l.checked),
                count(l.rejections),
                count(l.dispatched),
              ]),
            },
            {
              id: "reason",
              label: "Rejection Reason",
              title: "Bay Area Rejection Reasons",
              cols: ["Category", "Line / Station", "Reason", "Tyres"],
              rows: drills.bay.reasons.map((r) => [
                text(r.category),
                text(r.line),
                text(r.reason),
                count(r.count),
              ]),
              hint: "Most tyres first.",
            },
          ]}
        />
      );

    default:
      return null;
  }
}
