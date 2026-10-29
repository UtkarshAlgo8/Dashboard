/* eslint-disable */
/**
 * Engineering Reliability drill panels that don't fit the generic recursive
 * `ReliabilityDrillPanel` shape (spec 16/17):
 *
 *   - LossTreePie: the Overview Loss Tree's L1 pie (Highcharts), click a
 *     slice to open the generic drill panel scoped to that category.
 *   - ZeroBreakdownPanel: section tiles + a per-machine table. Two DAY-grain
 *     KPIs with their own latest dates (resolved via /latest-date), not a
 *     recursive drill.
 *   - TopMachineBreakdownsPanel: flat ranked table, no further drill.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Highcharts from "highcharts";
import HighchartsReactImport from "highcharts-react-official";
import {
  getReliabilityKpiChildren,
  getReliabilityZeroBreakdownCount,
} from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import {
  topMachineBreakdownRequest,
  topMachineBreakdownRows,
} from "./topMachineBreakdowns.js";
import { MACHINE_NAME_COLUMN } from "./machineName.js";
import {
  C,
  DTable,
  GradeChip,
  fmtMinHrs,
  fmtNum,
} from "./reliabilityShared.jsx";

const HighchartsReact = HighchartsReactImport?.default ?? HighchartsReactImport;

const PIE_COLORS = [C.rd, C.bl, C.pp, C.gn, C.am, C.ac, C.mu];

/** Small outline info-dot, top-right of the Loss Tree header (visual reference only). */
function InfoDot() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={C.mu}
      strokeWidth="1.6"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" strokeLinecap="round" />
      <circle cx="12" cy="7.7" r="0.9" fill={C.mu} stroke="none" />
    </svg>
  );
}

/**
 * Loss Tree L1 pie. `rows` is the loss-tree endpoint's response rows
 * (already summed server-side, one row per product_type category).
 * Renders its own header (title/subtitle/info-dot) plus a pie-and-legend
 * layout so the card matches the design reference exactly.
 */
export function LossTreePie({ rows, loading, error, onSlice }) {
  const data = useMemo(
    () =>
      (rows || []).map((r, i) => ({
        name: r.product_type,
        y: r.LostTime_LossCategory ?? 0,
        color: PIE_COLORS[i % PIE_COLORS.length],
      })),
    [rows],
  );
  const total = useMemo(
    () => data.reduce((sum, d) => sum + (d.y || 0), 0),
    [data],
  );
  const pieRef = useRef(null);
  const exportRows = data.map((d) => ({
    Category: d.name,
    "Lost Time (min)": d.y,
    "Share (%)": total ? Number(((d.y / total) * 100).toFixed(1)) : null,
  }));

  const options = useMemo(
    () => ({
      chart: { type: "pie", height: 260, backgroundColor: "transparent" },
      title: { text: null },
      credits: { enabled: false },
      accessibility: { enabled: false },
      tooltip: {
        pointFormat: "<b>{point.y:,.0f} min</b> ({point.percentage:.1f}%)",
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: "pointer",
          borderWidth: 0,
          dataLabels: {
            enabled: true,
            format: "{point.percentage:.1f}%",
            distance: -32,
            style: {
              fontSize: "12px",
              fontWeight: "700",
              color: "#fff",
              textOutline: "none",
            },
          },
          point: {
            events: {
              click: function () {
                onSlice && onSlice(this.name);
              },
            },
          },
        },
      },
      series: [{ name: "Lost time", data }],
    }),
    [data],
  );

  let body;
  if (error) {
    body = (
      <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
        Loss Tree fetch failed: {error.message}
      </div>
    );
  } else if (loading) {
    body = <JKLoader message="Loading loss tree" />;
  } else if (!rows || rows.length === 0) {
    body = (
      <div
        style={{ padding: 30, textAlign: "center", color: C.mu, fontSize: 13 }}
      >
        No loss data for this period.
      </div>
    );
  } else {
    body = (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "0 0 260px", width: 260 }}>
          <HighchartsReact highcharts={Highcharts} options={options} />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 260 }}>
          {data.map((d, i) => (
            <div
              key={d.name}
              onClick={() => onSlice && onSlice(d.name)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 2px",
                borderBottom:
                  i < data.length - 1 ? "1px solid " + C.bd : "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: d.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13.5, color: C.tx, fontWeight: 500 }}>
                  {d.name}
                </span>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                  {fmtNum(total ? (d.y / total) * 100 : 0, 1)}%
                </div>
                <div style={{ fontSize: 12, color: C.mu }}>
                  {fmtNum(d.y)} min
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={pieRef}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            color: C.tx,
            textTransform: "uppercase",
            letterSpacing: ".4px",
          }}
        >
          Overall Breakdown — Lost Time by Category
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CardDownloadButton
            cardRef={pieRef}
            headers={["Category", "Lost Time (min)", "Share (%)"]}
            rows={exportRows}
            filename="engineering-loss-tree"
            sx={{ width: 26, height: 26, borderRadius: 1 }}
          />
          <InfoDot />
        </div>
      </div>
      {!loading && !error && rows && rows.length > 0 && (
        <div
          style={{
            fontSize: 12.5,
            color: C.mu,
            lineHeight: 1.5,
            marginTop: 4,
            marginBottom: 16,
            maxWidth: 640,
          }}
        >
          Total lost time {fmtNum(total)} min. One taxonomy shared with
          Production, so Engineering downtime and Production availability loss
          reconcile. Click a slice to drill into it.
        </div>
      )}
      {(loading || error || !rows || rows.length === 0) && (
        <div style={{ marginTop: 8 }} />
      )}
      {body}
    </div>
  );
}

// A machine counts as "zero breakdown" once it has run MORE than this many
// days since its last breakdown (DaysWithoutBreakdown_m, strictly greater).
const ZERO_BREAKDOWN_MIN_DAYS = 30;

/**
 * Count + as-of date for Zero Breakdown. The backend anchors on the last
 * COMPLETE day: the ETL publishes the running day incrementally (2026-10-14
 * held 5 of ~216 machine rows), so the newest date would count almost nothing.
 */
function getZeroBreakdownCount() {
  return getReliabilityZeroBreakdownCount();
}

/** One row per machine with its days-without-breakdown, as of `date`. */
function getDaysWithoutBreakdownRows(date) {
  return getReliabilityKpiChildren({
    kpiNames: ["DaysWithoutBreakdown_m"],
    date,
    granularity: "DAY",
    groupBy: "machine",
    sort: "DaysWithoutBreakdown_m",
    order: "desc",
  }).then((res) => (Array.isArray(res?.rows) ? res.rows : []));
}

/** Distinct machines whose days-without-breakdown exceeds the threshold. */
function zeroBreakdownMachines(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    if (!(Number(r.DaysWithoutBreakdown_m) > ZERO_BREAKDOWN_MIN_DAYS)) {
      return false;
    }
    if (seen.has(r.machine)) return false;
    seen.add(r.machine);
    return true;
  });
}

/**
 * Zero Breakdown Machines — machines with DaysWithoutBreakdown_m > 30, as of
 * the last complete DAY. The section tiles are counted from those same
 * machine rows, so tiles, table and card headline always agree.
 * "Last breakdown date" = the as-of date minus the day count.
 *
 * Deliberately NOT wired to the page's selected period, unlike every other
 * card here: DaysWithoutBreakdown_m is a running counter ("days since this
 * machine last broke"), so it answers "as of when?", not "during which
 * month?", and the last-breakdown date is only derivable by subtracting a day
 * count from a DAY-grain as-of date.
 */
export function ZeroBreakdownPanel() {
  const [asOf, setAsOf] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getZeroBreakdownCount()
      .then((res) => {
        const date = res?.date ?? null;
        if (cancelled) return;
        setAsOf(date);
        if (!date) {
          setLoading(false);
          return;
        }
        return getDaysWithoutBreakdownRows(date).then((rows) => {
          if (cancelled) return;
          setAllRows(zeroBreakdownMachines(rows));
          setLoading(false);
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sectionRows = [];
  for (const r of allRows) {
    const found = sectionRows.find((x) => x.section === r.section);
    if (found) found.count += 1;
    else sectionRows.push({ section: r.section, count: 1 });
  }
  sectionRows.sort((a, b) => b.count - a.count);

  const machineRows = selectedSection
    ? allRows.filter((r) => r.section === selectedSection)
    : allRows;
  const total = allRows.length;

  const lastBreakdownDate = (days) => {
    if (days == null || !asOf) return "—";
    const d = new Date(asOf + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - Number(days));
    return d.toISOString().slice(0, 10);
  };

  const columns = [
    { key: "machine", label: "Machine" },
    MACHINE_NAME_COLUMN,
    { key: "section", label: "Section" },
    {
      key: "status",
      label: "Category",
      render: (r) => <GradeChip grade={r.status} />,
    },
    {
      key: "DaysWithoutBreakdown_m",
      label: "Days without breakdown",
      align: "right",
      render: (r) => fmtNum(r.DaysWithoutBreakdown_m),
    },
    {
      key: "lastBreakdown",
      label: "Last breakdown",
      align: "right",
      render: (r) => lastBreakdownDate(r.DaysWithoutBreakdown_m),
    },
  ];

  if (error) {
    return (
      <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
        Zero Breakdown fetch failed: {error.message}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}
      >
        <button
          onClick={() => setSelectedSection(null)}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid " + (selectedSection == null ? C.bl : C.bd),
            background: selectedSection == null ? C.bl + "10" : C.c2,
            color: selectedSection == null ? C.bl : C.tx,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          All Sections · {fmtNum(total)}
        </button>
        {sectionRows.map((r) => (
          <button
            key={r.section}
            onClick={() => setSelectedSection(r.section)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border:
                "1px solid " + (selectedSection === r.section ? C.bl : C.bd),
              background: selectedSection === r.section ? C.bl + "10" : C.c2,
              color: selectedSection === r.section ? C.bl : C.tx,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {r.section} · {fmtNum(r.count)}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.mu, marginBottom: 8 }}>
        Machines with more than {ZERO_BREAKDOWN_MIN_DAYS} days without a
        breakdown{asOf ? `, as of ${asOf}` : ""}.
      </div>
      {loading ? (
        <JKLoader message="Loading" />
      ) : (
        <DTable
          columns={columns}
          rows={machineRows}
          getRowKey={(r) => r.machine}
          emptyMessage={`No zero-breakdown machines${selectedSection ? ` in ${selectedSection}` : ""}.`}
          downloadName={`engineering-zero-breakdown-machines${selectedSection ? `-${selectedSection}` : ""}`}
        />
      )}
    </div>
  );
}

/**
 * Zero Breakdown card headline: count of distinct machines with
 * DaysWithoutBreakdown_m > 30 on the last complete DAY — a running as-of
 * figure, independent of the selected report period (see ZeroBreakdownPanel).
 */
export function useZeroBreakdownTotal() {
  const [total, setTotal] = useState(null);
  const [asOf, setAsOf] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getZeroBreakdownCount()
      .then((res) => {
        if (cancelled || !res?.date) return;
        setAsOf(res.date);
        setTotal(res.count);
      })
      .catch(() => {
        /* card falls back to "—" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { total, asOf };
}

/** Fetch the ranked list once for both the headline card and expanded table. */
export function useTopMachineBreakdowns(period, enabled) {
  const requestKey = `${period.kind}|${period.date}|${period.granularity}|${period.from ?? ""}|${period.to ?? ""}`;
  const [result, setResult] = useState({ key: null, rows: [], error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getReliabilityKpiChildren(topMachineBreakdownRequest(period))
      .then((res) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          rows: topMachineBreakdownRows(res?.rows, period.kind === "range"),
          error: null,
        });
      })
      .catch(
        (error) =>
          !cancelled && setResult({ key: requestKey, rows: [], error }),
      );
    return () => {
      cancelled = true;
    };
    // The period object is re-created per render; requestKey is its identity.
  }, [requestKey, enabled]);

  return result.key === requestKey
    ? { rows: result.rows, error: result.error, loading: false }
    : { rows: [], error: null, loading: true };
}

/**
 * Top Machine Breakdowns — flat top-10 ranked table, no further drill.
 * `totalMinutes` is the plant-wide `BreakdownMin_Overall`: Share is a
 * percentage of the whole plant, not just of the ten listed machines.
 */
export function TopMachineBreakdownsPanel({
  rows,
  loading,
  error,
  totalMinutes = null,
}) {
  const columns = [
    { key: "machine", label: "Machine" },
    MACHINE_NAME_COLUMN,
    { key: "section", label: "Section" },
    {
      key: "status",
      label: "Category",
      render: (r) => <GradeChip grade={r.status} />,
    },
    {
      key: "BreakdownMin_m",
      label: "Downtime",
      align: "right",
      render: (r) => fmtMinHrs(r.BreakdownMin_m),
    },
    {
      key: "share",
      label: "Share",
      align: "right",
      sortValue: (r) => r.BreakdownMin_m,
      render: (r) =>
        totalMinutes && r.BreakdownMin_m != null
          ? fmtNum((r.BreakdownMin_m / totalMinutes) * 100, 1) + "%"
          : "—",
    },
    // Spec KPI 6: the machine-level counter, never the summed failure rows —
    // those overcount on seven machines (0206 reads 78 instead of 70).
    {
      key: "BreakdownOcc_m",
      label: "Occurrences",
      align: "right",
      render: (r) => fmtNum(r.BreakdownOcc_m),
    },
    {
      key: "MTTR_m",
      label: "MTTR",
      align: "right",
      render: (r) => fmtMinHrs(r.MTTR_m),
    },
    {
      key: "MTBF_m",
      label: "MTBF",
      align: "right",
      render: (r) => fmtMinHrs(r.MTBF_m),
    },
  ];

  if (error) {
    return (
      <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
        Top Machine Breakdowns fetch failed: {error.message}
      </div>
    );
  }
  if (loading) {
    return <JKLoader message="Loading" />;
  }
  return (
    <DTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.machine}
      emptyMessage="No breakdowns recorded in this period."
      downloadName="engineering-top-machine-breakdowns"
    />
  );
}
