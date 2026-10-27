/**
 * Row → response transformer for the CTP Quality Process tab.
 *
 * Values are echoed as stored in gold; nothing is re-aggregated except sums
 * of counts (violations, deviations), which are additive. A missing count
 * row for a process means zero events; a missing % row means "not measured"
 * and stays null.
 */
import { CARD_KPIS, PROCESS_ORDER } from "./registry.js";

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const blank = (v) => (v == null || v === "" ? null : String(v));

function processRank(name) {
  const i = PROCESS_ORDER.indexOf(name);
  return i === -1 ? PROCESS_ORDER.length : i;
}

const byProcess = (a, b) =>
  processRank(a.process) - processRank(b.process) ||
  String(a.process).localeCompare(String(b.process));

/** kpi_name → rows, for the selected period only. */
function groupAtAnchor(rows, anchor) {
  const out = new Map();
  for (const r of rows) {
    if (r.date !== anchor) continue;
    if (!out.has(r.kpi_name)) out.set(r.kpi_name, []);
    out.get(r.kpi_name).push(r);
  }
  return out;
}

/** section → value for one per-process KPI. */
function perSection(groups, kpiName) {
  const m = new Map();
  for (const r of groups.get(kpiName) ?? []) {
    if (r.section) m.set(r.section, num(r.actual_value));
  }
  return m;
}

function processTable(groups, columns, counts) {
  const maps = Object.fromEntries(
    Object.entries(columns).map(([key, kpi]) => [key, perSection(groups, kpi)]),
  );
  const names = new Set(Object.values(maps).flatMap((m) => [...m.keys()]));
  return [...names]
    .map((process) => {
      const row = { process };
      for (const key of Object.keys(columns)) {
        const v = maps[key].get(process);
        row[key] = v ?? (counts.includes(key) ? 0 : null);
      }
      return row;
    })
    .sort(byProcess);
}

function detailRows(groups, kpiName, subKey) {
  return (groups.get(kpiName) ?? [])
    .map((r) => ({
      process: blank(r.section),
      machine: blank(r.machine),
      checkpoint: blank(r.remarks),
      [subKey]: blank(r.sub_section),
      count: num(r.actual_value) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || byProcess(a, b));
}

function cardsFrom(rows, anchor) {
  return Object.entries(CARD_KPIS).map(([id, kpiName]) => {
    const points = rows
      .filter((r) => r.kpi_name === kpiName)
      .map((r) => ({ date: r.date, value: num(r.actual_value) }))
      .filter((p) => p.value != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    const current = points.find((p) => p.date === anchor);
    const before = points.filter((p) => p.date < anchor);
    return {
      id,
      kpiName,
      value: current ? current.value : null,
      previous: before.length ? before[before.length - 1].value : null,
      spark: points,
    };
  });
}

/**
 * @param {Array<Record<string, string>>} rows Rows from processSummaryQuery.
 * @param {{ anchor: string }} period
 */
export function toProcessSummary(rows, { anchor }) {
  const groups = groupAtAnchor(rows, anchor);

  const mqvViolations = detailRows(groups, "MQV_Violation", "capa");
  const topViolation = new Map();
  for (const v of mqvViolations) {
    const key = `${v.process}\u0000${v.checkpoint}`;
    topViolation.set(key, (topViolation.get(key) ?? 0) + v.count);
  }
  const topByProcess = new Map();
  for (const [key, count] of topViolation) {
    const [process, checkpoint] = key.split("\u0000");
    const best = topByProcess.get(process);
    if (!best || count > best.count) {
      topByProcess.set(process, { checkpoint, count });
    }
  }

  const deviations = detailRows(groups, "Audit_Deviation_Parameter", "status");
  const devByProcess = new Map();
  for (const d of deviations) {
    const row = devByProcess.get(d.process) ?? {
      process: d.process,
      deviations: 0,
      open: 0,
      closed: 0,
    };
    row.deviations += d.count;
    if (d.status === "Open") row.open += d.count;
    if (d.status === "Closed") row.closed += d.count;
    devByProcess.set(d.process, row);
  }

  return {
    cards: cardsFrom(rows, anchor),
    drills: {
      pqr: {
        processes: processTable(
          groups,
          {
            rating: "PQR_Process",
            violations: "Audit_Violations_Process",
            scheduled: "Audit_Scheduled_Process",
            completed: "Audit_Completed_Process",
          },
          ["violations", "scheduled", "completed"],
        ),
        failedCheckpoints: detailRows(
          groups,
          "PQR_Failed_Checkpoint",
          "severity",
        ),
      },
      audit: {
        processes: processTable(
          groups,
          {
            compliance: "Audit_Compliance_Process",
            scheduled: "Audit_Scheduled_Process",
            completed: "Audit_Completed_Process",
            pending: "Audit_Pending_Process",
          },
          ["scheduled", "completed", "pending"],
        ),
      },
      mqv: {
        processes: processTable(
          groups,
          {
            mqv: "MQV_Process",
            capaOpen: "MQV_CAPA_Open_Process",
            capaClosed: "MQV_CAPA_Closed_Process",
          },
          ["mqv", "capaOpen", "capaClosed"],
        ).map((row) => ({
          ...row,
          topViolation: topByProcess.get(row.process)?.checkpoint ?? null,
        })),
        violations: mqvViolations,
      },
      ndev: {
        processes: [...devByProcess.values()].sort(byProcess),
        details: deviations,
      },
      cpc: {
        parameters: (groups.get("CPC_Parameter") ?? [])
          .map((r) => ({
            process: blank(r.section),
            machine: blank(r.machine),
            parameter: blank(r.remarks),
            compliance: num(r.actual_value),
          }))
          .sort(
            (a, b) =>
              (a.compliance ?? Infinity) - (b.compliance ?? Infinity) ||
              byProcess(a, b),
          ),
      },
    },
  };
}

/** Trend rows → `{ points: [{ date, value }] }` for the trend pop-up. */
export function toProcessTrend(rows) {
  return {
    points: rows
      .map((r) => ({ date: r.date, value: num(r.actual_value) }))
      .filter((p) => p.value != null),
  };
}
