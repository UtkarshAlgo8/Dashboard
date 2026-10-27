/**
 * CTP Quality — Process tab drill panel (right side of the split layout).
 *
 * Every table here comes from the one summary payload, so opening a card or
 * a process row never waits on the network. Flow per card (KPI List sheet):
 *   PQR        → process rating table → failed checkpoints of the process
 *   Compliance → process compliance table
 *   MQV        → process MQV / CAPA table → violations of the process
 *   Deviation  → process deviation table → machine × checkpoint list
 *   CPC        → process × machine × parameter table, worst first
 */
import { useState } from "react";
import { MenuItem, Select } from "@mui/material";
import { Breadcrumb } from "@/components/quality/shared/Breadcrumb.jsx";
import { Card } from "@/components/quality/shared/Card.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import { C } from "@/components/quality/shared/theme.js";

const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(2)}%`);
const count = (v) => (v == null ? "—" : Number(v).toLocaleString("en-IN"));
const text = (v) => v ?? "—";

function Hint({ children }) {
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: C.mu }}>
      {"▸"} {children}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div
      style={{ padding: 12, textAlign: "center", color: C.mu, fontSize: 14 }}
    >
      {children}
    </div>
  );
}

/** Process table that opens a detail table for the clicked process. */
function ProcessDrill({
  kpi,
  periodLabel,
  title,
  accent,
  cols,
  rows,
  toCells,
  detailTitle,
  detailCols,
  detailRows,
  toDetailCells,
  emptyDetail,
}) {
  const [selected, setSelected] = useState("");
  const detail = selected
    ? (detailRows ?? []).filter((d) => d.process === selected)
    : [];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Card title={`${title} — ${periodLabel}`} accent={accent}>
        <Breadcrumb
          path={selected ? [kpi.n, title, selected] : [kpi.n, title]}
          onNav={(i) => i < 2 && setSelected("")}
        />
        {rows.length === 0 ? (
          <Empty>No audits for this period.</Empty>
        ) : (
          <DTable
            cols={cols}
            rows={rows.map(toCells)}
            onRowClick={
              detailRows
                ? (cells) => setSelected(selected === cells[0] ? "" : cells[0])
                : undefined
            }
          />
        )}
        {detailRows && rows.length > 0 && (
          <Hint>
            Click a process row to see its {detailTitle.toLowerCase()}
          </Hint>
        )}
      </Card>
      {selected && (
        <Card title={`${detailTitle} — ${selected}`} accent={C.rd}>
          {detail.length === 0 ? (
            <Empty>{emptyDetail}</Empty>
          ) : (
            <DTable cols={detailCols} rows={detail.map(toDetailCells)} />
          )}
        </Card>
      )}
    </div>
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
        <Select
          size="small"
          value={process}
          onChange={(e) => setProcess(e.target.value)}
          sx={{ fontSize: 13, minWidth: 180, mb: 1 }}
        >
          <MenuItem value="All">All processes</MenuItem>
          {processes.map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </Select>
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

export default function CtpProcessDrillPanel({
  kpi,
  drills,
  periodLabel,
  tyre,
}) {
  if (!kpi || !drills) return null;
  // `key` resets the selected process when the card, tyre or period changes.
  const key = `${kpi.id}|${tyre}|${periodLabel}`;

  if (kpi.drill === "pqr") {
    return (
      <ProcessDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="Process-wise Audit Rating"
        accent={C.ac}
        cols={["Process", "Rating", "Violations", "Scheduled", "Completed"]}
        rows={drills.pqr.processes}
        toCells={(r) => [
          r.process,
          pct(r.rating),
          count(r.violations),
          count(r.scheduled),
          count(r.completed),
        ]}
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
      <ProcessDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="Process-wise Audit Compliance"
        accent={C.bl}
        cols={["Process", "Scheduled", "Completed", "Pending", "Compliance"]}
        rows={drills.audit.processes}
        toCells={(r) => [
          r.process,
          count(r.scheduled),
          count(r.completed),
          count(r.pending),
          pct(r.compliance),
        ]}
      />
    );
  }

  if (kpi.drill === "mqv") {
    return (
      <ProcessDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="Process-wise MQV"
        accent={C.rd}
        cols={["Process", "MQV", "Top Violation", "CAPA Open", "CAPA Closed"]}
        rows={drills.mqv.processes}
        toCells={(r) => [
          r.process,
          count(r.mqv),
          text(r.topViolation),
          count(r.capaOpen),
          count(r.capaClosed),
        ]}
        detailTitle="MQV Violations"
        detailCols={["Machine", "Checkpoint", "CAPA", "Count"]}
        detailRows={drills.mqv.violations}
        toDetailCells={(d) => [
          text(d.machine),
          text(d.checkpoint),
          text(d.capa),
          count(d.count),
        ]}
        emptyDetail="No checkpoint-level MQV detail for this process."
      />
    );
  }

  if (kpi.drill === "ndev") {
    return (
      <ProcessDrill
        key={key}
        kpi={kpi}
        periodLabel={periodLabel}
        title="Process-wise Audit Deviation"
        accent={C.am}
        cols={["Process", "Deviations", "Open", "Closed"]}
        rows={drills.ndev.processes}
        toCells={(r) => [
          r.process,
          count(r.deviations),
          count(r.open),
          count(r.closed),
        ]}
        detailTitle="Deviation Parameters"
        detailCols={["Machine", "Checkpoint", "Status", "Count"]}
        detailRows={drills.ndev.details}
        toDetailCells={(d) => [
          text(d.machine),
          text(d.checkpoint),
          text(d.status),
          count(d.count),
        ]}
        emptyDetail="No deviations for this process."
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

  return null;
}
