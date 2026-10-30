/**
 * CTP Quality — Process tab drill panel (right side of the split layout).
 *
 * Every table here comes from the one summary payload, so opening a card or
 * a row never waits on the network. Flow per card (handoff Drill Down Map):
 *   PQR        → process rating table → failed checkpoints of the process
 *   Compliance → section compliance table (to-date counts + whole period)
 *   Critical Deviation → process MQV / CAPA table → violations of the process
 *   Non Critical Deviation → process deviation table → machine × checkpoint
 *   CPC        → process × machine × parameter table, worst first
 *   FTQ / SPR  → count strip + SKU table, worst first
 *   Open CAPA  → open NC items, overdue first
 */
import { useState } from "react";
import { FormControlLabel, Switch } from "@mui/material";
import { Breadcrumb } from "@/components/quality/shared/Breadcrumb.jsx";
import { Card } from "@/components/quality/shared/Card.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import { SelectFilter } from "@/components/quality/shared/SelectFilter.jsx";
import { StatusPill } from "@/components/quality/shared/StatusPill.jsx";
import { C } from "@/components/quality/shared/theme.js";
import { CountStrip, Empty, GroupDrill, Hint } from "./CtpDrillParts.jsx";
import { count, pct, text } from "./ctpFormat.js";

/** Gold class (logbook wording) → the page's KPI names. */
const CAPA_CLASS = {
  MQV: "Critical",
  "Audit Deviation": "Non Critical",
};

function ProcessFilter({ processes, value, onChange }) {
  return (
    <SelectFilter
      options={processes}
      value={value}
      onChange={onChange}
      allLabel="All processes"
      ariaLabel="Filter by process"
      sx={{ mb: 1 }}
    />
  );
}

function CpcDrill({ kpi, periodLabel, parameters }) {
  const [process, setProcess] = useState("All");
  const processes = [...new Set(parameters.map((p) => p.process))];
  const shown =
    process === "All"
      ? parameters
      : parameters.filter((p) => p.process === process);
  return (
    <Card title={`Critical Parameters — ${periodLabel}`} accent={C.ac}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Breadcrumb path={[kpi.n, "Process × Machine × Parameter"]} />
        <ProcessFilter
          processes={processes}
          value={process}
          onChange={setProcess}
        />
      </div>
      {shown.length === 0 ? (
        <Empty>No critical parameter checks for this period.</Empty>
      ) : (
        <DTable
          cols={["Process", "Machine", "Parameter", "Compliance"]}
          rows={shown.map((p) => [
            text(p.process),
            text(p.machine),
            text(p.parameter),
            pct(p.compliance),
          ])}
        />
      )}
      <Hint>Worst compliance first. Machines show their logbook code.</Hint>
    </Card>
  );
}

/** FTQ and SPR: inputs of the % on top, then the SKU table worst first. */
function SkuRatioDrill({ kpi, periodLabel, title, strip, skus, field }) {
  return (
    <Card title={`${title} — ${periodLabel}`} accent={C.tl}>
      <Breadcrumb path={[kpi.n, "By SKU"]} />
      <CountStrip items={strip} />
      {skus.length === 0 ? (
        <Empty>No cured tyres for this period.</Empty>
      ) : (
        <DTable
          cols={["SKU", kpi.kpiName]}
          rows={skus.map((s) => [s.sku, pct(s[field])])}
          searchable
          searchPlaceholder="Search SKU"
        />
      )}
      <Hint>Lowest {kpi.kpiName} first.</Hint>
    </Card>
  );
}

function CapaDrill({ kpi, periodLabel, items }) {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [process, setProcess] = useState("All");
  const processes = [...new Set(items.map((i) => i.process))].filter(Boolean);
  const shown = items.filter(
    (i) =>
      (!overdueOnly || i.overdue) &&
      (process === "All" || i.process === process),
  );
  const overdue = items.filter((i) => i.overdue).length;
  return (
    <Card title={`Open CAPA / NC Items — ${periodLabel}`} accent={C.rd}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Breadcrumb path={[kpi.n, "Open items"]} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
              />
            }
            label="Overdue only"
            sx={{ mb: 1, "& .MuiFormControlLabel-label": { fontSize: 13 } }}
          />
          <ProcessFilter
            processes={processes}
            value={process}
            onChange={setProcess}
          />
        </div>
      </div>
      <CountStrip
        items={[
          { label: "Open", value: items.length },
          { label: "Overdue (> 7 days)", value: overdue, color: C.rd },
        ]}
      />
      {shown.length === 0 ? (
        <Empty>
          {items.length === 0
            ? "No open CAPA / NC items for this period."
            : "No items match the filters."}
        </Empty>
      ) : (
        <DTable
          cols={[
            "NC #",
            "Process",
            "Violation",
            "Class",
            "Age (days)",
            "Status",
          ]}
          rows={shown.map((i) => [
            text(i.nc),
            text(i.process),
            text(i.violation),
            CAPA_CLASS[i.cls] ?? text(i.cls),
            count(i.ageDays),
            <StatusPill key={i.nc} status={i.overdue ? "Overdue" : "Open"} />,
          ])}
        />
      )}
      <Hint>
        Overdue first, then oldest. Overdue = open for more than 7 days.
      </Hint>
    </Card>
  );
}

export default function CtpProcessDrillPanel({
  kpi,
  drills,
  periodLabel,
  tyre,
}) {
  if (!kpi || !drills) return null;
  // `key` resets the selected row when the card, tyre or period changes.
  const key = `${kpi.id}|${tyre}|${periodLabel}`;

  if (kpi.drill === "pqr") {
    return (
      <GroupDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="Process-wise Audit Rating"
        accent={C.ac}
        cols={["Process", "Rating", "Violations"]}
        rows={drills.pqr.processes}
        toCells={(r) => [r.process, pct(r.rating), count(r.violations)]}
        detailTitle="Failed Checkpoints"
        detailCols={["Machine", "Checkpoint", "Severity", "Count"]}
        detailRows={drills.pqr.failedCheckpoints}
        toDetailCells={(d) => [
          text(d.machine),
          text(d.checkpoint),
          text(d.severity),
          count(d.count),
        ]}
        emptyDetail="No failed checkpoints for this process. Rating is satisfactory."
      />
    );
  }

  if (kpi.drill === "audit") {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <GroupDrill
          key={key}
          kpi={kpi}
          periodLabel={periodLabel}
          title="Section-wise Audit Compliance"
          accent={C.bl}
          cols={[
            "Section",
            "Compliance",
            "Scheduled to date",
            "Completed to date",
            "Pending to date",
            "Scheduled (period)",
          ]}
          rows={drills.audit.processes}
          toCells={(r) => [
            r.process,
            pct(r.compliance),
            count(r.scheduledToDate),
            count(r.completedToDate),
            count(r.pendingToDate),
            count(r.scheduled),
          ]}
        />
        <Hint>
          Compliance = completed ÷ scheduled up to today. “Scheduled (period)”
          is the full plan for the period.
        </Hint>
      </div>
    );
  }

  if (kpi.drill === "mqv") {
    return (
      <GroupDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="Process-wise Critical Deviation"
        accent={C.rd}
        cols={[
          "Process",
          "Critical Deviations",
          "Top Violation",
          "CAPA Open",
          "CAPA Closed",
        ]}
        rows={drills.mqv.processes}
        toCells={(r) => [
          r.process,
          count(r.mqv),
          text(r.topViolation),
          count(r.capaOpen),
          count(r.capaClosed),
        ]}
        detailTitle="Critical Deviation Violations"
        detailCols={["Machine", "Machine Name", "Checkpoint", "CAPA", "Count"]}
        detailRows={drills.mqv.violations}
        toDetailCells={(d) => [
          text(d.machine),
          text(d.machineName),
          text(d.checkpoint),
          text(d.capa),
          count(d.count),
        ]}
        emptyDetail="No checkpoint-level critical deviation detail for this process."
      />
    );
  }

  if (kpi.drill === "ndev") {
    return (
      <GroupDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="Process-wise Non Critical Deviation"
        accent={C.am}
        cols={["Process", "Non Critical Deviations", "Open", "Closed"]}
        rows={drills.ndev.processes}
        toCells={(r) => [
          r.process,
          count(r.deviations),
          count(r.open),
          count(r.closed),
        ]}
        detailTitle="Non Critical Deviation Parameters"
        detailCols={[
          "Machine",
          "Machine Name",
          "Checkpoint",
          "Status",
          "Count",
        ]}
        detailRows={drills.ndev.details}
        toDetailCells={(d) => [
          text(d.machine),
          text(d.machineName),
          text(d.checkpoint),
          text(d.status),
          count(d.count),
        ]}
        emptyDetail="No non critical deviations for this process."
      />
    );
  }

  if (kpi.drill === "cpc") {
    return (
      <CpcDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        parameters={drills.cpc.parameters}
      />
    );
  }

  if (kpi.drill === "ftq") {
    const { inspected, rejected, skus } = drills.ftq;
    return (
      <SkuRatioDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="FTQ by SKU (Curing)"
        strip={[
          { label: "Inspected", value: inspected },
          { label: "Rejected", value: rejected, color: C.rd },
        ]}
        skus={skus}
        field="ftq"
      />
    );
  }

  if (kpi.drill === "spr") {
    const { production, scrap, rework, skus } = drills.spr;
    return (
      <SkuRatioDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="SPR by SKU (Curing)"
        strip={[
          { label: "Cured production", value: production },
          { label: "Scrap", value: scrap, color: C.rd },
          { label: "Rework", value: rework, color: C.am },
        ]}
        skus={skus}
        field="spr"
      />
    );
  }

  if (kpi.drill === "capa") {
    return (
      <CapaDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        items={drills.capa.items}
      />
    );
  }

  return null;
}
