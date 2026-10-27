/* eslint-disable */
/**
 * Quality Head dashboard — ported from the design jsx (Process / Product /
 * Customer Complaint / SPC tabs). Self-contained, inline-styled; mock data
 * for now (backend wiring is a later step). The jsx's own landing page, India
 * map and App wrapper are dropped — routing/plant selection is handled by the
 * app shell (BanmoreQuality.jsx) — and the inline base64 logo is swapped for
 * the shared asset.
 */
import { useState, useRef, useEffect, Fragment } from "react";
import {
  Box,
  Stack,
  Tooltip,
  Typography,
  IconButton,
  MenuItem,
  Select,
  useTheme,
} from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import UniformityTrendModal from "@/components/quality/UniformityTrendModal.jsx";
import { C } from "@/components/quality/shared/theme.js";
import { monthRangeFromKey } from "@/components/quality/shared/dates.js";
import { Breadcrumb } from "@/components/quality/shared/Breadcrumb.jsx";
import { Card } from "@/components/quality/shared/Card.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import { LiveProcessTrendPanel } from "@/components/quality/shared/LiveProcessTrendPanel.jsx";
import { KpiSplitLayout } from "@/components/quality/shared/KpiSplitLayout.jsx";
import { PrintStyles } from "@/components/quality/shared/PrintStyles.jsx";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import { StatusPill } from "@/components/quality/shared/StatusPill.jsx";
import {
  TrendBar,
  TrendChart,
  TrendProgress,
} from "@/components/quality/shared/TrendCharts.jsx";
import {
  _genInsight,
  pickChartType,
} from "@/components/quality/shared/trendUtils.js";
import { isUniformityTrendCard } from "@/lib/uniformityTrend.js";
import jkLogo from "@/assets/jk-logo.png";
import JKLoader from "@/components/JKLoader.jsx";
import ProductionTimeRangeSelect from "@/components/production/TimeRangeSelect.jsx";
import ProductionHeader from "@/components/production/ProductionHeader.jsx";
import NavTabs from "@/components/production/NavTabs.jsx";
import ScrapReworkDrillPanel from "@/components/drills/quality/ScrapReworkDrillPanel.jsx";
import DataTable from "@/components/tables/DataTable.jsx";
import { toDrillRows, toKpiGrid } from "@/lib/kpi-transformer.js";
import SharedUserMenu from "@/components/user-menu/UserMenu.jsx";
import { MOCK_USER } from "@/lib/mockData.js";
import { toDisplayDate } from "@/lib/dateFormat.js";
import {
  PAINT_WEIGHT_COLUMNS,
  PAINT_WEIGHT_DRILL_KPIS,
  PAINT_WEIGHT_OVERALL,
  groupPaintWeightRows,
  paintWeightValue,
} from "@/lib/paintWeight.js";
import {
  getProcessKpiChildren,
  getProcessSummary,
  getProductChildren,
  getProductHistory,
  getProductKpiHistory,
  getProductSummary,
  getCuringScrapHistory,
  getCuringScrapRows,
  getQualityAsOf,
  getSpcDetail,
  getSpcFilterOptions,
  getSpcTrend,
  getSpcWidgets,
  PROCESS_KPI_NAME,
} from "@/api/quality.js";

// The gold workbook is static (current snapshot 2026-04-01 → 2026-06-30), so
// these constants are fallbacks used only by the per-KPI trend panel when
// its caller doesn't pin a date range. The dashboard's main date state is
// driven by the system clock in IST (see todayInIST below), not these.
const QUALITY_MONTH_FROM = "2026-06-01";
const QUALITY_MONTH_TO = "2026-06-30";

// Dashboard date defaults are calendar-driven (system clock in IST), NOT pinned
// to the gold workbook's latest row. The user can pick any month in the
// dropdown — if it has no data, the cards render NA. Use Intl.DateTimeFormat so
// the timezone conversion is correct regardless of the server's TZ.
function todayInIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function offsetIsoDate(isoDate, days) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function currentMonthKeyInIST() {
  return todayInIST().slice(0, 7);
}

function currentYearRange() {
  return { from: "2026-01-01", to: "2026-12-31" };
}
const QUALITY_USER = {
  ...MOCK_USER,
  name: "Quality Head",
  role: "Quality Head",
  email: "quality.head@jktyre.example",
  employeeId: "JK-QH-00142",
  avatarInitials: "QH",
};

/* ─── LOGO ─── */
const LOGO = jkLogo;

const rc = (v) => (v >= 90 ? C.gn : v >= 80 ? C.am : C.rd);

/**
 * SPC headline statuses, worst-first. Gold publishes five: Critical, Major,
 * Warning, Healthy, Insufficient Data. `Major` is a marginal process — a real
 * status, not a missing one — so it gets its own colour and pill rather than
 * falling through to "Insufficient".
 */
const SPC_STATUS = {
  Critical: { col: C.rd, pill: "Red", label: "Out of specification" },
  Major: { col: C.ac, pill: "Marginal", label: "Marginal" },
  Warning: { col: C.am, pill: "Yellow", label: "Not capable" },
  Healthy: { col: C.gn, pill: "Green", label: "Capable" },
  "Insufficient Data": {
    col: C.mu,
    pill: "Insufficient",
    label: "Insufficient",
  },
};
const spcStatus = (s) => SPC_STATUS[s] || SPC_STATUS["Insufficient Data"];
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : n);
const productionCardBg = (color) =>
  color === C.rd
    ? "#FEF2F2"
    : color === C.am
      ? "#FFFBEB"
      : color === C.gn
        ? "#F0FDF4"
        : color === C.bl
          ? "#EFF6FF"
          : "#FFFFFF";

function QualityLoader({ minHeight = 360, message = "Please wait" }) {
  return (
    <div
      style={{
        minHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <JKLoader message={message} />
    </div>
  );
}

const isBanmorePlant = (p) =>
  p &&
  typeof p.name === "string" &&
  p.name.toLowerCase().indexOf("banmore") === 0;
const TT_FACTOR = {
  All: { rate: 1.0, invRate: 1.0, vol: 1.0 },
  PCR: { rate: 1.025, invRate: 0.78, vol: 0.58 },
  TBR: { rate: 0.965, invRate: 1.34, vol: 0.42 },
};
/* Adjust a numeric value based on tyre-type filter. For Banmore (PCR-only), no scaling. */
function tAdjust(v, name, tt, plant) {
  if (isBanmorePlant(plant) || tt === "All" || tt == null) return v;
  if (typeof v !== "number") {
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    const adj = tAdjust(n, name, tt, plant);
    return typeof v === "string"
      ? String(adj) + v.replace(/^-?\d*\.?\d+/, "")
      : adj;
  }
  const f = TT_FACTOR[tt] || TT_FACTOR.All;
  const isRate =
    /%|Rate|OEE|FTQ|Compliance|Availability|Yield|Efficiency|MTBF|MTTR/i.test(
      name,
    );
  const isInv =
    /Scrap|Reject|Loss|Defect|Absent|Downtime|NCM|Breakdown|Hold|Reduced|Stoppage|Repeat/i.test(
      name,
    );
  let factor;
  if (isRate) {
    factor = isInv ? f.invRate : f.rate;
  } else {
    factor = f.vol;
    if (isInv) factor = factor * (tt === "PCR" ? 0.75 : 1.3);
  }
  const adj = v * factor;
  return Math.abs(adj) < 10 ? Math.round(adj * 100) / 100 : Math.round(adj);
}

function TyreTypeFilter({ value, onChange, plant, disabled, disabledReason }) {
  const banmore = isBanmorePlant(plant);
  if (banmore) {
    return (
      <div
        title="Banmore plant produces PCR only"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          background: C.tl + "18",
          border: "1px solid " + C.tl + "40",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          color: C.tl,
          letterSpacing: ".4px",
        }}
      >
        <span
          style={{ width: 6, height: 6, borderRadius: "50%", background: C.tl }}
        />
        PCR ONLY
      </div>
    );
  }
  const opts = ["All", "PCR", "TBR"];
  return (
    <div
      title={
        disabled
          ? disabledReason || "Not applicable for this view"
          : "Filter by tyre type"
      }
      style={{
        display: "flex",
        gap: 1,
        background: disabled ? C.bg : C.bg,
        borderRadius: 12,
        padding: 2,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {opts.map((o) => {
        const a = value === o;
        const col = o === "PCR" ? C.bl : o === "TBR" ? C.tl : C.tx;
        return (
          <button
            key={o}
            onClick={() => !disabled && onChange(o)}
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              border: "none",
              fontSize: 12,
              fontWeight: a ? 700 : 500,
              background: a ? C.cd : "transparent",
              color: a ? col : C.mu,
              cursor: disabled ? "not-allowed" : "pointer",
              letterSpacing: ".4px",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/* Banner showing the active tyre-type filter on a tab where it applies */
function TyreTypeBanner({ tt, plant, disabled }) {
  const banmore = isBanmorePlant(plant);
  if (banmore) {
    return null;
  } /* the PCR ONLY badge in header already conveys this */
  if (disabled) {
    return (
      <div style={{ fontSize: 12, color: C.mu, fontStyle: "italic" }}>
        Tyre-type filter not applicable — plant-wide metrics
      </div>
    );
  }
  if (tt === "All") {
    return null;
  }
  const col = tt === "PCR" ? C.bl : C.tl;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        background: col + "12",
        border: "1px solid " + col + "33",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        color: col,
        letterSpacing: ".3px",
        alignSelf: "flex-start",
      }}
    >
      <span
        style={{ width: 5, height: 5, borderRadius: "50%", background: col }}
      />
      SHOWING {tt} ONLY{" "}
      <span
        style={{ fontSize: 11, fontWeight: 500, color: C.mu, marginLeft: 2 }}
      >
        — mock data scaled to {tt} mix
      </span>
    </div>
  );
}

/* ─── TIME RANGE (preset + from/to date picker) ─── */
function _pad2(n) {
  return String(n).padStart(2, "0");
}
function _toIso(d) {
  return (
    d.getFullYear() + "-" + _pad2(d.getMonth() + 1) + "-" + _pad2(d.getDate())
  );
}
function _rangeFromPreset(p) {
  const end = new Date();
  const start = new Date();
  if (p === "Today") {
    /* same day */
  } else if (p === "Week") {
    start.setDate(start.getDate() - 6);
  } else if (p === "Month") {
    start.setDate(start.getDate() - 29);
  } else if (p === "Year") {
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
  }
  return { from: _toIso(start), to: _toIso(end) };
}
function _daysBetween(from, to) {
  if (!from || !to) return 0;
  const d1 = new Date(from),
    d2 = new Date(to);
  if (isNaN(d1) || isNaN(d2)) return 0;
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}
function _autoPreset(from, to) {
  const d = _daysBetween(from, to);
  if (d <= 2) return "Today";
  if (d <= 14) return "Week";
  if (d <= 180) return "Month";
  return "Year";
}
function TimeRangeSelect({
  preset,
  setPreset,
  from,
  to,
  setFrom,
  setTo,
  compact,
  shift,
  setShift,
}) {
  const presets = ["Today", "Month", "Year"];
  const onPreset = (p) => {
    const r = _rangeFromPreset(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
  };
  const onFrom = (e) => {
    setFrom(e.target.value);
    setPreset("");
  };
  const onTo = (e) => {
    setTo(e.target.value);
    setPreset("");
  };
  const days = _daysBetween(from, to);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 3,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 1,
            background: C.bg,
            borderRadius: 10,
            padding: 2,
          }}
        >
          {presets.map((t) => (
            <button
              key={t}
              onClick={() => onPreset(t)}
              style={{
                padding: "3px 9px",
                borderRadius: 8,
                border: "none",
                fontSize: 11,
                fontWeight: preset === t ? 700 : 400,
                background: preset === t ? C.cd : "transparent",
                color: preset === t ? C.tx : C.mu,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {preset === "Today" && setShift && (
          <select
            value={shift || "All"}
            onChange={(e) => setShift(e.target.value)}
            title="Filter by shift"
            style={{
              marginLeft: 4,
              padding: "2px 6px",
              border: "1px solid " + C.bd,
              borderRadius: 6,
              background: shift && shift !== "All" ? C.aL : C.cd,
              fontSize: 10,
              fontFamily: "inherit",
              color: shift && shift !== "All" ? C.ac : C.mu,
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="All">All Shifts</option>
            <option value="A">Shift A</option>
            <option value="B">Shift B</option>
            <option value="C">Shift C</option>
          </select>
        )}
      </div>
      <div
        title="From — To"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "2px 6px",
          border: "1px solid " + C.bd,
          borderRadius: 8,
          background: C.cd,
        }}
      >
        <input
          type="date"
          value={from || ""}
          onChange={onFrom}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 11,
            fontFamily: "inherit",
            color: C.tx,
            padding: "2px 0",
            width: 96,
          }}
        />
        <span style={{ color: C.bd, fontSize: 11 }}>{"–"}</span>
        <input
          type="date"
          value={to || ""}
          onChange={onTo}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 11,
            fontFamily: "inherit",
            color: C.tx,
            padding: "2px 0",
            width: 96,
          }}
        />
        {!compact && !preset && days > 0 && (
          <span
            style={{
              color: C.ac,
              fontWeight: 700,
              fontSize: 10,
              padding: "1px 5px",
              background: C.aL,
              borderRadius: 4,
              marginLeft: 2,
            }}
          >
            {days}d
          </span>
        )}
      </div>
    </div>
  );
}

function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function _genTrendSeries(kpi, range, effV) {
  const v =
    typeof effV === "number"
      ? effV
      : parseFloat(String(kpi.v).replace(/,/g, ""));
  if (isNaN(v)) return null;
  const n =
    range === "Today"
      ? 8
      : range === "Week"
        ? 7
        : range === "Month"
          ? 12
          : range === "Year"
            ? 5
            : 7;
  const labels =
    range === "Today"
      ? ["00", "03", "06", "09", "12", "15", "18", "21"]
      : range === "Week"
        ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        : range === "Month"
          ? [
              "Apr",
              "May",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Oct",
              "Nov",
              "Dec",
              "Jan",
              "Feb",
              "Mar",
            ]
          : range === "Year"
            ? ["FY21", "FY22", "FY23", "FY24", "FY25"]
            : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (kpi.sp && kpi.sp.length > 1) {
    const sp = kpi.sp;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const t = (i * (sp.length - 1)) / Math.max(n - 1, 1);
      const lo = Math.floor(t),
        hi = Math.min(lo + 1, sp.length - 1),
        f = t - lo;
      arr.push(sp[lo] * (1 - f) + sp[hi] * f);
    }
    const last = arr[arr.length - 1];
    const k = last !== 0 ? v / last : 1;
    const out = arr.map((x) => Math.round(x * k * 100) / 100);
    out[out.length - 1] = Math.round(v * 100) / 100;
    return { labels, series: out };
  }
  const seed = _hash((kpi.id || kpi.n || "x") + range);
  const arr = [];
  for (let i = 0; i < n; i++) {
    const x = (seed % 1000) / 1000 + i * 0.137;
    const noise =
      (Math.sin(x * 9.7 + i) * 0.06 + Math.cos(x * 4.3 + i * 0.5) * 0.035) *
      Math.max(Math.abs(v), 0.5);
    const drift = v * 0.08 * (i / Math.max(n - 1, 1) - 0.5);
    arr.push(Math.round((v - drift + noise) * 100) / 100);
  }
  arr[arr.length - 1] = Math.round(v * 100) / 100;
  return { labels, series: arr };
}

/* ── KPI-aligned category charts (drill-structure visualizations) ── */
function _cres(k) {
  const m = {
    gn: C.gn,
    rd: C.rd,
    am: C.am,
    bl: C.bl,
    tl: C.tl,
    pp: C.pp,
    tx: C.tx,
  };
  return m[k] || k || C.bl;
}
function HBarChart({ items, unit, target, hb }) {
  const w = 620,
    rowH = 36,
    padL = 160,
    padR = 70,
    padT = 8;
  const h = padT + items.length * rowH + (target != null ? 24 : 8);
  const vals = items
    .map((i) => i.v)
    .concat(
      items.map((i) => (i.t != null ? i.t : target != null ? target : 0)),
    );
  const max = Math.max(...vals) * 1.12 || 1;
  const x = (v) => padL + (v / max) * (w - padL - padR);
  return (
    <svg
      viewBox={"0 0 " + w + " " + h}
      style={{ width: "100%", height: "auto" }}
    >
      {items.map((it, i) => {
        const y0 = padT + i * rowH;
        const t = it.t != null ? it.t : target;
        const ok = t == null ? null : hb ? it.v >= t : it.v <= t;
        const col = ok == null ? C.bl : ok ? C.gn : C.rd;
        return (
          <g key={i}>
            <text
              x={padL - 8}
              y={y0 + rowH / 2 + 4}
              fontSize="11.5"
              fill={C.tx}
              textAnchor="end"
            >
              {it.l}
            </text>
            <rect
              x={padL}
              y={y0 + 8}
              width={w - padL - padR}
              height={rowH - 18}
              rx="4"
              fill={C.bd}
              opacity="0.35"
            />
            <rect
              x={padL}
              y={y0 + 8}
              width={Math.max(x(it.v) - padL, 2)}
              height={rowH - 18}
              rx="4"
              fill={col}
              opacity="0.85"
            >
              <title>{`${it.l}: ${it.v}${unit ? " " + unit : ""}`}</title>
            </rect>
            {t != null && (
              <line
                x1={x(t)}
                y1={y0 + 4}
                x2={x(t)}
                y2={y0 + rowH - 6}
                stroke={C.am}
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            )}
            <text
              x={x(it.v) + 6}
              y={y0 + rowH / 2 + 4}
              fontSize="11"
              fontWeight="700"
              fill={C.tx}
            >
              {it.v}
            </text>
          </g>
        );
      })}
      {target != null && (
        <text
          x={x(target)}
          y={h - 6}
          fontSize="9.5"
          fill={C.am}
          fontWeight="700"
          textAnchor="middle"
        >
          {"Target " + target + (unit ? " " + unit : "")}
        </text>
      )}
    </svg>
  );
}
function DonutChart({ items, unit }) {
  const total = items.reduce((s, i) => s + i.v, 0) || 1;
  const cx = 110,
    cy = 100,
    R = 72,
    r = 44;
  let a = -Math.PI / 2;
  const palette = [C.bl, C.tl, C.am, C.pp, C.gn, C.rd];
  const segs = items.map((it, i) => {
    const frac = it.v / total,
      a2 = a + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (ang, rad) => [
      cx + rad * Math.cos(ang),
      cy + rad * Math.sin(ang),
    ];
    const q = p(a, R),
      q2 = p(a2, R),
      q3 = p(a2, r),
      q4 = p(a, r);
    const d =
      "M" +
      q[0] +
      "," +
      q[1] +
      " A" +
      R +
      "," +
      R +
      " 0 " +
      large +
      " 1 " +
      q2[0] +
      "," +
      q2[1] +
      " L" +
      q3[0] +
      "," +
      q3[1] +
      " A" +
      r +
      "," +
      r +
      " 0 " +
      large +
      " 0 " +
      q4[0] +
      "," +
      q4[1] +
      " Z";
    const col = it.c ? _cres(it.c) : palette[i % palette.length];
    const seg = { d, col, it, pct: Math.round(frac * 1000) / 10 };
    a = a2;
    return seg;
  });
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "6px 4px 10px",
      }}
    >
      <svg viewBox="0 0 220 200" style={{ width: 220, flexShrink: 0 }}>
        {segs.map((s, i) => (
          <path key={i} d={s.d} fill={s.col} stroke={C.cd} strokeWidth="1.5">
            <title>{`${s.it.l}: ${s.it.v}${unit ? " " + unit : ""} (${s.pct}%)`}</title>
          </path>
        ))}
        <text
          x={cx}
          y={cy - 2}
          fontSize="15"
          fontWeight="700"
          fill={C.tx}
          textAnchor="middle"
        >
          {total >= 1000
            ? Math.round(total).toLocaleString("en-IN")
            : Math.round(total * 100) / 100}
        </text>
        <text x={cx} y={cy + 14} fontSize="9.5" fill={C.mu} textAnchor="middle">
          {unit || ""}
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minWidth: 200,
          flex: 1,
        }}
      >
        {segs.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
            }}
          >
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: 3,
                background: s.col,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, color: C.tx }}>{s.it.l}</span>
            <span style={{ fontWeight: 700, color: C.tx }}>
              {s.it.v >= 1000 ? s.it.v.toLocaleString("en-IN") : s.it.v}
            </span>
            <span style={{ color: C.mu, width: 46, textAlign: "right" }}>
              {s.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function MultiLineChart({ series, target }) {
  const w = 620,
    h = 210,
    padL = 44,
    padR = 14,
    padT = 14,
    padB = 40;
  const n = Math.max(...series.map((s) => s.sp.length));
  const labels = Array.from({ length: n }, (_, i) =>
    i === n - 1 ? "Now" : "W-" + (n - 1 - i),
  );
  const all = series
    .reduce((acc, s) => acc.concat(s.sp), [])
    .concat(target != null ? [target] : []);
  const min = Math.min(...all),
    max = Math.max(...all);
  const rng = max - min || 1,
    yMin = min - rng * 0.15,
    yMax = max + rng * 0.18,
    yR = yMax - yMin;
  const cw = w - padL - padR,
    ch = h - padT - padB;
  const x = (i) => padL + i * (cw / Math.max(n - 1, 1));
  const y = (v) => padT + ch - ((v - yMin) / yR) * ch;
  return (
    <div>
      <svg
        viewBox={"0 0 " + w + " " + h}
        style={{ width: "100%", height: "auto" }}
      >
        {[0, 0.5, 1].map((p, i) => (
          <line
            key={i}
            x1={padL}
            y1={padT + ch * p}
            x2={padL + cw}
            y2={padT + ch * p}
            stroke={C.bd}
            strokeWidth="0.6"
            strokeDasharray={i === 1 ? "" : "2 3"}
          />
        ))}
        {[0, 0.5, 1].map((p, i) => {
          const v = yMax - yR * p;
          return (
            <text
              key={i}
              x={padL - 6}
              y={padT + ch * p + 3}
              fontSize="9"
              fill={C.mu}
              textAnchor="end"
            >
              {Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)}
            </text>
          );
        })}
        {target != null && (
          <g>
            <line
              x1={padL}
              y1={y(target)}
              x2={padL + cw}
              y2={y(target)}
              stroke={C.am}
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <text
              x={padL + cw - 4}
              y={y(target) - 5}
              fontSize="9"
              fill={C.am}
              fontWeight="700"
              textAnchor="end"
            >
              {"Target " + target}
            </text>
          </g>
        )}
        {series.map((s, si) => {
          const col = _cres(s.c);
          const pts = s.sp.map((v, i) => x(i) + "," + y(v)).join(" ");
          return (
            <g key={si}>
              <polyline
                points={pts}
                fill="none"
                stroke={col}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              {s.sp.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r="3"
                  fill={col}
                  stroke="#fff"
                  strokeWidth="1.2"
                >
                  <title>{`${s.l} · ${labels[i] || "Point " + (i + 1)}: ${v}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {labels.map((l, i) => (
          <text
            key={i}
            x={x(i)}
            y={h - padB + 16}
            fontSize="9"
            fill={C.mu}
            textAnchor="middle"
          >
            {l}
          </text>
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          gap: 14,
          justifyContent: "center",
          fontSize: 11.5,
          color: C.mu,
          paddingBottom: 6,
          flexWrap: "wrap",
        }}
      >
        {series.map((s, i) => (
          <span
            key={i}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <span
              style={{
                width: 14,
                height: 2.5,
                background: _cres(s.c),
                display: "inline-block",
              }}
            />
            {s.l}
          </span>
        ))}
      </div>
    </div>
  );
}
function CatChartBlock({ kpi, chartType }) {
  const cd = kpi.chartData || {};
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: C.mu,
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {cd.title || kpi.n}
      </div>
      {chartType === "hbar" && (
        <HBarChart
          items={cd.items || []}
          unit={cd.unit}
          target={cd.target}
          hb={cd.hb}
        />
      )}
      {chartType === "donut" && (
        <DonutChart items={cd.items || []} unit={cd.unit} />
      )}
      {chartType === "multiline" && (
        <MultiLineChart series={cd.series || []} target={cd.target} />
      )}
    </div>
  );
}
function TrendIcon({ size }) {
  const s = size || 13;
  return (
    <svg
      width={s}
      height={s * 0.85}
      viewBox="0 0 13 11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1,8.5 4,5.5 7,7 10,3 12,4" />
    </svg>
  );
}

/* ─── COMPONENTS ─── */
function Spark({ data, color, w = 70, h = 20 }) {
  const mn = Math.min(...data),
    mx = Math.max(...data),
    rn = mx - mn || 1;
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - 2 - ((v - mn) / rn) * (h - 4)}`,
    )
    .join(" ");
  return (
    <svg width={w} height={h}>
      <polyline
        points={pts}
        fill="none"
        stroke={color || C.tl}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.8}
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={(i / (data.length - 1)) * w}
          cy={h - 2 - ((v - mn) / rn) * (h - 4)}
          r="3"
          fill="transparent"
        >
          <title>{`Point ${i + 1}: ${v}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/* TechTrendPanel — analytical MP/CP trend. inv=true => lower is better. */
function TechTrendPanel({ kpi, onClose, initialRange }) {
  const [range, setRange] = useState(initialRange || "Monthly");
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!kpi) return null;
  const inv = !!kpi.inv;
  const unit = kpi.u || "";
  const pN = (s) => {
    if (s == null) return NaN;
    const t = String(s)
      .replace(/[,%<>≤≥]/g, "")
      .replace(/[^0-9.\- ]/g, " ")
      .trim()
      .split(/\s+/)[0];
    return parseFloat(t);
  };
  const target = pN(kpi.target);
  const hasT = !isNaN(target);
  const sp = (
    kpi.sp && kpi.sp.length ? kpi.sp.map(Number) : [pN(kpi.v)]
  ).filter((n) => !isNaN(n));
  const current = isNaN(pN(kpi.v)) ? sp[sp.length - 1] : pN(kpi.v);
  const baseline = sp[0];
  const dec = Math.abs(current) < 2 ? 3 : Math.abs(current) < 20 ? 2 : 0;
  const fmt2 = (v) => {
    const r = Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
    return r.toLocaleString("en-IN");
  };
  const su = unit && unit.length < 6 ? " " + unit : "";
  const isPct = /%/.test(unit);
  let lo = -Infinity,
    hi = Infinity;
  if (isPct) hi = 100;
  if (inv || isPct || /PPM|nos|no's|claim|incident|injur|score/i.test(unit))
    lo = Math.max(lo, 0);
  const clamp = (v) => Math.min(hi, Math.max(lo, v));
  let seed = 0;
  for (const ch of kpi.n || "x") seed += ch.charCodeAt(0);
  const rnd = (i) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  function build() {
    const step = sp.length >= 2 ? sp[sp.length - 1] - sp[sp.length - 2] : 0;
    const spreadEst =
      Math.max(...sp) - Math.min(...sp) || Math.abs(current) * 0.04 || 1;
    if (range === "Daily") {
      const n = 30,
        drift = step / 30,
        amp = Math.max(spreadEst * 0.55, Math.abs(current) * 0.01) || 1,
        a = [];
      for (let i = 0; i < n; i++) {
        const base = current - drift * (n - 1 - i);
        const noise =
          ((rnd(i) + rnd(i * 2 + 7) + rnd(i * 3 + 13)) / 3 - 0.5) * amp;
        a.push({
          l: i === n - 1 ? "Today" : i % 5 === 0 ? n - 1 - i + "d" : "",
          v: i === n - 1 ? current : clamp(base + noise),
        });
      }
      return { a, sub: "Daily · last 30 days" };
    }
    if (range === "Yearly") {
      const yStep =
        (spreadEst > 0 ? spreadEst * 1.5 : Math.abs(current) * 0.04) || 1;
      const dir = inv ? 1 : -1;
      const a = [
        { l: "FY24", v: clamp(current + dir * yStep * 3) },
        { l: "FY25", v: clamp(current + dir * yStep * 2) },
        { l: "FY26", v: clamp(current + dir * yStep) },
        { l: "FY27*", v: current },
      ];
      return { a, sub: "Financial years · FY27 in progress (*)" };
    }
    const months = [
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
    ];
    const startIdx = Math.max(0, months.length - sp.length);
    const a = sp.map((v, i) => ({
      l: months[startIdx + i] || "M-" + (sp.length - 1 - i),
      v: clamp(v),
    }));
    return { a, sub: "Monthly · " + sp.length + "-month actuals" };
  }
  const { a, sub } = build();
  const all = a;
  const meets = hasT ? (inv ? current <= target : current >= target) : null;
  const movingRight = inv ? current < baseline : current > baseline;
  const verdict = meets
    ? { t: "On Track", c: C.gn }
    : meets === false
      ? movingRight
        ? { t: "Watch", c: C.am }
        : { t: "Off Track", c: C.rd }
      : movingRight
        ? { t: "Improving", c: C.bl }
        : { t: "Flat", c: C.mu };
  const deltaBase = current - baseline;
  const betterByBase = inv ? deltaBase < 0 : deltaBase > 0;
  const gapToTarget = hasT ? (inv ? current - target : target - current) : NaN;
  const W = 680,
    H = 300,
    padL = 54,
    padR = 20,
    padT = 26,
    padB = 48;
  const pw = W - padL - padR,
    ph = H - padT - padB;
  const vals = all
    .map((p) => p.v)
    .concat(hasT ? [target] : [], [baseline])
    .filter((n) => !isNaN(n));
  let mn = Math.min(...vals),
    mx = Math.max(...vals);
  const spread = mx - mn || Math.abs(mx) || 1;
  mn -= spread * 0.16;
  mx += spread * 0.16;
  const yR = mx - mn;
  const X = (i) =>
    padL + (all.length <= 1 ? pw / 2 : i * (pw / (all.length - 1)));
  const Y = (v) => padT + ph - ((v - mn) / yR) * ph;
  const yT = hasT ? Y(target) : 0,
    yB = Y(baseline);
  const nowI = a.length - 1;
  const stCol = verdict.c;
  const gradId = "ttg" + seed;
  function smooth(pts) {
    if (pts.length < 2)
      return pts.length ? "M" + pts[0][0] + "," + pts[0][1] : "";
    let d = "M" + pts[0][0] + "," + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i],
        p1 = pts[i],
        p2 = pts[i + 1],
        p3 = pts[i + 2] || pts[i + 1];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6,
        c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6,
        c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d +=
        " C" +
        c1x +
        "," +
        c1y +
        " " +
        c2x +
        "," +
        c2y +
        " " +
        p2[0] +
        "," +
        p2[1];
    }
    return d;
  }
  const aPts = a.map((p, i) => [X(i), Y(p.v)]);
  const aPath = smooth(aPts);
  const aArea =
    aPath +
    " L" +
    X(nowI) +
    "," +
    (padT + ph) +
    " L" +
    X(0) +
    "," +
    (padT + ph) +
    " Z";
  const goodTop = inv ? yT : padT,
    goodH = inv ? padT + ph - yT : yT - padT;
  const badTop = inv ? padT : yT,
    badH = inv ? yT - padT : padT + ph - yT;
  const tile = (label, val, sub2, col) => (
    <div
      style={{
        flex: 1,
        minWidth: 118,
        background: C.c2,
        border: "1px solid " + C.bd,
        borderRadius: 8,
        padding: "9px 11px",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: C.mu,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: ".3px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: col || C.tx,
          marginTop: 2,
        }}
      >
        {val}
      </div>
      {sub2 && (
        <div style={{ fontSize: 10.5, color: C.mu, marginTop: 1 }}>{sub2}</div>
      )}
    </div>
  );
  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          borderRadius: 12,
          maxWidth: 800,
          width: "100%",
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          border: "1px solid " + C.bd,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11.5,
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".5px",
              }}
            >
              Trend
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: C.tx,
                marginTop: 2,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {kpi.n}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: "2px 10px",
                  borderRadius: 999,
                  background: stCol + "18",
                  color: stCol,
                  textTransform: "uppercase",
                  letterSpacing: ".4px",
                }}
              >
                {verdict.t}
              </span>
              {hasT && gapToTarget > 0 && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: C.am + "15",
                    color: C.am,
                  }}
                >
                  {"gap " + fmt2(Math.abs(gapToTarget)) + su + " to target"}
                </span>
              )}
              {hasT && gapToTarget <= 0 && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: C.gn + "15",
                    color: C.gn,
                  }}
                >
                  {"target met"}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.c2,
              color: C.mu,
              fontSize: 19,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            {"✕"}
          </button>
        </div>
        <div
          style={{
            padding: "12px 18px 4px",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: C.mu,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".3px",
            }}
          >
            View
          </span>
          {["Daily", "Monthly", "Yearly"].map((o) => {
            const act = range === o;
            return (
              <button
                key={o}
                onClick={() => setRange(o)}
                style={{
                  padding: "4px 14px",
                  borderRadius: 999,
                  border: "1px solid " + (act ? C.bl : C.bd),
                  background: act ? C.bl + "15" : C.c2,
                  color: act ? C.bl : C.tx,
                  fontSize: 12,
                  fontWeight: act ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {o}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.mu }}>
            {sub}
          </span>
        </div>
        <div style={{ padding: "6px 18px 0" }}>
          <svg
            viewBox={"0 0 " + W + " " + H}
            style={{ width: "100%", height: "auto" }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stCol} stopOpacity="0.20" />
                <stop offset="100%" stopColor={stCol} stopOpacity="0" />
              </linearGradient>
            </defs>
            {hasT && (
              <rect
                x={padL}
                y={goodTop}
                width={pw}
                height={Math.max(goodH, 0)}
                fill={C.gn}
                opacity="0.06"
              />
            )}
            {hasT && (
              <rect
                x={padL}
                y={badTop}
                width={pw}
                height={Math.max(badH, 0)}
                fill={C.rd}
                opacity="0.05"
              />
            )}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
              const v = mx - yR * p;
              return (
                <g key={i}>
                  <line
                    x1={padL}
                    y1={padT + ph * p}
                    x2={padL + pw}
                    y2={padT + ph * p}
                    stroke={C.bd}
                    strokeWidth="0.6"
                    strokeDasharray={p === 1 ? "" : "2 3"}
                    opacity="0.6"
                  />
                  <text
                    x={padL - 7}
                    y={padT + ph * p + 3}
                    fontSize="9"
                    fill={C.mu}
                    textAnchor="end"
                  >
                    {fmt2(v)}
                  </text>
                </g>
              );
            })}
            <line
              x1={padL}
              y1={yB}
              x2={padL + pw}
              y2={yB}
              stroke={C.mu}
              strokeWidth="1.2"
              strokeDasharray="1 3"
              opacity="0.8"
            />
            <text
              x={padL + pw}
              y={yB - 4}
              fontSize="9.5"
              fill={C.mu}
              textAnchor="end"
            >
              {"Baseline " + fmt2(baseline)}
            </text>
            {hasT && (
              <g>
                <line
                  x1={padL}
                  y1={yT}
                  x2={padL + pw}
                  y2={yT}
                  stroke={C.am}
                  strokeWidth="1.8"
                  strokeDasharray="6 3"
                />
                <text
                  x={padL + 4}
                  y={yT - 5}
                  fontSize="10"
                  fill={C.am}
                  fontWeight="700"
                >
                  {"Target " + fmt2(target) + su}
                </text>
              </g>
            )}
            <path d={aArea} fill={"url(#" + gradId + ")"} />
            <path
              d={aPath}
              fill="none"
              stroke={stCol}
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {a.map((p, i) =>
              range === "Daily" && i !== nowI ? null : (
                <circle
                  key={i}
                  cx={X(i)}
                  cy={Y(p.v)}
                  r={i === nowI ? 4.5 : 3}
                  fill={i === nowI ? stCol : C.cd}
                  stroke={stCol}
                  strokeWidth="1.8"
                >
                  <title>{`${p.l || "Point " + (i + 1)}: ${fmt2(p.v)}${su}`}</title>
                </circle>
              ),
            )}
            {all.map((p, i) =>
              p.l ? (
                <text
                  key={i}
                  x={X(i)}
                  y={padT + ph + 16}
                  fontSize="8.5"
                  fill={C.md}
                  textAnchor="middle"
                >
                  {p.l}
                </text>
              ) : null,
            )}
            <text
              x={X(nowI)}
              y={padT - 9}
              fontSize="9"
              fill={stCol}
              fontWeight="700"
              textAnchor="middle"
            >
              Now
            </text>
          </svg>
          <div
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "center",
              fontSize: 11,
              color: C.mu,
              padding: "2px 0 8px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <span
                style={{
                  width: 14,
                  height: 2.6,
                  background: stCol,
                  display: "inline-block",
                }}
              />
              Actual
            </span>
            {hasT && (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <span
                  style={{
                    width: 14,
                    height: 0,
                    borderTop: "2px dashed " + C.am,
                    display: "inline-block",
                  }}
                />
                Target
              </span>
            )}
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <span
                style={{
                  width: 14,
                  height: 0,
                  borderTop: "2px dotted " + C.mu,
                  display: "inline-block",
                }}
              />
              Baseline
            </span>
            {hasT && (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    background: C.gn,
                    opacity: 0.4,
                    borderRadius: 2,
                    display: "inline-block",
                  }}
                />
                Good zone
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            padding: "6px 18px 16px",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {tile("Current", fmt2(current) + su, null, stCol)}
          {hasT &&
            tile(
              "Target",
              fmt2(target) + su,
              inv ? "lower is better" : "higher is better",
              C.am,
            )}
          {tile(
            "vs Baseline",
            (betterByBase ? "▲ " : "▼ ") + fmt2(Math.abs(deltaBase)) + su,
            "from " + fmt2(baseline),
            betterByBase ? C.gn : C.rd,
          )}
        </div>
      </div>
    </div>
  );
}
function TrendPanel({ kpi, onClose, tyreType, plant }) {
  const [range, setRange] = useState("Today");
  const _rt0 = _rangeFromPreset("Today");
  const [trFrom, setTrFrom] = useState(_rt0.from);
  const [trTo, setTrTo] = useState(_rt0.to);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!kpi) return null;
  const inv =
    /Scrap|Reject|Loss|Absent|First|Downtime|NCM|Defect|Reduced|Stoppage|Repeat|Hold|Breakdown/i.test(
      kpi.n,
    );
  const chartType = pickChartType(kpi);
  const catType =
    chartType === "hbar" || chartType === "donut" || chartType === "multiline";
  const _vNum = parseFloat(String(kpi.v).replace(/,/g, ""));
  const effV = tAdjust(_vNum, kpi.n, tyreType, plant);
  const _tNum =
    kpi.target != null
      ? parseFloat(String(kpi.target).replace(/[^0-9.\-]/g, ""))
      : NaN;
  const rawTarget = !isNaN(_tNum)
    ? _tNum
    : inv
      ? (isNaN(effV) ? _vNum : effV) * 0.85
      : (isNaN(effV) ? _vNum : effV) * 1.05;
  const effTarget = tAdjust(rawTarget, kpi.n, tyreType, plant);
  const cur = isNaN(effV) ? _vNum : effV;
  const tgt = isNaN(effTarget) ? rawTarget : effTarget;
  const effRange = range || _autoPreset(trFrom, trTo);
  const data = catType ? null : _genTrendSeries(kpi, effRange, cur);
  const stCol =
    kpi.status === "Red"
      ? C.rd
      : kpi.status === "Yellow"
        ? C.am
        : kpi.status === "Green"
          ? C.gn
          : C.bl;
  if (!catType && !data)
    return (
      <div
        onClick={onClose}
        className="no-print"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.55)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: C.cd,
            borderRadius: 12,
            padding: 20,
            maxWidth: 400,
          }}
        >
          Trend not available for this KPI (non-numeric).
          <button
            onClick={onClose}
            style={{
              marginTop: 12,
              padding: "6px 14px",
              border: "1px solid " + C.bd,
              background: C.c2,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  const ins = catType
    ? { bestIdx: -1, worstIdx: -1 }
    : _genInsight(data.series, tgt, cur, inv, kpi.n);
  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fadeIn .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          borderRadius: 12,
          maxWidth: 740,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          border: "1px solid " + C.bd,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".5px",
              }}
            >
              KPI Trend Analysis
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: C.tx,
                marginTop: 2,
              }}
            >
              {kpi.n}
              {tyreType && tyreType !== "All" && !isBanmorePlant(plant) && (
                <span
                  style={{
                    fontSize: 13,
                    marginLeft: 8,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: (tyreType === "PCR" ? C.bl : C.tl) + "18",
                    color: tyreType === "PCR" ? C.bl : C.tl,
                    fontWeight: 700,
                  }}
                >
                  {tyreType}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.c2,
              color: C.mu,
              fontSize: 19,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            {"✕"}
          </button>
        </div>
        {!catType && (
          <div
            style={{
              padding: "14px 18px",
              display: "flex",
              gap: 10,
              alignItems: "center",
              borderBottom: "1px solid " + C.bd,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                marginRight: 4,
              }}
            >
              Time Range
            </span>
            <TimeRangeSelect
              preset={range}
              setPreset={setRange}
              from={trFrom}
              to={trTo}
              setFrom={setTrFrom}
              setTo={setTrTo}
            />
          </div>
        )}
        <div style={{ padding: "14px 18px" }}>
          <div
            style={{
              background: C.c2,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              padding: "10px 12px 4px",
            }}
          >
            {catType ? (
              <CatChartBlock kpi={kpi} chartType={chartType} />
            ) : (
              <>
                <div
                  style={{
                    fontSize: 12,
                    color: C.mu,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    {chartType === "progress"
                      ? "Progress to Target"
                      : "Actual vs Target — " + effRange}
                  </span>
                  {chartType === "line" && (
                    <>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 2,
                            background: stCol,
                            display: "inline-block",
                          }}
                        />
                        Actual
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 0,
                            borderTop: "1.5px dashed " + C.am,
                            display: "inline-block",
                          }}
                        />
                        Target
                      </span>
                    </>
                  )}
                  {chartType === "bar" && (
                    <>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            background: stCol,
                            display: "inline-block",
                            borderRadius: 2,
                          }}
                        />
                        Period value
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 0,
                            borderTop: "1.5px dashed " + C.am,
                            display: "inline-block",
                          }}
                        />
                        Target
                      </span>
                    </>
                  )}
                  {chartType !== "progress" && ins.bestIdx >= 0 && (
                    <>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            background: C.gn,
                            display: "inline-block",
                            borderRadius: "50%",
                          }}
                        />
                        Best
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            background: C.rd,
                            display: "inline-block",
                            borderRadius: "50%",
                          }}
                        />
                        Worst
                      </span>
                    </>
                  )}
                </div>
                {chartType === "bar" ? (
                  <TrendBar
                    labels={data.labels}
                    series={data.series}
                    target={tgt}
                    color={stCol}
                    bestIdx={ins.bestIdx}
                    worstIdx={ins.worstIdx}
                  />
                ) : chartType === "progress" ? (
                  <TrendProgress
                    current={cur}
                    target={tgt}
                    unit={kpi.u}
                    color={stCol}
                    series={data.series}
                    labels={data.labels}
                  />
                ) : (
                  <TrendChart
                    labels={data.labels}
                    series={data.series}
                    target={tgt}
                    color={stCol}
                    bestIdx={ins.bestIdx}
                    worstIdx={ins.worstIdx}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function _printPage() {
  window.print();
}

/* ─── EXPORT (PRINT) BUTTON FOR HEADERS ─── */
function ExportButton() {
  return (
    <Tooltip title="Download as PDF" arrow>
      <span className="no-print" style={{ display: "inline-flex" }}>
        <IconButton
          size="small"
          onClick={_printPage}
          aria-label="Download as PDF"
          sx={{
            width: 34,
            height: 34,
            borderRadius: "16px",
            border: 1,
            borderColor: "primary.main",
            backgroundColor: "primary.main",
            color: "primary.contrastText",
            boxShadow: "0 1px 3px rgba(0,0,0,.12)",
            "&:hover": {
              backgroundColor: "primary.main",
              borderColor: "primary.main",
            },
          }}
        >
          <FileDownloadOutlinedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

function PcrOnlyBadge() {
  return (
    <Tooltip title="Banmore plant produces PCR only" arrow>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: C.tl,
          border: "1px solid " + C.tl,
          background: C.c2,
          padding: "4px 8px",
          borderRadius: 8,
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          height: 22,
        }}
      >
        PCR ONLY
      </span>
    </Tooltip>
  );
}

/* ─── USER MENU (avatar dropdown + sub-modals) ─── */
const USER_PROFILES = {
  PH: {
    name: "Rajesh Sharma",
    role: "Plant Head",
    email: "rajesh.sharma@jktyre.in",
    phone: "+91 98230 12345",
    joined: "Jan 2018",
  },
  QH: {
    name: "Anjali Verma",
    role: "Quality Head",
    email: "anjali.verma@jktyre.in",
    phone: "+91 98230 67890",
    joined: "Mar 2020",
  },
  EH: {
    name: "Vikram Mehta",
    role: "Engineering Head",
    email: "vikram.mehta@jktyre.in",
    phone: "+91 98230 33456",
    joined: "Aug 2016",
  },
};
function UserModal({ title, icon, onClose, children }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fadeIn .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          borderRadius: 12,
          maxWidth: 480,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
          border: "1px solid " + C.bd,
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid " + C.bd,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 21 }}>{icon}</span>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.tx }}>
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid " + C.bd,
              background: C.c2,
              color: C.mu,
              fontSize: 19,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            {"✕"}
          </button>
        </div>
        <div style={{ padding: "16px 18px" }}>{children}</div>
      </div>
    </div>
  );
}
function ProfileModal({ user, plant, onClose }) {
  const rows = [
    { l: "Name", v: user.name },
    { l: "Role", v: user.role },
    { l: "Plant", v: plant ? plant.name : "—" },
    { l: "Email", v: user.email },
    { l: "Phone", v: user.phone },
    { l: "Joined", v: user.joined },
    {
      l: "Employee ID",
      v:
        "JK-" +
        (user.role === "Plant Head"
          ? "PH"
          : user.role === "Quality Head"
            ? "QH"
            : "EH") +
        "-04217",
    },
  ];
  return (
    <UserModal title="My Profile" icon={"\u{1F464}"} onClose={onClose}>
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          paddingBottom: 14,
          borderBottom: "1px solid " + C.bd,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: user.bgC,
            border: "1px solid " + user.bdC,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 23,
            fontWeight: 700,
            color: user.fgC,
          }}
        >
          {user.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: C.tx }}>
            {user.name}
          </div>
          <div style={{ fontSize: 14, color: C.mu, marginTop: 2 }}>
            {user.role}
            {plant ? " · " + plant.name : ""}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          rowGap: 8,
          columnGap: 10,
          fontSize: 15,
        }}
      >
        {rows.map((r, i) => (
          <Fragment key={i}>
            <div
              style={{
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                fontSize: 12,
                letterSpacing: ".4px",
                alignSelf: "center",
              }}
            >
              {r.l}
            </div>
            <div style={{ color: C.tx, fontWeight: 500 }}>{r.v}</div>
          </Fragment>
        ))}
      </div>
      <button
        style={{
          marginTop: 16,
          padding: "7px 14px",
          border: "1px solid " + C.ac,
          borderRadius: 6,
          background: C.aL,
          color: C.ac,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Edit Profile
      </button>
    </UserModal>
  );
}
function PasswordModal({ onClose }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [msg, setMsg] = useState(null);
  const submit = () => {
    if (!cur || !nw || !cf) {
      setMsg({ t: "All fields required", ok: false });
      return;
    }
    if (nw !== cf) {
      setMsg({ t: "New passwords don't match", ok: false });
      return;
    }
    if (nw.length < 8) {
      setMsg({ t: "Password must be at least 8 characters", ok: false });
      return;
    }
    setMsg({ t: "Password updated successfully", ok: true });
    setCur("");
    setNw("");
    setCf("");
  };
  const fld = (lab, val, setVal) => (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 12,
          color: C.mu,
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 4,
          letterSpacing: ".4px",
        }}
      >
        {lab}
      </div>
      <input
        type="password"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          border: "1px solid " + C.bd,
          borderRadius: 6,
          fontSize: 15,
          boxSizing: "border-box",
          background: C.c2,
          color: C.tx,
          outline: "none",
        }}
      />
    </div>
  );
  return (
    <UserModal title="Change Password" icon={"\u{1F512}"} onClose={onClose}>
      {fld("Current Password", cur, setCur)}
      {fld("New Password", nw, setNw)}
      {fld("Confirm New Password", cf, setCf)}
      <div
        style={{
          fontSize: 13,
          color: C.mu,
          marginTop: -4,
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >
        Minimum 8 characters. Use a mix of letters, numbers, and symbols.
      </div>
      {msg && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 14,
            background: (msg.ok ? C.gn : C.rd) + "15",
            color: msg.ok ? C.gn : C.rd,
            border: "1px solid " + (msg.ok ? C.gn : C.rd) + "33",
            fontWeight: 600,
          }}
        >
          {msg.ok ? "✓ " : "⚠ "}
          {msg.t}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{
            padding: "7px 14px",
            border: "1px solid " + C.bd,
            borderRadius: 6,
            background: C.c2,
            color: C.md,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          style={{
            padding: "7px 14px",
            border: "1px solid " + C.ac,
            borderRadius: 6,
            background: C.ac,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Update Password
        </button>
      </div>
    </UserModal>
  );
}
function HelpModal({ onClose }) {
  const items = [
    { ic: "▸", t: "Click any KPI card to drill down to root-cause level" },
    {
      ic: "▸",
      t: "Click the trend icon on a KPI to see Daily / Monthly / Yearly trends",
    },
    {
      ic: "▸",
      t: "Use the PCR / TBR filter in the header to slice metrics by tyre type",
    },
    { ic: "▸", t: "Use Export PDF in the header to save the current page" },
    {
      ic: "▸",
      t: "Every card has a download icon (CSV for tables, PNG for charts)",
    },
    {
      ic: "▸",
      t: "Click section tabs (Mixing / TBM / Curing / Stock) to drill down by section",
    },
    { ic: "▸", t: "Banmore plant is PCR-only — filter is locked accordingly" },
  ];
  return (
    <UserModal title="Help" icon={"?"} onClose={onClose}>
      <div
        style={{ fontSize: 14, color: C.tx, marginBottom: 12, lineHeight: 1.5 }}
      >
        Quick guide to using the dashboard. For more help contact your system
        administrator.
      </div>
      <div
        style={{
          background: C.c2,
          borderRadius: 8,
          border: "1px solid " + C.bd,
          padding: "10px 12px",
        }}
      >
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              padding: "5px 0",
              fontSize: 14,
              color: C.tx,
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: C.ac, fontWeight: 700, flexShrink: 0 }}>
              {it.ic}
            </span>
            <span>{it.t}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: C.aL,
          borderRadius: 6,
          border: "1px solid " + C.aB,
          fontSize: 14,
          color: C.tx,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 700, color: C.ac, marginBottom: 4 }}>
          Need more help?
        </div>
        Contact IT Helpdesk at{" "}
        <span style={{ fontWeight: 600 }}>ext. 4242</span> or email{" "}
        <span style={{ fontWeight: 600 }}>helpdesk@jktyre.in</span>
      </div>
    </UserModal>
  );
}
function AboutModal({ onClose }) {
  return (
    <UserModal title="About" icon={"i"} onClose={onClose}>
      <div style={{ textAlign: "center", padding: "6px 0 18px" }}>
        <div
          style={{
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: ".8px",
            color: C.tx,
            textTransform: "uppercase",
          }}
        >
          ONE FACTORY ONE DASHBOARD
        </div>
        <div
          style={{
            fontSize: 14,
            color: C.mu,
            marginTop: 6,
            letterSpacing: ".4px",
            textTransform: "uppercase",
          }}
        >
          Manufacturing Operations Platform
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "110px 1fr",
          rowGap: 8,
          columnGap: 10,
          fontSize: 15,
          padding: "14px 0",
          borderTop: "1px solid " + C.bd,
          borderBottom: "1px solid " + C.bd,
        }}
      >
        {[
          ["Version", "v2.4.1"],
          ["Build", "2026.05.15"],
          ["Module", "Plant Operations"],
          ["Licensed to", "JK Tyre & Industries Ltd."],
          ["Support contact", "support@jktyre.in"],
        ].map((r, i) => (
          <Fragment key={i}>
            <div
              style={{
                color: C.mu,
                fontWeight: 600,
                textTransform: "uppercase",
                fontSize: 12,
                letterSpacing: ".4px",
                alignSelf: "center",
              }}
            >
              {r[0]}
            </div>
            <div style={{ color: C.tx, fontWeight: 500 }}>{r[1]}</div>
          </Fragment>
        ))}
      </div>
      <div
        style={{
          textAlign: "center",
          fontSize: 13,
          color: C.mu,
          marginTop: 14,
          lineHeight: 1.5,
        }}
      >
        © 2026 JK Tyre & Industries Ltd.
        <br />
        All rights reserved.
      </div>
    </UserModal>
  );
}
function UserMenu({ plant, role, onLogout }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [theme, setTheme] = useState("Light");
  const [themeOpen, setThemeOpen] = useState(false);
  const initials = role || "PH";
  const prof = USER_PROFILES[initials] || USER_PROFILES["PH"];
  const bgC =
    initials === "PH" ? C.aL : initials === "QH" ? C.tl + "18" : C.pp + "18";
  const bdC =
    initials === "PH" ? C.aB : initials === "QH" ? C.tl + "40" : C.pp + "40";
  const fgC = initials === "PH" ? C.ac : initials === "QH" ? C.tl : C.pp;
  const user = { ...prof, initials, bgC, bdC, fgC };
  const itemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 14px",
    border: "none",
    background: "transparent",
    width: "100%",
    textAlign: "left",
    fontSize: 15,
    color: C.tx,
    cursor: "pointer",
    fontWeight: 500,
  };
  const item = (icon, label, onClick, extra) => (
    <button
      onClick={onClick}
      style={itemStyle}
      onMouseOver={(e) => (e.currentTarget.style.background = C.c2)}
      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 16, width: 18, textAlign: "center" }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {extra}
    </button>
  );
  const close = () => {
    setOpen(false);
    setThemeOpen(false);
  };
  return (
    <>
      <div className="no-print" style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          title={user.name + " · " + user.role}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: bgC,
            border: "1px solid " + bdC,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            color: fgC,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {initials}
        </button>
        {open && (
          <>
            <div
              onClick={close}
              style={{ position: "fixed", inset: 0, zIndex: 300 }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                background: C.cd,
                border: "1px solid " + C.bd,
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                zIndex: 301,
                minWidth: 260,
                overflow: "hidden",
                animation: "fadeIn .15s ease",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid " + C.bd,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: bgC,
                    border: "1px solid " + bdC,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 700,
                    color: fgC,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: C.tx,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.mu,
                      marginTop: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.role}
                    {plant ? " · " + plant.name : ""}
                  </div>
                </div>
              </div>
              <div style={{ padding: "4px 0" }}>
                {item("\u{1F464}", "My Profile", () => {
                  setModal("profile");
                  close();
                })}
                {item("\u{1F512}", "Change Password", () => {
                  setModal("password");
                  close();
                })}
                <div style={{ position: "relative" }}>
                  {item(
                    "\u{1F3A8}",
                    "Theme",
                    () => setThemeOpen((o) => !o),
                    <span
                      style={{
                        fontSize: 14,
                        color: C.mu,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {theme}
                      <span style={{ fontSize: 12 }}>{"›"}</span>
                    </span>,
                  )}
                  {themeOpen && (
                    <div
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "100%",
                        background: C.cd,
                        border: "1px solid " + C.bd,
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,.12)",
                        zIndex: 302,
                        minWidth: 130,
                        padding: "4px 0",
                      }}
                    >
                      {["Light", "Dark", "System"].map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setTheme(t);
                            setThemeOpen(false);
                          }}
                          style={{
                            ...itemStyle,
                            padding: "7px 12px",
                            fontSize: 14,
                          }}
                          onMouseOver={(e) =>
                            (e.currentTarget.style.background = C.c2)
                          }
                          onMouseOut={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <span
                            style={{
                              width: 14,
                              color: t === theme ? C.ac : "transparent",
                            }}
                          >
                            {"✓"}
                          </span>
                          {t}
                          {t !== "Light" && (
                            <span
                              style={{
                                fontSize: 11,
                                color: C.mu,
                                marginLeft: "auto",
                              }}
                            >
                              soon
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {item("?", "Help", () => {
                  setModal("help");
                  close();
                })}
                {item("i", "About", () => {
                  setModal("about");
                  close();
                })}
              </div>
              <div style={{ borderTop: "1px solid " + C.bd, padding: "4px 0" }}>
                <button
                  onClick={() => {
                    close();
                    if (onLogout) onLogout();
                  }}
                  style={{ ...itemStyle, color: C.rd, fontWeight: 600 }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = C.rd + "10")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span
                    style={{ fontSize: 16, width: 18, textAlign: "center" }}
                  >
                    {"⏻"}
                  </span>
                  <span style={{ flex: 1 }}>Logout</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {modal === "profile" && (
        <ProfileModal
          user={user}
          plant={plant}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "password" && <PasswordModal onClose={() => setModal(null)} />}
      {modal === "help" && <HelpModal onClose={() => setModal(null)} />}
      {modal === "about" && <AboutModal onClose={() => setModal(null)} />}
    </>
  );
}

/* ─── MINI CONTROL CHART (SPC) ─── */
function ControlChart({ data, ucl, lcl, target, w = 240, h = 80 }) {
  const mn = Math.min(...data, lcl) - 0.05,
    mx = Math.max(...data, ucl) + 0.05,
    rn = mx - mn || 1;
  const yScale = (v) => h - ((v - mn) / rn) * (h - 10) - 5;
  const pts = data
    .map((v, i) => `${10 + (i / (data.length - 1)) * (w - 20)},${yScale(v)}`)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      style={{ background: C.c2, borderRadius: 4, border: "1px solid " + C.bd }}
    >
      <line
        x1="10"
        x2={w - 10}
        y1={yScale(ucl)}
        y2={yScale(ucl)}
        stroke={C.rd}
        strokeWidth="1"
        strokeDasharray="3,2"
      />
      <line
        x1="10"
        x2={w - 10}
        y1={yScale(lcl)}
        y2={yScale(lcl)}
        stroke={C.rd}
        strokeWidth="1"
        strokeDasharray="3,2"
      />
      <line
        x1="10"
        x2={w - 10}
        y1={yScale(target)}
        y2={yScale(target)}
        stroke={C.gn}
        strokeWidth="1"
        strokeDasharray="2,2"
      />
      <text
        x={w - 8}
        y={yScale(ucl) - 2}
        fontSize="7"
        fill={C.rd}
        textAnchor="end"
      >
        UCL {ucl}
      </text>
      <text
        x={w - 8}
        y={yScale(lcl) + 8}
        fontSize="7"
        fill={C.rd}
        textAnchor="end"
      >
        LCL {lcl}
      </text>
      <polyline points={pts} fill="none" stroke={C.bl} strokeWidth="1.5" />
      {data.map((v, i) => {
        const oob = v > ucl || v < lcl;
        return (
          <circle
            key={i}
            cx={10 + (i / (data.length - 1)) * (w - 20)}
            cy={yScale(v)}
            r="2.5"
            fill={oob ? C.rd : C.bl}
          >
            <title>{`Point ${i + 1}: ${v}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

const PROCESS_KPIS = [
  {
    id: "pqr",
    n: "PQR / Process Audit Rating",
    v: "82",
    u: "%",
    target: "90%",
    status: "Yellow",
    sp: [88, 85, 82, 80, 82],
    drill: "pqr",
  },
  {
    id: "audit",
    n: "Audit Compliance",
    v: "88",
    u: "%",
    target: "95%",
    status: "Yellow",
    sp: [92, 90, 89, 88, 88],
    drill: "audit",
  },
  {
    id: "mqv",
    n: "MQV (Major Quality Violation)",
    v: "15",
    u: "nos",
    target: "<5",
    status: "Red",
    sp: [5, 4, 6, 12, 15],
    drill: "mqv",
  },
  {
    id: "ndev",
    n: "Audit Deviation",
    v: "34",
    u: "nos",
    target: "trend",
    status: "Yellow",
    sp: [28, 30, 32, 33, 34],
    drill: "ndev",
  },
  {
    id: "cpc",
    n: "Critical Param. Compliance",
    v: "92",
    u: "%",
    target: "100%",
    status: "Yellow",
    sp: [95, 93, 92, 91, 92],
    drill: "cpc",
  },
  {
    id: "ftq",
    n: "FTQ",
    v: "95.1",
    u: "%",
    target: "99%",
    status: "Red",
    sp: [96.2, 95.9, 95.6, 95.3, 95.1],
    drill: "ftq",
  },
  {
    id: "spr",
    n: "SPR (Straight Pass Ratio)",
    v: "98.2",
    u: "%",
    target: "99%",
    status: "Yellow",
    sp: [98.5, 98.3, 98.2, 98, 98.2],
    drill: "spr",
  },
];

const LIVE_PROCESS_KPI_IDS = new Set(Object.keys(PROCESS_KPI_NAME));
const toNaKpi = (kpi) => ({
  ...kpi,
  v: "NA",
  u: "",
  target: null,
  status: null,
  sp: null,
  drill: null,
  manual: false,
  live: false,
  na: true,
});
const toPendingLiveKpi = (kpi) => ({
  ...kpi,
  v: "—",
  status: null,
  sp: null,
  live: false,
  na: false,
  trendApi: true,
  trendKpiName: PROCESS_KPI_NAME[kpi.id],
});
function processAccentColor(id, value) {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(n)) return "#9CA3AF";
  if (id === "mqv") return n < 5 ? C.gn : n <= 7 ? C.am : C.rd;
  if (id === "audit") return n >= 95 ? C.gn : n >= 80 ? C.am : C.rd;
  if (id === "pqr") return n >= 90 ? C.gn : n >= 80 ? C.am : C.rd;
  return "#9CA3AF";
}

const LIVE_PROCESS_DRILLS = {
  pqr: {
    title: "Process-wise Audit Rating",
    accent: C.ac,
    path: ["Process", "PQR Rating"],
    sectionKpis: ["Plant_quality_rating_s", "Total_Violations_s"],
    machineKpis: ["Plant_quality_rating_m", "Total_Violations_m"],
    columns: ["Process", "Rating %", "Violations", "Status"],
    row: (r) => [
      r.section,
      r.Plant_quality_rating_s == null ? "—" : r.Plant_quality_rating_s,
      r.Total_Violations_s ?? 0,
      <StatusPill
        status={
          (r.Plant_quality_rating_s ?? 0) < 80
            ? "Red"
            : (r.Plant_quality_rating_s ?? 0) < 88
              ? "Yellow"
              : "Green"
        }
      />,
    ],
    machineColumns: ["Machine", "Rating %", "Violations", "Status"],
    machineRow: (r) => [
      r.machine,
      r.Plant_quality_rating_m == null ? "—" : r.Plant_quality_rating_m,
      r.Total_Violations_m ?? 0,
      <StatusPill
        status={
          (r.Plant_quality_rating_m ?? 0) < 80
            ? "Red"
            : (r.Plant_quality_rating_m ?? 0) < 88
              ? "Yellow"
              : "Green"
        }
      />,
    ],
  },
  audit: {
    title: "Audit Compliance — Section-wise",
    accent: C.bl,
    path: ["Process", "Audit Compliance"],
    sectionKpis: ["Plan_Compliance_s"],
    machineKpis: ["Plan_Compliance_m"],
    columns: ["Process", "Compliance %", "Status"],
    row: (r) => [
      r.section,
      r.Plan_Compliance_s == null ? "—" : r.Plan_Compliance_s,
      <StatusPill
        status={
          (r.Plan_Compliance_s ?? 0) < 80
            ? "Red"
            : (r.Plan_Compliance_s ?? 0) < 95
              ? "Yellow"
              : "Green"
        }
      />,
    ],
    machineColumns: ["Machine", "Compliance %", "Status"],
    machineRow: (r) => [
      r.machine,
      r.Plan_Compliance_m == null ? "—" : r.Plan_Compliance_m,
      <StatusPill
        status={
          (r.Plan_Compliance_m ?? 0) < 80
            ? "Red"
            : (r.Plan_Compliance_m ?? 0) < 95
              ? "Yellow"
              : "Green"
        }
      />,
    ],
  },
  mqv: {
    title: "MQV — Violation Breakdown",
    accent: C.rd,
    path: ["Process", "MQV"],
    sectionKpis: [
      "Total_Violations_s",
      "Open_Violations_s",
      "Closed_Violation_s",
      "Violation_Closure_Rate_s",
    ],
    machineKpis: [
      "Total_Violations_m",
      "Open_Violations_m",
      "Closed_Violation_m",
      "Violation_Closure_Rate_m",
    ],
    columns: ["Process", "Total", "Open", "Closed", "Closure %"],
    row: (r) => [
      r.section,
      r.Total_Violations_s ?? 0,
      r.Open_Violations_s ?? 0,
      r.Closed_Violation_s ?? 0,
      r.Violation_Closure_Rate_s == null ? "—" : r.Violation_Closure_Rate_s,
    ],
    machineColumns: ["Machine", "Total", "Open", "Closed", "Closure %"],
    machineRow: (r) => [
      r.machine,
      r.Total_Violations_m ?? 0,
      r.Open_Violations_m ?? 0,
      r.Closed_Violation_m ?? 0,
      r.Violation_Closure_Rate_m == null ? "—" : r.Violation_Closure_Rate_m,
    ],
  },
};

function LiveProcessDrillPanel({ kpi, date, shift, granularity, summaryRows }) {
  const cfg = LIVE_PROCESS_DRILLS[kpi?.drill];
  const [sectionRows, setSectionRows] = useState([]);
  const [machineRows, setMachineRows] = useState([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [loading, setLoading] = useState(true);
  const [machineLoading, setMachineLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!cfg) return;
    let cancelled = false;
    setError(null);
    setSelectedSection("");
    setMachineRows([]);
    if (Array.isArray(summaryRows)) {
      setSectionRows(summaryRows);
      setLoading(false);
      return;
    }
    setLoading(true);
    getProcessKpiChildren({
      kpiNames: cfg.sectionKpis,
      date,
      shift,
      granularity,
    })
      .then((res) => {
        if (!cancelled)
          setSectionRows(Array.isArray(res?.rows) ? res.rows : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg, date, shift, granularity, summaryRows]);
  useEffect(() => {
    if (!cfg || !selectedSection) {
      setMachineRows([]);
      return;
    }
    let cancelled = false;
    setMachineLoading(true);
    getProcessKpiChildren({
      kpiNames: cfg.machineKpis,
      date,
      shift,
      granularity,
      section: selectedSection,
    })
      .then((res) => {
        if (!cancelled)
          setMachineRows(Array.isArray(res?.rows) ? res.rows : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setMachineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg, date, shift, granularity, selectedSection]);
  if (!cfg) return null;
  if (error)
    return (
      <Card title={cfg.title} accent={cfg.accent}>
        <div style={{ padding: 14, color: C.rd, fontSize: 13 }}>
          Drill fetch failed: {error.message || "Request failed"}
        </div>
      </Card>
    );
  const rowStyle = (active, i) => ({
    background: active ? C.bl + "10" : i % 2 === 0 ? C.cd : C.rowAlt,
    cursor: "pointer",
    outline: active ? "1px solid " + C.bl : "none",
  });
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Card title={cfg.title} accent={cfg.accent}>
        <Breadcrumb path={cfg.path} />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 8,
          }}
        >
          <a
            href="http://35.208.174.2:3001/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 6,
              border: "1px solid " + cfg.accent,
              background: cfg.accent + "12",
              color: cfg.accent,
              fontSize: 12.5,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {"↗"} Open Process Audit Logbook
          </a>
        </div>
        {loading ? (
          <QualityLoader minHeight={180} />
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid " + C.bd,
              borderRadius: 10,
              maxHeight: 320,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {cfg.columns.map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "center",
                        padding: "8px 10px",
                        color: C.tx,
                        background: C.thBg,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: ".6px",
                        borderBottom: "2px solid " + C.bd,
                        borderRight:
                          i === cfg.columns.length - 1
                            ? "none"
                            : "1px solid " + C.bd,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectionRows.map((r, i) => {
                  const active = selectedSection === r.section;
                  return (
                    <tr
                      key={r.section || i}
                      onClick={() =>
                        setSelectedSection(active ? "" : r.section)
                      }
                      style={rowStyle(active, i)}
                    >
                      {cfg.row(r).map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: "8px 10px",
                            borderBottom: "1px solid " + C.bd,
                            borderRight:
                              ci === cfg.row(r).length - 1
                                ? "none"
                                : "1px solid " + C.bd,
                            textAlign: "center",
                            fontWeight: active || ci === 0 ? 700 : 400,
                            color: active && ci === 0 ? C.bl : C.tx,
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !sectionRows.length && (
          <div
            style={{
              padding: 12,
              textAlign: "center",
              color: C.mu,
              fontSize: 13,
            }}
          >
            No rows for this date / shift.
          </div>
        )}
        <div style={{ fontSize: 12, color: C.mu, marginTop: 6 }}>
          Click a process to view its machine-level rows.
        </div>
      </Card>
      {selectedSection && (
        <Card title={`${selectedSection} — Machine Level`} accent={cfg.accent}>
          <Breadcrumb path={[...cfg.path, selectedSection, "Machines"]} />
          {machineLoading ? (
            <QualityLoader minHeight={180} />
          ) : (
            <DTable
              cols={cfg.machineColumns}
              rows={machineRows.map(cfg.machineRow)}
            />
          )}
          {!machineLoading && !machineRows.length && (
            <div
              style={{
                padding: 12,
                textAlign: "center",
                color: C.mu,
                fontSize: 13,
              }}
            >
              No machine-level rows for {selectedSection}.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ProcessDrillPanel({
  kpi,
  sub,
  setSub,
  onOpenSPC,
  date,
  shift,
  granularity,
  processSummary,
}) {
  if (!kpi) return null;
  if (LIVE_PROCESS_DRILLS[kpi.drill]) {
    return (
      <LiveProcessDrillPanel
        kpi={kpi}
        date={date}
        shift={shift}
        granularity={granularity}
        summaryRows={processSummary?.children?.[kpi.drill]?.rows}
      />
    );
  }
  return (
    <Card title={`${kpi.n} — Drilldown`} accent={C.mu}>
      <div style={{ padding: 14, color: C.mu, fontSize: 13 }}>
        Drilldown is not available because this KPI is not API-backed.
      </div>
    </Card>
  );

  if (kpi.drill === "pqr") {
    const procs = [
      {
        p: "RMS (Raw Material Store)",
        sch: 4,
        comp: 4,
        rt: 88,
        vio: 2,
        st: "Yellow",
      },
      {
        p: "Autochemical / Weighing",
        sch: 4,
        comp: 4,
        rt: 92,
        vio: 1,
        st: "Green",
      },
      { p: "Mixing (Banbury)", sch: 5, comp: 5, rt: 90, vio: 2, st: "Green" },
      { p: "Stock Preparation", sch: 4, comp: 4, rt: 85, vio: 3, st: "Yellow" },
      { p: "Building (TBM)", sch: 4, comp: 3, rt: 82, vio: 4, st: "Yellow" },
      { p: "Curing", sch: 5, comp: 5, rt: 70, vio: 8, st: "Red" },
      {
        p: "Uniformity / Finishing",
        sch: 4,
        comp: 4,
        rt: 86,
        vio: 3,
        st: "Yellow",
      },
      {
        p: "Final Inspection / PDI",
        sch: 3,
        comp: 3,
        rt: 91,
        vio: 1,
        st: "Green",
      },
    ];
    const checklist = [
      {
        pt: "Dirty sidewall — visual",
        mc: "Press-12",
        aud: "R.Kumar",
        ae: "S.Singh",
        sh: "B",
        sev: "Major",
        nc: "NC-2451",
        capa: "Open",
      },
      {
        pt: "Cure time deviation > ±5sec",
        mc: "Press-08",
        aud: "R.Kumar",
        ae: "M.Verma",
        sh: "B",
        sev: "Major",
        nc: "NC-2452",
        capa: "Open",
      },
      {
        pt: "Mould temperature drift",
        mc: "Press-12",
        aud: "V.Patel",
        ae: "S.Singh",
        sh: "C",
        sev: "Minor",
        nc: "NC-2453",
        capa: "Closed",
      },
      {
        pt: "Bladder pressure low",
        mc: "Press-15",
        aud: "V.Patel",
        ae: "R.Yadav",
        sh: "A",
        sev: "Major",
        nc: "NC-2454",
        capa: "Open",
      },
      {
        pt: "Tyre handling SOP not followed",
        mc: "Press-08",
        aud: "R.Kumar",
        ae: "M.Verma",
        sh: "B",
        sev: "Minor",
        nc: "NC-2455",
        capa: "Closed",
      },
    ];
    const selProc = sub.split(":")[0];
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="Process-wise Audit Rating" accent={C.ac}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 8,
            }}
          >
            <a
              href="http://35.208.174.2:3001/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid " + C.ac,
                background: C.ac + "12",
                color: C.ac,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {"↗"} Open Process Audit Logbook
            </a>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Process
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Scheduled
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Completed
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Rating
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Violations
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {procs.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => setSub(selProc === r.p ? "" : r.p)}
                    style={{
                      background:
                        selProc === r.p ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                      cursor: "pointer",
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        fontWeight: selProc === r.p ? 700 : 400,
                        color: selProc === r.p ? C.ac : C.tx,
                      }}
                    >
                      {r.p}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.sch}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.comp}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        fontWeight: 700,
                        color: r.rt < 80 ? C.rd : r.rt < 88 ? C.am : C.gn,
                      }}
                    >
                      {r.rt}%
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.vio}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "center",
                      }}
                    >
                      <StatusPill status={r.st} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.mu, marginTop: 6 }}>
            {
              "Ratings fetched from the Process Audit Logbook (actual recorded audit ratings per area). "
            }
            {"▸"} Click any process row to view its audited checkpoints.
          </div>
        </Card>
        {selProc && (
          <Card title={"Audit Checklist — " + selProc} accent={C.rd}>
            <Breadcrumb
              path={["Process", "PQR Rating", selProc, "Failed Checkpoints"]}
            />
            <DTable
              cols={[
                "Failed Checkpoint",
                "Machine",
                "Auditor",
                "Auditee",
                "Shift",
                "Severity",
                "NC #",
                "CAPA",
              ]}
              rows={checklist
                .filter(() => selProc === "Curing" || selProc === "Building")
                .map((c) => [
                  c.pt,
                  c.mc,
                  c.aud,
                  c.ae,
                  c.sh,
                  c.sev,
                  c.nc,
                  <StatusPill status={c.capa} />,
                ])}
            />
            {selProc !== "Curing" && selProc !== "Building" && (
              <div
                style={{
                  padding: 12,
                  textAlign: "center",
                  color: C.mu,
                  fontSize: 14,
                }}
              >
                No failed checkpoints for this process. Rating is satisfactory.
              </div>
            )}
          </Card>
        )}
      </div>
    );
  }

  if (kpi.drill === "audit") {
    const procs = [
      { p: "Mixing", sch: 5, comp: 5, pn: 0, cmp: "100%", aud: "R.Kumar" },
      { p: "Stock", sch: 4, comp: 4, pn: 0, cmp: "100%", aud: "V.Patel" },
      { p: "Curing", sch: 5, comp: 4, pn: 1, cmp: "80%", aud: "R.Kumar" },
      { p: "Building", sch: 4, comp: 3, pn: 1, cmp: "75%", aud: "V.Patel" },
      { p: "Uniformity", sch: 3, comp: 2, pn: 1, cmp: "66.7%", aud: "S.Mehta" },
    ];
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card
          title="Audit Compliance — Process-wise Schedule vs Actual"
          accent={C.bl}
        >
          <Breadcrumb path={["Process", "Audit Compliance"]} />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 8,
            }}
          >
            <a
              href="http://35.208.174.2:3001/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid " + C.bl,
                background: C.bl + "12",
                color: C.bl,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {"↗"} Open Process Audit Logbook
            </a>
          </div>
          <DTable
            cols={[
              "Process",
              "Scheduled",
              "Completed",
              "Pending",
              "Compliance %",
              "Auditor",
            ]}
            rows={procs.map((r) => [r.p, r.sch, r.comp, r.pn, r.cmp, r.aud])}
          />
        </Card>
      </div>
    );
  }

  if (kpi.drill === "mqv") {
    const procs = [
      { p: "Curing", mqv: 8, top: "Dirty sidewall", op: 3, cl: 5 },
      { p: "Mixing", mqv: 4, top: "Parameter out of range", op: 2, cl: 2 },
      { p: "Building", mqv: 3, top: "Visual issue", op: 1, cl: 2 },
    ];
    const capa = [
      {
        id: "NC-2451",
        p: "Curing",
        vio: "Dirty sidewall",
        rc: "Mould cleaning frequency low",
        ww: "5-Why pending",
        ca: "Increase cleaning to 2x/shift",
        pa: "Add SOP + visual check",
        own: "S.Singh",
        dd: "15-04-2026",
        st: "Open",
      },
      {
        id: "NC-2454",
        p: "Curing",
        vio: "Bladder pressure low",
        rc: "Pressure regulator drift",
        ww: "Completed",
        ca: "Replace regulator",
        pa: "Calibration plan",
        own: "R.Yadav",
        dd: "12-04-2026",
        st: "Open",
      },
      {
        id: "NC-2378",
        p: "Mixing",
        vio: "Dump temp >45°C",
        rc: "Cooling water temp high",
        ww: "Completed",
        ca: "Chiller maintenance",
        pa: "Daily temp log",
        own: "M.Sharma",
        dd: "08-04-2026",
        st: "Closed",
      },
    ];
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="MQV — Daily Trend & Spike Analysis" accent={C.rd}>
          <Breadcrumb path={["Process", "MQV", "Daily Spike"]} />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 8,
            }}
          >
            <a
              href="http://35.208.174.2:3001/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid " + C.rd,
                background: C.rd + "12",
                color: C.rd,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {"↗"} Open Process Audit Logbook
            </a>
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: C.mu }}>Today</div>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.rd }}>
                15
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.mu }}>Normal Avg</div>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.tx }}>
                5
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.mu }}>Spike</div>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.rd }}>
                +200%
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <Spark data={[5, 4, 6, 12, 15]} color={C.rd} w={140} h={32} />
            </div>
          </div>
          <DTable
            cols={[
              "Process",
              "MQV Count",
              "Top Violation",
              "CAPA Open",
              "CAPA Closed",
            ]}
            rows={procs.map((p) => [p.p, p.mqv, p.top, p.op, p.cl])}
          />
        </Card>
        <Card title="Open CAPA Details — Curing Process" accent={C.am}>
          <DTable
            cols={[
              "NC #",
              "Violation",
              "Root Cause",
              "5-Why",
              "Corrective Action",
              "Owner",
              "Due",
              "Status",
            ]}
            rows={capa.map((c) => [
              c.id,
              c.vio,
              c.rc,
              c.ww,
              c.ca,
              c.own,
              c.dd,
              <StatusPill status={c.st} />,
            ])}
          />
        </Card>
      </div>
    );
  }

  if (kpi.drill === "spc") {
    const projs = [
      {
        mc: "Quintoplex",
        sz: "145/13",
        pm: "Width",
        cp: 1.1,
        cpk: 1.05,
        st: "Red",
      },
      {
        mc: "Extruder-2",
        sz: "165/14",
        pm: "Tread Weight",
        cp: 1.18,
        cpk: 1.12,
        st: "Red",
      },
      {
        mc: "Banbury-2",
        sz: "All",
        pm: "Mooney Visc.",
        cp: 1.15,
        cpk: 1.08,
        st: "Red",
      },
      {
        mc: "Press-12",
        sz: "175/15",
        pm: "Cure Time",
        cp: 1.25,
        cpk: 1.22,
        st: "Yellow",
      },
      {
        mc: "UF-01",
        sz: "145/13",
        pm: "RFV",
        cp: 1.28,
        cpk: 1.24,
        st: "Yellow",
      },
    ];
    const selMc = sub;
    const ctlData = [
      8.45, 8.52, 8.48, 8.41, 8.55, 8.62, 8.38, 8.58, 8.65, 8.42, 8.51, 8.48,
    ];
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="SPC Health Board" accent={C.ac}>
          <Breadcrumb path={["Process", "SPC Health"]} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                background: C.c2,
                borderRadius: 6,
                border: "1px solid " + C.bd,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.mu,
                  textTransform: "uppercase",
                  letterSpacing: ".4px",
                }}
              >
                Total Projects
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.tx }}>
                60
              </div>
            </div>
            <div
              style={{
                padding: "10px 12px",
                background: C.gn + "12",
                borderRadius: 6,
                border: "1px solid " + C.gn + "33",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.gn,
                  textTransform: "uppercase",
                  letterSpacing: ".4px",
                  fontWeight: 700,
                }}
              >
                Green (Cp/Cpk ≥1.3)
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.gn }}>
                50
              </div>
            </div>
            <div
              style={{
                padding: "10px 12px",
                background: C.am + "12",
                borderRadius: 6,
                border: "1px solid " + C.am + "33",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.am,
                  textTransform: "uppercase",
                  letterSpacing: ".4px",
                  fontWeight: 700,
                }}
              >
                Yellow (~1.22)
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.am }}>
                5
              </div>
            </div>
            <div
              style={{
                padding: "10px 12px",
                background: C.rd + "12",
                borderRadius: 6,
                border: "1px solid " + C.rd + "33",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: C.rd,
                  textTransform: "uppercase",
                  letterSpacing: ".4px",
                  fontWeight: 700,
                }}
              >
                Red (≤1.16)
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.rd }}>
                5
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.md,
              marginBottom: 6,
            }}
          >
            Red Projects (Click to view Control Chart)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Machine
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Size
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Parameter
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Cp
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Cpk
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {projs.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => setSub(selMc === r.mc ? "" : r.mc)}
                    style={{
                      background:
                        selMc === r.mc ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                      cursor: "pointer",
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        fontWeight: selMc === r.mc ? 700 : 400,
                        color: selMc === r.mc ? C.ac : C.tx,
                      }}
                    >
                      {r.mc}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {r.sz}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {r.pm}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        fontWeight: 700,
                        color: r.cp < 1.16 ? C.rd : r.cp < 1.3 ? C.am : C.gn,
                      }}
                    >
                      {r.cp}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        fontWeight: 700,
                        color: r.cpk < 1.16 ? C.rd : r.cpk < 1.3 ? C.am : C.gn,
                      }}
                    >
                      {r.cpk}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "center",
                      }}
                    >
                      <StatusPill status={r.st} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {selMc && (
          <Card title={"Control Chart — " + selMc} accent={C.bl}>
            <Breadcrumb path={["Process", "SPC", "Red Projects", selMc]} />
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <ControlChart
                data={ctlData}
                ucl={8.6}
                lcl={8.4}
                target={8.5}
                w={320}
                h={100}
              />
              <div style={{ fontSize: 13, color: C.md, lineHeight: 1.6 }}>
                <div>
                  <span style={{ color: C.mu }}>Last 12 readings shown</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 2,
                      background: C.rd,
                      marginRight: 4,
                    }}
                  />
                  UCL / LCL limits
                </div>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 2,
                      background: C.gn,
                      marginRight: 4,
                    }}
                  />
                  Target line
                </div>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: C.rd,
                      marginRight: 4,
                      verticalAlign: "middle",
                    }}
                  />
                  Out-of-control point
                </div>
                <div
                  style={{
                    marginTop: 6,
                    padding: "6px 8px",
                    background: C.rd + "12",
                    borderRadius: 4,
                    color: C.rd,
                    fontSize: 12,
                  }}
                >
                  2 OOC points detected. Action required.
                </div>
                {onOpenSPC && (
                  <button
                    onClick={() => onOpenSPC(selMc)}
                    style={{
                      marginTop: 10,
                      padding: "7px 14px",
                      borderRadius: 6,
                      border: "1px solid " + C.pp,
                      background: C.pp + "12",
                      color: C.pp,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {"∿"} Open in SPC tab {"→"}
                  </button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (kpi.drill === "ndev") {
    const nd = [
      {
        pr: "Mixing (Banbury)",
        pm: "Dump Temperature",
        dev: "+3.8°C (within action band)",
        cnt: 9,
        disp: "Flag — notify process",
        st: "Yellow",
      },
      {
        pr: "Stock",
        pm: "Tread Weight",
        dev: "+1.2% (< reject limit)",
        cnt: 7,
        disp: "Flag — monitor",
        st: "Yellow",
      },
      {
        pr: "Curing",
        pm: "Cure Time",
        dev: "±4 sec (< ±5 spec)",
        cnt: 8,
        disp: "Observation",
        st: "Green",
      },
      {
        pr: "Curing",
        pm: "Mould Temperature",
        dev: "±2°C drift",
        cnt: 5,
        disp: "Observation",
        st: "Green",
      },
      {
        pr: "Mixing (Banbury)",
        pm: "Specific Gravity",
        dev: "±0.01",
        cnt: 5,
        disp: "Observation",
        st: "Green",
      },
    ];
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card
          title="Audit Deviation — minor process variation (non-MQV)"
          accent={C.am}
        >
          <Breadcrumb path={["Process", "Audit Deviation"]} />
          <div
            style={{
              padding: "8px 12px",
              background: C.bl + "0E",
              border: "1px solid " + C.bl + "33",
              borderRadius: 6,
              fontSize: 12.5,
              color: C.md,
              marginBottom: 10,
            }}
          >
            {
              "Tracked separately from MQV. These are deviations within the action/observation band — handled by flag & notify, not batch hold or escalation. Only deviations with confirmed product impact are promoted to an MQV."
            }
          </div>
          <DTable
            cols={["Process", "Parameter", "Deviation", "Count", "Status"]}
            rows={nd.map((r) => {
              const dc = r.st === "Green" ? C.gn : C.am;
              return [
                r.pr,
                r.pm,
                r.dev,
                r.cnt,
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: dc + "18",
                    color: dc,
                  }}
                >
                  {r.disp}
                </span>,
              ];
            })}
          />
          <div style={{ fontSize: 12, color: C.mu, marginTop: 6 }}>
            {"Total " +
              nd.reduce((a, r) => a + r.cnt, 0) +
              " normal deviations this period — for trend awareness. See the MQV card for major violations requiring analysis & CAPA."}
          </div>
        </Card>
      </div>
    );
  }

  if (kpi.drill === "cpc") {
    const params = [
      {
        pr: "Mixing",
        pm: "Dump Temperature",
        ac: "50°C",
        lm: "45°C",
        mc: "Banbury-2",
        bt: "B-2851",
        st: "Red",
      },
      {
        pr: "Mixing",
        pm: "Mooney Viscosity",
        ac: "65",
        lm: "60-70",
        mc: "Banbury-1",
        bt: "B-2852",
        st: "Green",
      },
      {
        pr: "Mixing",
        pm: "Specific Gravity",
        ac: "1.18",
        lm: "1.15-1.20",
        mc: "Banbury-3",
        bt: "B-2853",
        st: "Green",
      },
      {
        pr: "Curing",
        pm: "Cure Time Dev.",
        ac: "±7sec",
        lm: "±5sec",
        mc: "Press-08",
        bt: "Lot-441",
        st: "Red",
      },
      {
        pr: "Curing",
        pm: "Mould Temp.",
        ac: "178°C",
        lm: "175-185",
        mc: "Press-12",
        bt: "Lot-442",
        st: "Green",
      },
      {
        pr: "Stock",
        pm: "Tread Weight",
        ac: "2.85kg",
        lm: "2.80-2.90",
        mc: "Extruder-2",
        bt: "Roll-156",
        st: "Yellow",
      },
    ];
    const selPm = sub;
    const batchData = {
      "Dump Temperature": [
        {
          bt: "B-2851",
          mc: "Banbury-2",
          ac: "50.2°C",
          lm: "45°C",
          dev: "+5.2",
          sh: "B",
          st: "Flagged",
        },
        {
          bt: "B-2848",
          mc: "Banbury-2",
          ac: "49.5°C",
          lm: "45°C",
          dev: "+4.5",
          sh: "A",
          st: "Flagged",
        },
        {
          bt: "B-2845",
          mc: "Banbury-2",
          ac: "48.8°C",
          lm: "45°C",
          dev: "+3.8",
          sh: "A",
          st: "Released",
        },
        {
          bt: "B-2842",
          mc: "Banbury-2",
          ac: "47.2°C",
          lm: "45°C",
          dev: "+2.2",
          sh: "C",
          st: "Released",
        },
      ],
      "Cure Time Dev.": [
        {
          bt: "Lot-441",
          mc: "Press-08",
          ac: "+7sec",
          lm: "±5sec",
          dev: "+2",
          sh: "B",
          st: "Flagged",
        },
        {
          bt: "Lot-440",
          mc: "Press-08",
          ac: "+6.5sec",
          lm: "±5sec",
          dev: "+1.5",
          sh: "B",
          st: "Under Review",
        },
        {
          bt: "Lot-438",
          mc: "Press-08",
          ac: "+5.8sec",
          lm: "±5sec",
          dev: "+0.8",
          sh: "A",
          st: "Released",
        },
      ],
      "Tread Weight": [
        {
          bt: "Roll-156",
          mc: "Extruder-2",
          ac: "2.85kg",
          lm: "2.80-2.90",
          dev: "OK edge",
          sh: "B",
          st: "Released",
        },
        {
          bt: "Roll-154",
          mc: "Extruder-2",
          ac: "2.91kg",
          lm: "2.80-2.90",
          dev: "+0.01",
          sh: "A",
          st: "Under Review",
        },
      ],
    };
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="Critical Process Parameter Compliance" accent={C.am}>
          <Breadcrumb path={["Process", "Critical Parameter Compliance"]} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12, color: C.mu }}>
              {
                "Audited via random sampling — values sourced from the Process Audit Logbook."
              }
            </span>
            <a
              href="http://35.208.174.2:3001/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid " + C.am,
                background: C.am + "12",
                color: C.am,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {"↗"} Open Process Audit Logbook
            </a>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Process",
                    "Parameter",
                    "Actual",
                    "Limit",
                    "Machine",
                    "Batch",
                    "Status",
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign:
                          i < 2 ? "left" : i === 6 ? "center" : "right",
                        padding: "5px 8px",
                        color: C.mu,
                        fontWeight: 600,
                        borderBottom: "1px solid " + C.bd,
                        fontSize: 13,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {params.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() =>
                      r.st !== "Green" && setSub(selPm === r.pm ? "" : r.pm)
                    }
                    style={{
                      background:
                        selPm === r.pm ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                      cursor: r.st !== "Green" ? "pointer" : "default",
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        fontWeight: selPm === r.pm ? 700 : 400,
                        color: selPm === r.pm ? C.ac : C.tx,
                      }}
                    >
                      {r.pr}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {r.pm}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        fontWeight: 700,
                        color:
                          r.st === "Red"
                            ? C.rd
                            : r.st === "Yellow"
                              ? C.am
                              : C.gn,
                      }}
                    >
                      {r.ac}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        color: C.mu,
                      }}
                    >
                      {r.lm}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.mc}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.bt}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "center",
                      }}
                    >
                      <StatusPill status={r.st} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.am, marginTop: 6 }}>
            {"▸"} Click a red/yellow parameter to view its randomly-sampled
            batch readings and flag status
          </div>
        </Card>
        {selPm && batchData[selPm] && (
          <Card title={"Batch-level OOL Values — " + selPm} accent={C.rd}>
            <Breadcrumb
              path={["Process", "Critical Parameter", selPm, "Batches"]}
            />
            <DTable
              cols={[
                "Batch",
                "Machine",
                "Actual",
                "Limit",
                "Deviation",
                "Shift",
                "Status",
              ]}
              rows={batchData[selPm].map((b) => {
                const dc =
                  b.st === "Released"
                    ? C.gn
                    : b.st === "Under Review"
                      ? C.bl
                      : C.am;
                return [
                  b.bt,
                  b.mc,
                  b.ac,
                  b.lm,
                  b.dev,
                  b.sh,
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: dc + "18",
                      color: dc,
                    }}
                  >
                    {b.st}
                  </span>,
                ];
              })}
            />
            <div
              style={{
                marginTop: 8,
                padding: "6px 10px",
                background: C.am + "12",
                borderRadius: 4,
                fontSize: 12.5,
                color: C.am,
              }}
            >
              {batchData[selPm].filter((b) => b.st !== "Released").length +
                " parameter deviation(s) flagged — process owner notified. Per SOP, Quality does not hold batches on a parameter deviation alone; disposition is flag & review, escalating to MQV only if product impact is confirmed."}
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (kpi.drill === "ftq") {
    const RECIPES = [
      {
        k: "ULTIMA NEO|145/13",
        r: "ULTIMA NEO",
        size: "145/13",
        seg: "PCR",
        prod: 2000,
        camo: 28,
        scrap: 84,
        buff: 18,
      },
      {
        k: "ULTIMA|165/14",
        r: "ULTIMA",
        size: "165/14",
        seg: "PCR",
        prod: 1500,
        camo: 15,
        scrap: 42,
        buff: 12,
      },
      {
        k: "ULTIMA SPORT|175/15",
        r: "ULTIMA SPORT",
        size: "175/15",
        seg: "PCR",
        prod: 1800,
        camo: 12,
        scrap: 27,
        buff: 9,
      },
      {
        k: "ULTIMA SPORT|185/15",
        r: "ULTIMA SPORT",
        size: "185/15",
        seg: "PCR",
        prod: 1200,
        camo: 14,
        scrap: 37,
        buff: 10,
      },
      {
        k: "XM2|10.00R20",
        r: "XM2",
        size: "10.00R20",
        seg: "TBR",
        prod: 900,
        camo: 10,
        scrap: 36,
        buff: 8,
      },
      {
        k: "JUC|11.00R20",
        r: "JUC",
        size: "11.00R20",
        seg: "TBR",
        prod: 700,
        camo: 6,
        scrap: 20,
        buff: 5,
      },
    ];
    const MC_BY_RECIPE = {
      "ULTIMA NEO|145/13": [
        {
          mc: "Press-08",
          camo: 15,
          scrap: 46,
          buff: 9,
          rsn: "Under-cure",
          tm: "02:30 AM",
        },
        {
          mc: "Press-12",
          camo: 8,
          scrap: 24,
          buff: 6,
          rsn: "Blow",
          tm: "03:45 AM",
        },
        {
          mc: "Press-15",
          camo: 5,
          scrap: 14,
          buff: 3,
          rsn: "Sidewall mark",
          tm: "14:30 PM",
        },
      ],
      "ULTIMA|165/14": [
        {
          mc: "Press-08",
          camo: 5,
          scrap: 18,
          buff: 5,
          rsn: "Under-cure",
          tm: "06:15 AM",
        },
        {
          mc: "Press-12",
          camo: 6,
          scrap: 14,
          buff: 4,
          rsn: "Cosmetic",
          tm: "08:20 AM",
        },
        {
          mc: "Press-15",
          camo: 4,
          scrap: 10,
          buff: 3,
          rsn: "Mould residue",
          tm: "05:45 AM",
        },
      ],
      "ULTIMA SPORT|175/15": [
        {
          mc: "Press-12",
          camo: 5,
          scrap: 12,
          buff: 4,
          rsn: "Blow",
          tm: "12:00 PM",
        },
        {
          mc: "Press-15",
          camo: 4,
          scrap: 9,
          buff: 3,
          rsn: "Mould wear",
          tm: "09:30 AM",
        },
        {
          mc: "Press-19",
          camo: 3,
          scrap: 6,
          buff: 2,
          rsn: "Cosmetic",
          tm: "13:00 PM",
        },
      ],
      "ULTIMA SPORT|185/15": [
        {
          mc: "Press-12",
          camo: 6,
          scrap: 18,
          buff: 5,
          rsn: "Blow",
          tm: "04:20 AM",
        },
        {
          mc: "Press-15",
          camo: 5,
          scrap: 11,
          buff: 3,
          rsn: "Mould wear",
          tm: "10:15 AM",
        },
        {
          mc: "Press-19",
          camo: 3,
          scrap: 8,
          buff: 2,
          rsn: "Cosmetic",
          tm: "15:40 PM",
        },
      ],
      "XM2|10.00R20": [
        {
          mc: "Press-21",
          camo: 7,
          scrap: 22,
          buff: 5,
          rsn: "Under-cure",
          tm: "03:00 AM",
        },
        {
          mc: "Press-22",
          camo: 3,
          scrap: 14,
          buff: 3,
          rsn: "Blow",
          tm: "11:00 AM",
        },
      ],
      "JUC|11.00R20": [
        {
          mc: "Press-22",
          camo: 4,
          scrap: 13,
          buff: 3,
          rsn: "Bare",
          tm: "04:00 AM",
        },
        {
          mc: "Press-21",
          camo: 2,
          scrap: 7,
          buff: 2,
          rsn: "Cosmetic",
          tm: "13:00 PM",
        },
      ],
    };
    const MACHINES = [
      {
        mc: "Press-08",
        prod: 1500,
        camo: 20,
        scrap: 64,
        buff: 14,
        rsn: "Under-cure",
      },
      {
        mc: "Press-12",
        prod: 1800,
        camo: 25,
        scrap: 68,
        buff: 19,
        rsn: "Blow",
      },
      {
        mc: "Press-15",
        prod: 1600,
        camo: 18,
        scrap: 44,
        buff: 12,
        rsn: "Mould wear",
      },
      {
        mc: "Press-19",
        prod: 900,
        camo: 6,
        scrap: 14,
        buff: 4,
        rsn: "Cosmetic",
      },
      {
        mc: "Press-21",
        prod: 1300,
        camo: 9,
        scrap: 29,
        buff: 7,
        rsn: "Under-cure",
      },
      { mc: "Press-22", prod: 1000, camo: 7, scrap: 27, buff: 6, rsn: "Blow" },
    ];
    const ftqOf = (r) =>
      +(((r.prod - r.camo - r.scrap - r.buff) / r.prod) * 100).toFixed(1);
    const stOf = (v) => (v < 95 ? "Red" : v < 98 ? "Yellow" : "Green");
    const ftqView = sub.startsWith("MC|") ? "machine" : "recipe";
    const setFtqView = (v) => setSub(v === "machine" ? "MC|" : "");
    const selR = sub.startsWith("MC|") ? "" : sub;
    const fc = (v) => (v < 97 ? C.rd : v < 99 ? C.am : C.gn);
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="FTQ (Curing only) — PCR & TBR" accent={C.tl}>
          <Breadcrumb path={["Process", "FTQ"]} />
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11.5,
                color: C.mu,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              View by
            </span>
            {[
              ["recipe", "Recipe / SKU"],
              ["machine", "Machine"],
            ].map((o) => {
              const a = ftqView === o[0];
              return (
                <button
                  key={o[0]}
                  onClick={() => setFtqView(o[0])}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    border: "1px solid " + (a ? C.tl : C.bd),
                    background: a ? C.tl + "15" : C.c2,
                    color: a ? C.tl : C.tx,
                    fontSize: 12.5,
                    fontWeight: a ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {o[1]}
                </button>
              );
            })}
            <span style={{ fontSize: 11.5, color: C.mu, marginLeft: 4 }}>
              {ftqView === "recipe"
                ? "Click a recipe for its machine-wise scrap"
                : "Machine-wise FTQ across all recipes"}
            </span>
          </div>
          {ftqView === "recipe" ? (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13.5,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Recipe / SKU",
                      "Size",
                      "Segment",
                      "Production Qty",
                      "Camouflage",
                      "Scrap",
                      "Buff",
                      "FTQ %",
                      "Status",
                    ].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          textAlign:
                            i >= 3 && i <= 7
                              ? "right"
                              : i === 8
                                ? "center"
                                : "left",
                          padding: "6px 8px",
                          color: C.mu,
                          fontWeight: 600,
                          borderBottom: "1px solid " + C.bd,
                          fontSize: 12.5,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RECIPES.map((r, i) => {
                    const a = selR === r.k;
                    const fq = ftqOf(r);
                    return (
                      <tr
                        key={i}
                        onClick={() => setSub(a ? "" : r.k)}
                        style={{
                          background: a ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                          cursor: "pointer",
                        }}
                      >
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            fontWeight: a ? 700 : 600,
                            color: a ? C.ac : C.bl,
                          }}
                        >
                          {r.r}
                          <span
                            style={{ fontSize: 11, color: C.am, marginLeft: 5 }}
                          >
                            {"▸"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            color: C.mu,
                          }}
                        >
                          {r.size}
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            color: C.mu,
                          }}
                        >
                          {r.seg}
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            textAlign: "right",
                          }}
                        >
                          {r.prod.toLocaleString("en-IN")}
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            textAlign: "right",
                            color: C.am,
                            fontWeight: 600,
                          }}
                        >
                          {r.camo}
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            textAlign: "right",
                            color: C.rd,
                            fontWeight: 700,
                          }}
                        >
                          {r.scrap}
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            textAlign: "right",
                            color: C.pp,
                            fontWeight: 600,
                          }}
                        >
                          {r.buff}
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            textAlign: "right",
                            fontWeight: 800,
                            color: fc(fq),
                          }}
                        >
                          {fq.toFixed(1) + "%"}
                        </td>
                        <td
                          style={{
                            padding: "7px 8px",
                            borderBottom: "1px solid " + C.bd,
                            textAlign: "center",
                          }}
                        >
                          <StatusPill status={stOf(fq)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <DTable
              cols={[
                "Machine",
                "Production Qty",
                "Camouflage",
                "Scrap",
                "Buff",
                "FTQ %",
                "Top Reason",
                "Status",
              ]}
              rows={MACHINES.map((m) => {
                const fq = ftqOf(m);
                return [
                  m.mc,
                  m.prod.toLocaleString("en-IN"),
                  <span style={{ color: C.am, fontWeight: 600 }}>
                    {m.camo}
                  </span>,
                  <span style={{ color: C.rd, fontWeight: 700 }}>
                    {m.scrap}
                  </span>,
                  <span style={{ color: C.pp, fontWeight: 600 }}>
                    {m.buff}
                  </span>,
                  <span style={{ fontWeight: 800, color: fc(fq) }}>
                    {fq.toFixed(1) + "%"}
                  </span>,
                  m.rsn,
                  <StatusPill status={stOf(fq)} />,
                ];
              })}
            />
          )}
        </Card>
        {ftqView === "recipe" && selR && MC_BY_RECIPE[selR] && (
          <Card
            title={"Machine-wise — " + selR.replace("|", " ")}
            accent={C.am}
          >
            <Breadcrumb path={["Process", "FTQ", selR.replace("|", " ")]} />
            <DTable
              cols={[
                "Machine Name",
                "Camouflage",
                "Scrap",
                "Buff",
                "Reason",
                "Time",
              ]}
              rows={MC_BY_RECIPE[selR].map((m) => [
                m.mc,
                <span style={{ color: C.am, fontWeight: 600 }}>{m.camo}</span>,
                <span style={{ color: C.rd, fontWeight: 700 }}>{m.scrap}</span>,
                <span style={{ color: C.pp, fontWeight: 600 }}>{m.buff}</span>,
                m.rsn,
                m.tm,
              ])}
            />
            <div style={{ fontSize: 12, color: C.mu, marginTop: 6 }}>
              {"FTQ = (Produced − Camouflage − Scrap − Buff) ÷ Produced"}
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (kpi.drill === "spr") {
    const procs = [
      { p: "Mixing", ftq: 99.0, rw: 0.5, dp: 0.3, spr: 99.8, pn: "2 batches" },
      { p: "Stock", ftq: 98.2, rw: 0.8, dp: 0.5, spr: 99.5, pn: "5 rolls" },
      { p: "Building", ftq: 97.5, rw: 1.2, dp: 0.6, spr: 99.3, pn: "12 GTs" },
      { p: "Curing", ftq: 97.0, rw: 1.0, dp: 0.8, spr: 98.8, pn: "8 tyres" },
      {
        p: "Uniformity",
        ftq: 98.0,
        rw: 0.5,
        dp: 0.4,
        spr: 98.9,
        pn: "3 tyres",
      },
    ];
    const reasons = {
      Building: [
        {
          rs: "Splice tension low — reworked",
          mc: "TBM-2",
          qty: 8,
          act: "Re-spliced",
          st: "Released",
        },
        {
          rs: "Bead set issue — reworked",
          mc: "TBM-3",
          qty: 4,
          act: "Re-positioned",
          st: "Released",
        },
        {
          rs: "GT weight high — disposition pending",
          mc: "TBM-2",
          qty: 6,
          act: "Awaiting QA review",
          st: "Pending",
        },
        {
          rs: "Ply wrinkle — disposition reject",
          mc: "TBM-1",
          qty: 3,
          act: "Sent to scrap",
          st: "Rejected",
        },
      ],
      Curing: [
        {
          rs: "Under-cure — re-cured",
          mc: "Press-08",
          qty: 5,
          act: "Re-cure cycle",
          st: "Released",
        },
        {
          rs: "Sidewall mark — disposition pending",
          mc: "Press-12",
          qty: 3,
          act: "Customer review",
          st: "Pending",
        },
        {
          rs: "Blow defect — scrap",
          mc: "Press-08",
          qty: 2,
          act: "Scrapped",
          st: "Rejected",
        },
      ],
      Mixing: [
        {
          rs: "Viscosity NC — re-mixed",
          mc: "Banbury-1",
          qty: 1,
          act: "Re-mix cycle",
          st: "Released",
        },
        {
          rs: "Dump temp high — hold",
          mc: "Banbury-2",
          qty: 2,
          act: "Disposition review",
          st: "Pending",
        },
      ],
      Stock: [
        {
          rs: "Width OOS — reworked",
          mc: "Extruder-1",
          qty: 3,
          act: "Re-extruded",
          st: "Released",
        },
        {
          rs: "Gauge OOS — disposition",
          mc: "Extruder-2",
          qty: 2,
          act: "Pending",
          st: "Pending",
        },
      ],
      Uniformity: [
        {
          rs: "RFV high — reworked",
          mc: "UF-01",
          qty: 2,
          act: "Buffed & retested",
          st: "Released",
        },
        {
          rs: "LFV — disposition",
          mc: "UF-03",
          qty: 1,
          act: "Awaiting decision",
          st: "Pending",
        },
      ],
    };
    const selProc = sub;
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="SPR — Process-wise Breakdown" accent={C.bl}>
          <Breadcrumb path={["Process", "SPR"]} />
          <div
            style={{
              padding: "8px 10px",
              background: C.bl + "10",
              borderRadius: 6,
              marginBottom: 10,
              fontSize: 13,
              color: C.md,
            }}
          >
            <strong>SPR = FTQ + Accepted Rework / Disposition Material</strong>{" "}
            {"— "} Final acceptable output
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Process",
                    "FTQ %",
                    "Rework Accepted",
                    "Disposition Released",
                    "SPR %",
                    "Pending",
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign:
                          i === 0 ? "left" : i === 5 ? "left" : "right",
                        padding: "5px 8px",
                        color: C.mu,
                        fontWeight: 600,
                        borderBottom: "1px solid " + C.bd,
                        fontSize: 13,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {procs.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => setSub(selProc === r.p ? "" : r.p)}
                    style={{
                      background:
                        selProc === r.p ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                      cursor: "pointer",
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        fontWeight: selProc === r.p ? 700 : 400,
                        color: selProc === r.p ? C.ac : C.tx,
                      }}
                    >
                      {r.p}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.ftq}%
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.rw}%
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.dp}%
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        fontWeight: 700,
                        color: r.spr < 99 ? C.am : C.gn,
                      }}
                    >
                      {r.spr}%
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        color: C.am,
                      }}
                    >
                      {r.pn}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.am, marginTop: 6 }}>
            {"▸"} Click process to view rework/disposition reasons & released vs
            pending material
          </div>
        </Card>
        {selProc && reasons[selProc] && (
          <Card
            title={"Rework / Disposition Detail — " + selProc}
            accent={C.am}
          >
            <Breadcrumb path={["Process", "SPR", selProc, "Reasons"]} />
            <DTable
              cols={["Reason", "Machine", "Qty", "Action Taken", "Status"]}
              rows={reasons[selProc].map((r) => [
                r.rs,
                r.mc,
                r.qty,
                r.act,
                <StatusPill status={r.st} />,
              ])}
            />
          </Card>
        )}
      </div>
    );
  }

  if (kpi.drill === "capa") {
    return (
      <Card title="Open CAPA / NC Items" accent={C.rd}>
        <Breadcrumb path={["Process", "Open CAPA"]} />
        <DTable
          cols={[
            "NC #",
            "Process",
            "Violation",
            "Owner",
            "Due Date",
            "Age (days)",
            "Status",
          ]}
          rows={[
            [
              "NC-2451",
              "Curing",
              "Dirty sidewall",
              "S.Singh",
              "15-04-2026",
              6,
              <StatusPill status="Open" />,
            ],
            [
              "NC-2452",
              "Curing",
              "Cure time deviation",
              "M.Verma",
              "10-04-2026",
              11,
              <StatusPill status="Overdue" />,
            ],
            [
              "NC-2454",
              "Curing",
              "Bladder pressure low",
              "R.Yadav",
              "12-04-2026",
              9,
              <StatusPill status="Overdue" />,
            ],
            [
              "NC-2461",
              "Mixing",
              "Dump temp high",
              "M.Sharma",
              "18-04-2026",
              3,
              <StatusPill status="Open" />,
            ],
            [
              "NC-2465",
              "Building",
              "Splice open",
              "K.Reddy",
              "20-04-2026",
              1,
              <StatusPill status="Open" />,
            ],
            [
              "NC-2470",
              "Stock",
              "Width OOS",
              "P.Joshi",
              "16-04-2026",
              5,
              <StatusPill status="Open" />,
            ],
          ]}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <div
            style={{
              padding: "4px 10px",
              background: C.rd + "12",
              borderRadius: 4,
              fontSize: 13,
              color: C.rd,
              fontWeight: 600,
            }}
          >
            2 Overdue
          </div>
          <div
            style={{
              padding: "4px 10px",
              background: C.am + "12",
              borderRadius: 4,
              fontSize: 13,
              color: C.am,
              fontWeight: 600,
            }}
          >
            16 Open
          </div>
        </div>
      </Card>
    );
  }

  return null;
}

// Canonical Quality › Product inventory. Unsupported cards show an explicit
// empty state; live families retain their published source and units.
const PRODUCT_KPIS = [
  {
    id: "overallYield",
    n: "Overall Production Yield",
    sourceKpi: "Overall_Production_Yield",
  },
  {
    id: "tyresTested",
    n: "Uniformity Tyres Tested",
    sourceKpi: "Overall_Uniformity_Production",
  },
  {
    id: "mtmsYield",
    n: "MTMS Uniformity Yield",
    sourceKpi: "Mtms_Uniformity_Yield",
  },
  {
    id: "tuoYield",
    n: "TUO Uniformity Yield",
    sourceKpi: "Tuo_Uniformity_Yield",
  },
  { id: "zfYield", n: "ZF Uniformity Yield", sourceKpi: "Zf_Uniformity_Yield" },
  {
    id: "zfBalancing",
    n: "ZF Balancing Yield",
    sourceKpi: "Zf_Balancing_Yield_o",
  },
  {
    id: "dbmBalancing",
    n: "DBM Balancing Yield",
    sourceKpi: "Dbm_Balancing_Yield",
  },
  { id: "insp", n: "Inspector Rating" },
  {
    id: "gtw",
    n: "GT Weight Variation",
    metricLabel: "Paint Weight Within 3%",
    sourceKpi: "Paint_Wt_Within3_Pct_overall",
  },
  { id: "eg", n: "E-Grade Count" },
  // Deliberately mirrors the Curing → Quality → Scrap KPI in Production;
  // this is a gold-backed quantity, not a newly-derived percentage.
  {
    id: "sc",
    n: "Scrap",
    productionSource: "curingScrap",
    lowerIsBetter: true,
  },
  { id: "cta", n: "CTA Compliance" },
];

/* Product drill-downs are rendered by LiveProductDrillPanel below. */

// Card sparklines span this many periods of the selected granularity, ending
// at the selected period — the same 8-point window Production's cards use.
const PRODUCT_HISTORY_PERIODS = 8;
const PRODUCT_HISTORY_KPIS = PRODUCT_KPIS.map((k) => k.sourceKpi).filter(
  Boolean,
);

/** Trailing [from, to] window for Product card history at `granularity`. */
function productHistoryWindow(date, granularity) {
  const back = PRODUCT_HISTORY_PERIODS - 1;
  const [y, m] = String(date).split("-").map(Number);
  if (granularity === "MONTH") {
    const from = new Date(Date.UTC(y, m - 1 - back, 1));
    return { from: from.toISOString().slice(0, 10), to: date };
  }
  if (granularity === "YEAR") return { from: `${y - back}-01-01`, to: date };
  return { from: offsetIsoDate(date, -back), to: date };
}

/** Human label for the period a Product card value denotes. */
function productPeriodLabel(date, granularity, shift) {
  const [y, m] = String(date).split("-").map(Number);
  if (granularity === "MONTH") {
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (granularity === "YEAR") return String(y);
  const shiftKey = String(shift).toUpperCase();
  const day = toDisplayDate(date);
  return ["A", "B", "C"].includes(shiftKey)
    ? `${day} · Shift ${shiftKey}`
    : day;
}

/**
 * Sparkline values and the latest-vs-previous % change for one card, from
 * an ascending `{date, value}` series. The change is only reported when the
 * newest point is the selected period, so it never compares stale rows.
 */
function productTrendFromPoints(points, date) {
  const valid = (Array.isArray(points) ? points : []).filter(
    (p) => p.value != null && Number.isFinite(Number(p.value)),
  );
  const sp = valid.map((p) => Number(p.value));
  const last = valid[valid.length - 1];
  if (!last || String(last.date).slice(0, 10) !== date || sp.length < 2) {
    return { sp: sp.length >= 2 ? sp : null, trendPct: null };
  }
  const prev = sp[sp.length - 2];
  const curr = sp[sp.length - 1];
  return {
    sp,
    trendPct: prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100,
  };
}

const COMPLAINT_KPIS = [
  {
    id: "tot",
    n: "Total Complaints",
    v: "10",
    u: "nos",
    target: "<5",
    status: "Red",
    sp: [4, 6, 7, 9, 10],
    drill: "tot",
  },
  {
    id: "opn",
    n: "Open Complaints",
    v: "3",
    u: "nos",
    target: "0",
    status: "Red",
    sp: [1, 2, 3, 3, 3],
    drill: "opn",
  },
  {
    id: "cls",
    n: "Closed Complaints",
    v: "7",
    u: "nos",
    status: "Green",
    sp: [3, 4, 4, 6, 7],
    drill: "cls",
  },
  {
    id: "qty",
    n: "Complaint Quantity",
    v: "170",
    u: "tyres",
    target: "<50",
    status: "Red",
    sp: [80, 100, 120, 150, 170],
    drill: "qty",
  },
  {
    id: "oem",
    n: "OEM-wise Complaints",
    v: "3",
    u: "OEMs",
    status: "Yellow",
    drill: "oem",
  },
  {
    id: "score",
    n: "Customer Score",
    v: "92",
    u: "/100",
    target: "≥95",
    status: "Yellow",
    sp: [95, 94, 93, 92, 92],
    drill: "score",
    manual: true,
  },
  {
    id: "zkd",
    n: "ZKD",
    v: "6",
    u: "nos",
    target: "0",
    status: "Red",
    sp: [2, 3, 4, 5, 6],
    drill: "zkd",
  },
  {
    id: "hold",
    n: "Lot Hold",
    v: "6",
    u: "cases · 1,190 tyres held",
    target: "0",
    status: "Red",
    sp: [3, 4, 5, 5, 6],
    drill: "hold",
  },
];

const LOT_HOLDS = [
  {
    lot: "LOT-A4451",
    cust: "Maruti Suzuki",
    sku: "ULTIMA NEO",
    size: "145/13",
    qty: 300,
    prodDate: "02-06-2026",
    holdDate: "08-06-2026",
    inspDate: "10-06-2026",
    closeDate: "12-06-2026",
    aging: 4,
    cat: "Appearance",
    defect: "Sidewall bulge",
    insp: 300,
    rel: 288,
    rej: 12,
    st: "Partially Released",
    owner: "Richa Jha",
    items: [
      {
        bc: "BTP-4451-018",
        def: "Sidewall bulge",
        sev: "Major",
        disp: "Scrapped",
      },
      {
        bc: "BTP-4451-042",
        def: "Sidewall bulge",
        sev: "Major",
        disp: "Scrapped",
      },
      {
        bc: "BTP-4451-077",
        def: "Sidewall mark",
        sev: "Minor",
        disp: "Scrapped",
      },
    ],
  },
  {
    lot: "LOT-A4463",
    cust: "Tata Motors",
    sku: "ULTIMA SPORT",
    size: "175/15",
    qty: 240,
    prodDate: "05-06-2026",
    holdDate: "11-06-2026",
    inspDate: "13-06-2026",
    closeDate: "",
    aging: 9,
    cat: "Dimensional",
    defect: "Bead seat variation",
    insp: 180,
    rel: 0,
    rej: 0,
    st: "Under Inspection",
    owner: "Samson Mathew",
    items: [
      {
        bc: "BTP-4463-006",
        def: "Bead seat high",
        sev: "Major",
        disp: "Under review",
      },
      {
        bc: "BTP-4463-031",
        def: "Bead seat high",
        sev: "Major",
        disp: "Under review",
      },
    ],
  },
  {
    lot: "LOT-A4470",
    cust: "Maruti Suzuki",
    sku: "ULTIMA",
    size: "165/14",
    qty: 180,
    prodDate: "07-06-2026",
    holdDate: "14-06-2026",
    inspDate: "",
    closeDate: "",
    aging: 6,
    cat: "Uniformity",
    defect: "RFV high",
    insp: 0,
    rel: 0,
    rej: 0,
    st: "On Hold",
    owner: "Richa Jha",
    items: [
      {
        bc: "BTP-4470-Pending",
        def: "RFV high (customer report)",
        sev: "Major",
        disp: "Awaiting inspection",
      },
    ],
  },
  {
    lot: "LOT-A4482",
    cust: "Hyundai",
    sku: "ULTIMA SPORT",
    size: "185/15",
    qty: 200,
    prodDate: "01-06-2026",
    holdDate: "06-06-2026",
    inspDate: "07-06-2026",
    closeDate: "09-06-2026",
    aging: 3,
    cat: "Appearance",
    defect: "Tread cosmetic",
    insp: 200,
    rel: 200,
    rej: 0,
    st: "Fully Released",
    owner: "Daksh Gaur",
    items: [
      {
        bc: "—",
        def: "No defect confirmed on inspection",
        sev: "—",
        disp: "Released",
      },
    ],
  },
  {
    lot: "LOT-A4495",
    cust: "Tata Motors",
    sku: "XM2",
    size: "10.00R20",
    qty: 120,
    prodDate: "03-06-2026",
    holdDate: "09-06-2026",
    inspDate: "10-06-2026",
    closeDate: "13-06-2026",
    aging: 4,
    cat: "Construction",
    defect: "Belt edge separation",
    insp: 120,
    rel: 0,
    rej: 120,
    st: "Rejected / Returned",
    owner: "Samson Mathew",
    items: [
      {
        bc: "BTP-4495-lot",
        def: "Belt edge separation — systemic",
        sev: "Critical",
        disp: "Full lot returned",
      },
    ],
  },
  {
    lot: "LOT-A4501",
    cust: "Ashok Leyland",
    sku: "JUC",
    size: "11.00R20",
    qty: 150,
    prodDate: "06-06-2026",
    holdDate: "12-06-2026",
    inspDate: "14-06-2026",
    closeDate: "",
    aging: 8,
    cat: "Uniformity",
    defect: "Conicity out",
    insp: 90,
    rel: 0,
    rej: 0,
    st: "Under Inspection",
    owner: "Richa Jha",
    items: [
      {
        bc: "BTP-4501-022",
        def: "Conicity out of band",
        sev: "Major",
        disp: "Under review",
      },
    ],
  },
];
const LH_STATUS_COL = {
  "On Hold": C.rd,
  "Under Inspection": C.am,
  "Partially Released": C.bl,
  "Fully Released": C.gn,
  "Rejected / Returned": C.rd,
};

function LotHoldPanel({ sub, setSub }) {
  return (
    <Card title="Lot Hold — Cases" accent={C.rd}>
      <Breadcrumb path={["Customer Complaint", "Lot Hold"]} />
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}
        >
          <thead>
            <tr>
              {[
                "Lot Number",
                "Customer",
                "Tire Size",
                "Hold Date",
                "Quantity Held",
                "Defect / Hold Reason",
                "Released",
                "Rejected",
                "Status",
              ].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 4 || i === 6 || i === 7 ? "right" : "left",
                    padding: "6px 8px",
                    color: C.mu,
                    fontWeight: 600,
                    borderBottom: "1px solid " + C.bd,
                    fontSize: 12.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LOT_HOLDS.map((l, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? C.cd : C.rowAlt }}>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: C.bl,
                  }}
                >
                  {l.lot}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                  }}
                >
                  {l.cust}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                  }}
                >
                  {l.size}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                  }}
                >
                  {l.holdDate}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {l.qty}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                  }}
                >
                  {l.defect}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                    textAlign: "right",
                    color: l.rel ? C.gn : C.mu,
                    fontWeight: l.rel ? 700 : 400,
                  }}
                >
                  {l.rel || "—"}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                    textAlign: "right",
                    color: l.rej ? C.rd : C.mu,
                    fontWeight: l.rej ? 700 : 400,
                  }}
                >
                  {l.rej || "—"}
                </td>
                <td
                  style={{
                    padding: "7px 8px",
                    borderBottom: "1px solid " + C.bd,
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: LH_STATUS_COL[l.st] + "18",
                      color: LH_STATUS_COL[l.st],
                      whiteSpace: "nowrap",
                    }}
                  >
                    {l.st}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ComplaintDrillPanel({ kpi, sub, setSub }) {
  if (kpi.drill === "zkd") {
    const zkds = [
      {
        id: "ZKD-01",
        sz: "145/13",
        df: "Sidewall issue",
        lc: "Gurgaon",
        bc: "BC-7842145",
        dt: "02-04-2026",
      },
      {
        id: "ZKD-02",
        sz: "165/14",
        df: "Tread issue",
        lc: "Manesar",
        bc: "BC-7842166",
        dt: "05-04-2026",
      },
      {
        id: "ZKD-03",
        sz: "175/15",
        df: "Bead area crack",
        lc: "Pune",
        bc: "BC-7842178",
        dt: "08-04-2026",
      },
      {
        id: "ZKD-04",
        sz: "185/15",
        df: "Visual defect",
        lc: "Chennai",
        bc: "BC-7842185",
        dt: "10-04-2026",
      },
      {
        id: "ZKD-05",
        sz: "195/15",
        df: "Uniformity",
        lc: "Mumbai",
        bc: "BC-7842195",
        dt: "12-04-2026",
      },
      {
        id: "ZKD-06",
        sz: "165/14",
        df: "Sidewall issue",
        lc: "Hyderabad",
        bc: "BC-7842168",
        dt: "14-04-2026",
      },
    ];
    const selZ = sub;
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="ZKD — Zero Kilometer Defect" accent={C.rd}>
          <Breadcrumb path={["Customer Complaint", "ZKD"]} />
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    ZKD ID
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Size
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Defect
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Location
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Barcode
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {zkds.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => setSub(selZ === r.id ? "" : r.id)}
                    style={{
                      background:
                        selZ === r.id ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                      cursor: "pointer",
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        fontWeight: selZ === r.id ? 700 : 400,
                        color: selZ === r.id ? C.ac : C.tx,
                      }}
                    >
                      {r.id}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {r.sz}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {r.df}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {r.lc}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        fontFamily: "monospace",
                        fontSize: 13,
                      }}
                    >
                      {r.bc}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                      }}
                    >
                      {r.dt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.am, marginTop: 6 }}>
            {"▸"} Click ZKD ID to view manufacturing genealogy
          </div>
        </Card>
        {selZ && (
          <Card title={"Manufacturing Genealogy — " + selZ} accent={C.bl}>
            <Breadcrumb path={["Product", "ZKD", selZ, "Genealogy"]} />
            <div
              style={{
                padding: "8px 10px",
                background: C.bl + "10",
                borderRadius: 6,
                marginBottom: 10,
                fontSize: 13,
              }}
            >
              Barcode:{" "}
              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
                {zkds.find((z) => z.id === selZ).bc}
              </span>{" "}
              {"— "} Tracing back through manufacturing stages
            </div>
            <DTable
              cols={[
                "Stage",
                "Machine",
                "Date / Time",
                "Key Parameter",
                "Value",
                "Result",
              ]}
              rows={[
                [
                  "Mixing",
                  "Banbury-2",
                  "08-Apr 02:30",
                  "Mooney Visc.",
                  "65",
                  "OK",
                ],
                [
                  "Stock",
                  "Extruder-2",
                  "08-Apr 06:15",
                  "Tread Weight",
                  "2.92kg",
                  "High",
                ],
                [
                  "Building",
                  "TBM-2",
                  "08-Apr 10:00",
                  "GT Weight",
                  "High",
                  "Flag",
                ],
                [
                  "Curing",
                  "Press-12",
                  "08-Apr 11:30",
                  "Cure Time",
                  "Within",
                  "OK",
                ],
                [
                  "First Line",
                  "Inspector C",
                  "08-Apr 12:15",
                  "Visual / Trim Check",
                  "Pass",
                  "OK",
                ],
                ["Uniformity", "UF-01", "08-Apr 13:00", "RFV", "11.8", "OK"],
                [
                  "Second Line",
                  "Inspector A",
                  "08-Apr 14:30",
                  "Final Visual Check",
                  "Pass",
                  "OK",
                ],
              ]}
            />
            <div
              style={{
                marginTop: 8,
                padding: "6px 10px",
                background: C.rd + "12",
                borderRadius: 4,
                fontSize: 13,
                color: C.rd,
              }}
            >
              {"⚠"} Root cause likely: Stock stage (tread weight high) →
              Building (GT weight flag)
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (!kpi) return null;

  const complaints = [
    {
      id: "CC-001",
      cust: "MSIL",
      loc: "Gurgaon",
      def: "Sidewall defect",
      qty: 20,
      hold: "Yes",
      seg: "Yes",
      bc: "BC-7842145",
      st: "Open",
    },
    {
      id: "CC-002",
      cust: "MSIL",
      loc: "Manesar",
      def: "Tread issue",
      qty: 30,
      hold: "No",
      seg: "No",
      bc: "BC-7842166",
      st: "Closed",
    },
    {
      id: "CC-003",
      cust: "MSIL",
      loc: "Gurgaon",
      def: "Bead area",
      qty: 15,
      hold: "No",
      seg: "No",
      bc: "BC-7842178",
      st: "Closed",
    },
    {
      id: "CC-004",
      cust: "MSIL",
      loc: "Manesar",
      def: "Visual",
      qty: 15,
      hold: "No",
      seg: "No",
      bc: "BC-7842185",
      st: "Closed",
    },
    {
      id: "CC-005",
      cust: "Tata Motors",
      loc: "Pune",
      def: "Uniformity",
      qty: 25,
      hold: "No",
      seg: "No",
      bc: "BC-7842195",
      st: "Closed",
    },
    {
      id: "CC-006",
      cust: "Tata Motors",
      loc: "Lucknow",
      def: "Sidewall defect",
      qty: 15,
      hold: "Yes",
      seg: "Yes",
      bc: "BC-7842168",
      st: "Open",
    },
    {
      id: "CC-007",
      cust: "Tata Motors",
      loc: "Pune",
      def: "Tread cosmetic",
      qty: 10,
      hold: "No",
      seg: "No",
      bc: "BC-7842172",
      st: "Closed",
    },
    {
      id: "CC-008",
      cust: "M&M",
      loc: "Nashik",
      def: "Bead area",
      qty: 18,
      hold: "No",
      seg: "No",
      bc: "BC-7842181",
      st: "Open",
    },
    {
      id: "CC-009",
      cust: "M&M",
      loc: "Chakan",
      def: "Visual",
      qty: 12,
      hold: "No",
      seg: "No",
      bc: "BC-7842188",
      st: "Closed",
    },
    {
      id: "CC-010",
      cust: "M&M",
      loc: "Nashik",
      def: "Compound issue",
      qty: 10,
      hold: "No",
      seg: "No",
      bc: "BC-7842192",
      st: "Closed",
    },
  ];

  if (kpi.drill === "tot" || kpi.drill === "oem") {
    const oems = [
      { c: "MSIL", cnt: 4, op: 1, cl: 3, qty: 80 },
      { c: "Tata Motors", cnt: 3, op: 1, cl: 2, qty: 50 },
      { c: "M&M", cnt: 3, op: 1, cl: 2, qty: 40 },
    ];
    const selC = sub;
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="Customer / OEM-wise Complaints" accent={C.rd}>
          <Breadcrumb path={["Customer Complaint", "OEM-wise"]} />
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Customer/OEM
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Complaints
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Open
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Closed
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "5px 8px",
                      color: C.mu,
                      fontWeight: 600,
                      borderBottom: "1px solid " + C.bd,
                      fontSize: 13,
                    }}
                  >
                    Qty Affected
                  </th>
                </tr>
              </thead>
              <tbody>
                {oems.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => setSub(selC === r.c ? "" : r.c)}
                    style={{
                      background:
                        selC === r.c ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                      cursor: "pointer",
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        fontWeight: selC === r.c ? 700 : 400,
                        color: selC === r.c ? C.ac : C.tx,
                      }}
                    >
                      {r.c}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    >
                      {r.cnt}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        color: C.am,
                        fontWeight: 600,
                      }}
                    >
                      {r.op}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                        color: C.gn,
                        fontWeight: 600,
                      }}
                    >
                      {r.cl}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        borderBottom: "1px solid " + C.bd,
                        textAlign: "right",
                      }}
                    >
                      {r.qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.am, marginTop: 6 }}>
            {"▸"} Click customer to view complaint details
          </div>
        </Card>
        {selC && (
          <Card title={"Complaint Details — " + selC} accent={C.am}>
            <Breadcrumb path={["Customer Complaint", selC, "Detail"]} />
            <DTable
              cols={[
                "ID",
                "Location",
                "Defect",
                "Qty",
                "Lot Hold",
                "Segregation",
                "Barcode",
                "Status",
              ]}
              rows={complaints
                .filter((c) => c.cust === selC)
                .map((c) => [
                  c.id,
                  c.loc,
                  c.def,
                  c.qty,
                  c.hold,
                  c.seg,
                  <span style={{ fontFamily: "monospace", fontSize: 13 }}>
                    {c.bc}
                  </span>,
                  <StatusPill status={c.st} />,
                ])}
            />
          </Card>
        )}
        {selC &&
          complaints.filter((c) => c.cust === selC && c.st === "Open")[0] && (
            <Card
              title="Manufacturing Genealogy (Open Complaint)"
              accent={C.bl}
            >
              <Breadcrumb path={["Customer Complaint", selC, "Genealogy"]} />
              <div
                style={{
                  padding: "8px 10px",
                  background: C.bl + "10",
                  borderRadius: 6,
                  marginBottom: 10,
                  fontSize: 13,
                }}
              >
                Tracing complaint{" "}
                <strong>
                  {
                    complaints.filter(
                      (c) => c.cust === selC && c.st === "Open",
                    )[0].id
                  }
                </strong>{" "}
                via barcode{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {
                    complaints.filter(
                      (c) => c.cust === selC && c.st === "Open",
                    )[0].bc
                  }
                </span>
              </div>
              <DTable
                cols={[
                  "Stage",
                  "Machine",
                  "Date / Time",
                  "Key Parameter",
                  "Result",
                ]}
                rows={[
                  ["Building", "TBM-2", "10:00 AM", "GT Weight", "High"],
                  ["Curing", "Press-12", "11:30 AM", "Cure Time", "OK"],
                  ["Uniformity", "UF-01", "1:00 PM", "RFV", "OK"],
                  [
                    "Second Line",
                    "Inspector A",
                    "2:30 PM",
                    "Visual Check",
                    "OK",
                  ],
                ]}
              />
            </Card>
          )}
      </div>
    );
  }

  if (kpi.drill === "opn") {
    const opens = complaints.filter((c) => c.st === "Open");
    const selId = sub;
    const selC = opens.find((c) => c.id === selId);
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Card title="Open Complaints" accent={C.rd}>
          <Breadcrumb path={["Customer Complaint", "Open"]} />
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  {[
                    "ID",
                    "Customer",
                    "Location",
                    "Defect",
                    "Qty",
                    "Age (days)",
                    "Status",
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign:
                          i === 0
                            ? "left"
                            : i === 1
                              ? "left"
                              : i === 2
                                ? "left"
                                : i === 3
                                  ? "left"
                                  : i === 6
                                    ? "center"
                                    : "right",
                        padding: "5px 8px",
                        color: C.mu,
                        fontWeight: 600,
                        borderBottom: "1px solid " + C.bd,
                        fontSize: 13,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opens.map((c, i) => {
                  const age = [8, 12, 5][i] || 7;
                  return (
                    <tr
                      key={i}
                      onClick={() => setSub(selId === c.id ? "" : c.id)}
                      style={{
                        background:
                          selId === c.id ? C.aL : i % 2 === 0 ? C.cd : C.rowAlt,
                        cursor: "pointer",
                      }}
                    >
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid " + C.bd,
                          fontWeight: selId === c.id ? 700 : 400,
                          color: selId === c.id ? C.ac : C.tx,
                        }}
                      >
                        {c.id}
                        {
                          <span
                            style={{ fontSize: 12, color: C.am, marginLeft: 6 }}
                          >
                            {"▸"}
                          </span>
                        }
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid " + C.bd,
                        }}
                      >
                        {c.cust}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid " + C.bd,
                        }}
                      >
                        {c.loc}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid " + C.bd,
                        }}
                      >
                        {c.def}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid " + C.bd,
                          textAlign: "right",
                        }}
                      >
                        {c.qty}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid " + C.bd,
                          textAlign: "right",
                          fontWeight: 700,
                          color: age > 10 ? C.rd : age > 7 ? C.am : C.tx,
                        }}
                      >
                        {age}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid " + C.bd,
                          textAlign: "center",
                        }}
                      >
                        <StatusPill status={c.st} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.am, marginTop: 6 }}>
            {"▸"} Click complaint ID to view full detail and barcode genealogy
          </div>
        </Card>
        {selC && (
          <Card title={"Complaint Detail — " + selC.id} accent={C.am}>
            <Breadcrumb
              path={["Customer Complaint", "Open", selC.id, "Detail"]}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  padding: "8px 10px",
                  background: C.c2,
                  borderRadius: 6,
                  border: "1px solid " + C.bd,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: C.mu,
                    textTransform: "uppercase",
                  }}
                >
                  Complaint ID
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selC.id}</div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  background: C.c2,
                  borderRadius: 6,
                  border: "1px solid " + C.bd,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: C.mu,
                    textTransform: "uppercase",
                  }}
                >
                  Customer / OEM
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selC.cust}</div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  background: C.c2,
                  borderRadius: 6,
                  border: "1px solid " + C.bd,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: C.mu,
                    textTransform: "uppercase",
                  }}
                >
                  Location
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selC.loc}</div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  background: C.c2,
                  borderRadius: 6,
                  border: "1px solid " + C.bd,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: C.mu,
                    textTransform: "uppercase",
                  }}
                >
                  Defect
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.rd }}>
                  {selC.def}
                </div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  background: C.c2,
                  borderRadius: 6,
                  border: "1px solid " + C.bd,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: C.mu,
                    textTransform: "uppercase",
                  }}
                >
                  Quantity
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {selC.qty} tyres
                </div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  background: selC.hold === "Yes" ? C.rd + "12" : C.c2,
                  borderRadius: 6,
                  border:
                    "1px solid " + (selC.hold === "Yes" ? C.rd + "33" : C.bd),
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: selC.hold === "Yes" ? C.rd : C.mu,
                    textTransform: "uppercase",
                    fontWeight: selC.hold === "Yes" ? 700 : 400,
                  }}
                >
                  Lot Hold
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: selC.hold === "Yes" ? C.rd : C.tx,
                  }}
                >
                  {selC.hold}
                </div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  background: selC.seg === "Yes" ? C.rd + "12" : C.c2,
                  borderRadius: 6,
                  border:
                    "1px solid " + (selC.seg === "Yes" ? C.rd + "33" : C.bd),
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: selC.seg === "Yes" ? C.rd : C.mu,
                    textTransform: "uppercase",
                    fontWeight: selC.seg === "Yes" ? 700 : 400,
                  }}
                >
                  Segregation
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: selC.seg === "Yes" ? C.rd : C.tx,
                  }}
                >
                  {selC.seg}
                </div>
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  background: C.bl + "10",
                  borderRadius: 6,
                  border: "1px solid " + C.bl + "33",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: C.bl,
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  Barcode
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    color: C.bl,
                  }}
                >
                  {selC.bc}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.md,
                marginBottom: 6,
              }}
            >
              Manufacturing Genealogy (via barcode)
            </div>
            <DTable
              cols={[
                "Stage",
                "Machine",
                "Date / Time",
                "Key Parameter",
                "Result",
              ]}
              rows={[
                ["Mixing", "Banbury-2", "02:30 AM", "Mooney Visc.", "OK"],
                [
                  "Stock",
                  "Extruder-2",
                  "06:15 AM",
                  "Tread Weight",
                  "Slightly High",
                ],
                ["Building", "TBM-2", "10:00 AM", "GT Weight", "Flag"],
                ["Curing", "Press-12", "11:30 AM", "Cure Time", "OK"],
                ["Uniformity", "UF-01", "1:00 PM", "RFV", "OK"],
                ["Second Line", "Inspector A", "2:30 PM", "Visual Check", "OK"],
              ]}
            />
          </Card>
        )}
      </div>
    );
  }

  if (kpi.drill === "cls") {
    return (
      <Card title="Closed Complaints" accent={C.gn}>
        <Breadcrumb path={["Customer Complaint", "Closed"]} />
        <DTable
          cols={[
            "ID",
            "Customer",
            "Location",
            "Defect",
            "Qty",
            "Closure Days",
            "Status",
          ]}
          rows={complaints
            .filter((c) => c.st === "Closed")
            .map((c, i) => [
              c.id,
              c.cust,
              c.loc,
              c.def,
              c.qty,
              [9, 14, 7, 11, 6][i] || 10,
              <StatusPill status={c.st} />,
            ])}
        />
      </Card>
    );
  }

  if (kpi.drill === "qty") {
    return (
      <Card title="Complaint Quantity — Defect-wise" accent={C.rd}>
        <Breadcrumb path={["Customer Complaint", "Quantity"]} />
        <DTable
          cols={[
            "Defect",
            "Cases",
            "Total Qty",
            "Avg Qty/Case",
            "Top Customer",
          ]}
          rows={[
            ["Sidewall defect", 2, 35, 17.5, "MSIL / Tata"],
            ["Tread issue", 2, 40, 20, "MSIL"],
            ["Bead area", 2, 33, 16.5, "MSIL / M&M"],
            ["Visual", 2, 27, 13.5, "MSIL / M&M"],
            ["Uniformity", 1, 25, 25, "Tata Motors"],
            ["Compound issue", 1, 10, 10, "M&M"],
          ]}
        />
      </Card>
    );
  }

  if (kpi.drill === "score") {
    return (
      <Card title="Customer Score / Rating" accent={C.am}>
        <Breadcrumb path={["Customer Complaint", "Score"]} />
        <div
          style={{
            padding: "6px 10px",
            background: "#9CA3AF18",
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 13,
            color: "#6B7280",
          }}
        >
          {"ⓘ"} Source: Manual / Email-based. Future integration required for
          live score.
        </div>
        <DTable
          cols={[
            "Customer",
            "Format",
            "Current",
            "Previous",
            "Trend",
            "Status",
          ]}
          rows={[
            [
              "MSIL",
              "Out of 100",
              92,
              95,
              "↓ -3 pts",
              <StatusPill status="Yellow" />,
            ],
            [
              "Tata Motors",
              "Out of 1000",
              850,
              870,
              "↓ -20 pts",
              <StatusPill status="Yellow" />,
            ],
            [
              "M&M",
              "Grade A/B/C",
              "A",
              "A",
              "Stable",
              <StatusPill status="Green" />,
            ],
            [
              "Hyundai",
              "Out of 100",
              88,
              90,
              "↓ -2 pts",
              <StatusPill status="Yellow" />,
            ],
          ]}
        />
      </Card>
    );
  }

  if (kpi.drill === "hold") {
    return <LotHoldPanel sub={sub} setSub={setSub} />;
  }

  return null;
}

/* ============================ SPC ENGINE ============================ */
const SPC_CONST = {
  2: { A2: 1.88, D3: 0, D4: 3.267, d2: 1.128 },
  3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
  4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
  5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
};
function _erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function _normCdf(z) {
  return 0.5 * (1 + _erf(z / Math.SQRT2));
}

const SPC_PARAMS = [
  {
    key: "quin_width",
    mc: "Quintoplex",
    rc: "ULTIMA NEO",
    sz: "145/13",
    pm: "Tread Width",
    unit: "mm",
    target: 145,
    usl: 147,
    lsl: 143,
    mean: 145.05,
    sigma: 0.42,
    pattern: "shift",
    shiftAt: 14,
    shiftBy: 1.15,
    n: 5,
    groups: 20,
    covN: 315,
    shifts: ["A", "B", "C"],
  },
  {
    key: "ext2_wt",
    mc: "Extruder-2",
    rc: "ULTIMA",
    sz: "165/14",
    pm: "Tread Weight",
    unit: "kg/m",
    target: 4.2,
    usl: 4.4,
    lsl: 4.0,
    mean: 4.225,
    sigma: 0.088,
    pattern: "demo",
    demoOffsets: [
      0, 0, 0, 0, 0, 0, 0, 0, 0.06, 0.1, 0.15, 0.2, 0.26, 0.32, 0.2, 0.19, 0.18,
      0.2, 0.17, 0.19,
    ],
    n: 5,
    groups: 20,
    covN: 340,
    shifts: ["A", "B", "C"],
  },
  {
    key: "ban2_mooney",
    mc: "Banbury-2",
    rc: "All recipes",
    sz: "All",
    pm: "Mooney Viscosity",
    unit: "MU",
    target: 58,
    usl: 64,
    lsl: 52,
    mean: 58.2,
    sigma: 1.35,
    pattern: "trend",
    trendBy: 0.3,
    n: 5,
    groups: 20,
    covN: 300,
    shifts: ["A", "B", "C"],
  },
  {
    key: "maxx1_gtw",
    mc: "VMI Maxx1",
    rc: "ULTIMA SPORT",
    sz: "185/65R15",
    pm: "Green Tyre Weight",
    unit: "kg",
    target: 8.5,
    usl: 8.7,
    lsl: 8.3,
    mean: 8.5,
    sigma: 0.03,
    pattern: "ok",
    n: 5,
    groups: 20,
    covN: 325,
    shifts: ["A", "B", "C"],
  },
  {
    key: "press12_cure",
    mc: "Press-12",
    rc: "ULTIMA SPORT",
    sz: "175/15",
    pm: "Cure Time",
    unit: "min",
    target: 14.0,
    usl: 14.6,
    lsl: 13.4,
    mean: 14.0,
    sigma: 0.14,
    pattern: "ok",
    n: 5,
    groups: 20,
    covN: 175,
    shifts: ["A", "B"],
  },
  {
    key: "uf01_rfv",
    mc: "UF-01",
    rc: "ULTIMA NEO",
    sz: "145/13",
    pm: "RFV",
    unit: "N",
    target: 45,
    usl: 55,
    lsl: 35,
    mean: 45.4,
    sigma: 2.6,
    pattern: "ok",
    n: 5,
    groups: 20,
    covN: 295,
    shifts: ["A", "B", "C"],
  },
  {
    key: "cal1_gauge",
    mc: "Calender-1",
    rc: "All recipes",
    sz: "All",
    pm: "Innerliner Gauge",
    unit: "mm",
    target: 1.2,
    usl: 1.3,
    lsl: 1.1,
    mean: 1.2,
    sigma: 0.017,
    pattern: "ok",
    n: 5,
    groups: 20,
    covN: 360,
    shifts: ["A", "B", "C"],
  },
  {
    key: "exx_splice",
    mc: "VMI Exxium",
    rc: "ULTIMA SPORT",
    sz: "185/65R15",
    pm: "Ply Splice Overlap",
    unit: "mm",
    target: 3.0,
    usl: 4.0,
    lsl: 2.0,
    mean: 3.0,
    sigma: 0.3,
    pattern: "hug",
    n: 5,
    groups: 20,
    covN: 310,
    shifts: ["A", "B", "C"],
  },
];

function _spcSeed(str) {
  let s = 0;
  for (const ch of str) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return s || 1;
}
function _spcCompute(p) {
  const K = SPC_CONST[p.n] || SPC_CONST[5];
  let seed = _spcSeed(p.key);
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const gauss = () => {
    let u = 0,
      v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const subs = [],
    allX = [];
  for (let g = 0; g < p.groups; g++) {
    let mu = p.mean;
    if (p.pattern === "shift" && g >= p.shiftAt) mu += p.shiftBy;
    if (p.pattern === "trend") mu += p.trendBy * g;
    if (p.pattern === "demo" && p.demoOffsets) mu += p.demoOffsets[g] || 0;
    const row = [];
    for (let j = 0; j < p.n; j++) {
      let sg = p.sigma;
      if (p.pattern === "hug") sg = p.sigma * 0.42;
      row.push(mu + gauss() * sg);
      allX.push(row[row.length - 1]);
    }
    subs.push(row);
  }
  const xbar = subs.map((r) => r.reduce((a, b) => a + b, 0) / r.length);
  const R = subs.map((r) => Math.max(...r) - Math.min(...r));
  const Xbb = xbar.reduce((a, b) => a + b, 0) / xbar.length;
  const Rbar = R.reduce((a, b) => a + b, 0) / R.length;
  const uclX = Xbb + K.A2 * Rbar,
    lclX = Xbb - K.A2 * Rbar;
  const uclR = K.D4 * Rbar,
    lclR = K.D3 * Rbar;
  const sigWithin = Rbar / K.d2;
  const meanAll = allX.reduce((a, b) => a + b, 0) / allX.length;
  const sigOverall = Math.sqrt(
    allX.reduce((a, b) => a + (b - meanAll) * (b - meanAll), 0) /
      (allX.length - 1),
  );
  const cp = (p.usl - p.lsl) / (6 * sigWithin);
  const cpk = Math.min(p.usl - Xbb, Xbb - p.lsl) / (3 * sigWithin);
  const pp = (p.usl - p.lsl) / (6 * sigOverall);
  const ppk = Math.min(p.usl - meanAll, meanAll - p.lsl) / (3 * sigOverall);
  const ppm =
    (1 -
      _normCdf((p.usl - meanAll) / sigOverall) +
      _normCdf((p.lsl - meanAll) / sigOverall)) *
    1e6;
  const sigmaLevel = cpk * 3;
  const cs = (uclX - Xbb) / 3;
  const z = xbar.map((v) => (v - Xbb) / cs);
  const rules = _spcNelson(z);
  const flagged = [...new Set(rules.flatMap((r) => r.pts))].sort(
    (a, b) => a - b,
  );
  const covOK = p.covN >= 300 && p.shifts.length >= 3;
  const hist = _spcHist(allX, p.lsl, p.usl, meanAll, sigOverall);
  const inControl = rules.filter((r) => r.hit).length === 0;
  const status = !inControl
    ? "Red"
    : cpk < 1.0
      ? "Red"
      : cpk < 1.33
        ? "Yellow"
        : "Green";
  return {
    subs,
    xbar,
    R,
    Xbb,
    Rbar,
    uclX,
    lclX,
    uclR,
    lclR,
    cs,
    sigWithin,
    sigOverall,
    meanAll,
    cp,
    cpk,
    pp,
    ppk,
    ppm,
    sigmaLevel,
    rules,
    flagged,
    covOK,
    hist,
    inControl,
    status,
  };
}
function _spcNelson(z) {
  const n = z.length,
    sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const mk = (id, name, mean, pts) => ({
    id,
    name,
    mean,
    hit: pts.length > 0,
    pts,
  });
  let r1 = [];
  for (let i = 0; i < n; i++) if (Math.abs(z[i]) > 3) r1.push(i);
  let r2 = [];
  {
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (sign(z[i]) !== 0 && sign(z[i]) === sign(z[i - 1])) run++;
      else run = 1;
      if (run >= 9)
        for (let k = i - 8; k <= i; k++) if (!r2.includes(k)) r2.push(k);
    }
  }
  let r3 = [];
  {
    let inc = 1,
      dec = 1;
    for (let i = 1; i < n; i++) {
      if (z[i] > z[i - 1]) {
        inc++;
        dec = 1;
      } else if (z[i] < z[i - 1]) {
        dec++;
        inc = 1;
      } else {
        inc = 1;
        dec = 1;
      }
      if (inc >= 6 || dec >= 6)
        for (let k = i - 5; k <= i; k++) if (!r3.includes(k)) r3.push(k);
    }
  }
  let r4 = [];
  {
    let run = 1;
    for (let i = 2; i < n; i++) {
      const d = z[i] - z[i - 1],
        dp = z[i - 1] - z[i - 2];
      if (d * dp < 0) run++;
      else run = 1;
      if (run >= 13)
        for (let k = i - 13; k <= i; k++)
          if (k >= 0 && !r4.includes(k)) r4.push(k);
    }
  }
  let r5 = [];
  for (let i = 2; i < n; i++) {
    [1, -1].forEach((s) => {
      const w = [i - 2, i - 1, i],
        c = w.filter((k) => (s > 0 ? z[k] > 2 : z[k] < -2)).length;
      if (c >= 2)
        w.forEach((k) => {
          if ((s > 0 ? z[k] > 2 : z[k] < -2) && !r5.includes(k)) r5.push(k);
        });
    });
  }
  let r6 = [];
  for (let i = 4; i < n; i++) {
    [1, -1].forEach((s) => {
      const w = [i - 4, i - 3, i - 2, i - 1, i],
        c = w.filter((k) => (s > 0 ? z[k] > 1 : z[k] < -1)).length;
      if (c >= 4)
        w.forEach((k) => {
          if ((s > 0 ? z[k] > 1 : z[k] < -1) && !r6.includes(k)) r6.push(k);
        });
    });
  }
  let r7 = [];
  {
    let run = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(z[i]) < 1) run++;
      else run = 0;
      if (run >= 15)
        for (let k = i - 14; k <= i; k++) if (!r7.includes(k)) r7.push(k);
    }
  }
  let r8 = [];
  {
    let run = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(z[i]) > 1) run++;
      else run = 0;
      if (run >= 8)
        for (let k = i - 7; k <= i; k++) if (!r8.includes(k)) r8.push(k);
    }
  }
  return [
    mk(1, "1 point beyond 3σ", "Special cause — sudden shift / outlier", r1),
    mk(2, "9 points same side of centre", "Sustained mean shift", r2),
    mk(
      3,
      "6 points steadily rising / falling",
      "Trend — tool wear or drift",
      r3,
    ),
    mk(
      4,
      "14 points alternating up / down",
      "Over-adjustment or two data streams",
      r4,
    ),
    mk(5, "2 of 3 beyond 2σ (same side)", "Early shift warning", r5),
    mk(6, "4 of 5 beyond 1σ (same side)", "Small sustained shift", r6),
    mk(
      7,
      "15 points within 1σ",
      "Too little variation — check gauge / data",
      r7,
    ),
    mk(8, "8 points beyond 1σ (both sides)", "Mixture / stratification", r8),
  ];
}
function _spcHist(vals, lsl, usl, mu, sig) {
  const lo = Math.min(lsl, mu - 4 * sig, Math.min(...vals)),
    hi = Math.max(usl, mu + 4 * sig, Math.max(...vals));
  const nb = 13,
    w = (hi - lo) / nb;
  const bins = Array.from({ length: nb }, (_, i) => ({
    x0: lo + i * w,
    x1: lo + (i + 1) * w,
    c: 0,
  }));
  vals.forEach((v) => {
    let idx = Math.floor((v - lo) / w);
    if (idx < 0) idx = 0;
    if (idx >= nb) idx = nb - 1;
    bins[idx].c++;
  });
  return { lo, hi, w, bins, nb, mu, sig, lsl, usl, total: vals.length };
}
function _spcFmt(v) {
  const a = Math.abs(v);
  const d = a < 2 ? 3 : a < 20 ? 2 : a < 200 ? 1 : 0;
  return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(
    "en-IN",
  );
}

function _SpcTile({ label, val, sub, col, onTrend, onClick, active }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? "Click to filter" : undefined}
      style={{
        flex: 1,
        minWidth: 118,
        background: active ? (col || C.bl) + "12" : productionCardBg(col),
        border: "1px solid " + (active ? col || C.bl : (col || C.bd) + "35"),
        outline: active ? "1px solid " + (col || C.bl) : "none",
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 2px 8px rgba(0,0,0,.035)",
        position: "relative",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {onTrend && (
        <button
          onClick={onTrend}
          title="Daily trend (this month)"
          style={{
            position: "absolute",
            top: 7,
            right: 7,
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "1px solid " + C.bd,
            background: C.cd,
            color: C.bl,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <TrendIcon size={11} />
        </button>
      )}
      <div
        style={{
          fontSize: 11,
          color: C.mu,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".6px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: col || C.tx,
          marginTop: 6,
          lineHeight: 1.1,
        }}
      >
        {val}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: C.mu, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function _SpcMini({ s }) {
  const W = 280,
    H = 64,
    padL = 6,
    padR = 6,
    padT = 6,
    padB = 6;
  const pw = W - padL - padR,
    ph = H - padT - padB;
  const lo = Math.min(s.lclX, Math.min(...s.xbar)),
    hi = Math.max(s.uclX, Math.max(...s.xbar)),
    pad = (hi - lo) * 0.15 || 1;
  const X = (i) => padL + (i / (s.xbar.length - 1)) * pw,
    Y = (v) => padT + ph - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * ph;
  const fl = new Set(s.flagged);
  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      style={{ width: "100%", height: "auto", marginTop: 6 }}
    >
      <line
        x1={padL}
        y1={Y(s.uclX)}
        x2={W - padR}
        y2={Y(s.uclX)}
        stroke={C.rd}
        strokeWidth="0.8"
        strokeDasharray="3 2"
        opacity="0.7"
      />
      <line
        x1={padL}
        y1={Y(s.lclX)}
        x2={W - padR}
        y2={Y(s.lclX)}
        stroke={C.rd}
        strokeWidth="0.8"
        strokeDasharray="3 2"
        opacity="0.7"
      />
      <line
        x1={padL}
        y1={Y(s.Xbb)}
        x2={W - padR}
        y2={Y(s.Xbb)}
        stroke={C.gn}
        strokeWidth="0.8"
        opacity="0.7"
      />
      <polyline
        points={s.xbar.map((v, i) => X(i) + "," + Y(v)).join(" ")}
        fill="none"
        stroke={C.bl}
        strokeWidth="1.4"
      />
      {s.xbar.map((v, i) => {
        const bad = fl.has(i);
        return (
          <circle
            key={i}
            cx={X(i)}
            cy={Y(v)}
            r={bad ? 2.6 : 1.6}
            fill={bad ? C.rd : C.bl}
          >
            <title>{`Xbar #${i + 1}: ${_spcFmt(v)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function SPCOverview({ onSelect }) {
  const [fMachine, setFMachine] = useState("All");
  const [fSize, setFSize] = useState("All");
  const [expand, setExpand] = useState(null);
  const all = SPC_PARAMS.map((p) => ({ p, s: _spcCompute(p) }));
  const machines = ["All", ...[...new Set(SPC_PARAMS.map((p) => p.mc))]];
  const sizes = ["All", ...[...new Set(SPC_PARAMS.map((p) => p.sz))]];
  const rank = { Red: 0, Yellow: 1, Green: 2 };
  const rows = all
    .filter(
      ({ p }) =>
        (fMachine === "All" || p.mc === fMachine) &&
        (fSize === "All" || p.sz === fSize),
    )
    .sort((a, b) => rank[a.s.status] - rank[b.s.status] || a.s.cpk - b.s.cpk);
  const nOOC = rows.filter((r) => !r.s.inControl).length;
  const nIncap = rows.filter((r) => r.s.cpk < 1.33).length;
  const nOK = rows.filter((r) => r.s.status === "Green").length;
  const filtered = fMachine !== "All" || fSize !== "All";
  const sel = {
    padding: "7px 12px",
    borderRadius: 8,
    border: "1px solid " + C.bd,
    background: C.cd,
    color: C.tx,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
  const CATS = {
    all: { label: "All processes under SPC", list: rows, col: C.tx },
    ooc: {
      label: "Out of control — special cause present",
      list: rows.filter((r) => !r.s.inControl),
      col: C.rd,
    },
    incap: {
      label: "Not capable — Cpk < 1.33",
      list: rows.filter((r) => r.s.cpk < 1.33),
      col: C.am,
    },
    ok: {
      label: "Stable & capable — in control, Cpk ≥ 1.33",
      list: rows.filter((r) => r.s.status === "Green"),
      col: C.gn,
    },
  };
  const cat = expand ? CATS[expand] : null;
  const catRows = cat ? cat.list : rows;
  const cc = (v) => (v < 1.0 ? C.rd : v < 1.33 ? C.am : C.gn);
  const tog = (k) => () => setExpand(expand === k ? null : k);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {_SpcTile({
          label: filtered ? "Processes (filtered)" : "Processes",
          val: rows.length,
          sub: "under SPC",
          col: C.tx,
          onClick: tog("all"),
          active: expand === "all",
        })}
        {_SpcTile({
          label: "Out of control",
          val: nOOC,
          sub: "special cause present",
          col: nOOC ? C.rd : C.gn,
          onClick: tog("ooc"),
          active: expand === "ooc",
        })}
        {_SpcTile({
          label: "Not capable",
          val: nIncap,
          sub: "Cpk < 1.33",
          col: nIncap ? C.am : C.gn,
          onClick: tog("incap"),
          active: expand === "incap",
        })}
        {_SpcTile({
          label: "Stable & capable",
          val: nOK,
          sub: "in control, Cpk ≥ 1.33",
          col: C.gn,
          onClick: tog("ok"),
          active: expand === "ok",
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 12px",
          background: "#F8FAFC",
          borderRadius: 10,
          border: "1px solid " + C.bd,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: C.mu,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".3px",
          }}
        >
          Filter
        </span>
        <label
          style={{
            fontSize: 12,
            color: C.mu,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {"Machine "}
          <select
            value={fMachine}
            onChange={(e) => setFMachine(e.target.value)}
            style={sel}
          >
            {machines.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            fontSize: 12,
            color: C.mu,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {"Size / Item "}
          <select
            value={fSize}
            onChange={(e) => setFSize(e.target.value)}
            style={sel}
          >
            {sizes.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        {cat && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              background: cat.col + "15",
              border: "1px solid " + cat.col + "44",
              color: cat.col,
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            {cat.label}
            <span
              onClick={() => setExpand(null)}
              title="Clear category"
              style={{ cursor: "pointer", fontSize: 13, lineHeight: 1 }}
            >
              {"✕"}
            </span>
          </span>
        )}
        {(filtered || cat) && (
          <button
            onClick={() => {
              setFMachine("All");
              setFSize("All");
              setExpand(null);
            }}
            style={{ ...sel, color: C.pp, fontWeight: 700 }}
          >
            {"Clear"}
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.mu }}>
          {"Showing " + catRows.length + " of " + all.length + " charts"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.mu }}>
        {
          "Each card is one control chart — a single machine × recipe × parameter with its own limits. Click a tile above to show only that category. Sorted worst-first — click a card for its control chart, capability and rule analysis."
        }
      </div>
      {catRows.length === 0 ? (
        <div
          style={{
            padding: "28px 16px",
            textAlign: "center",
            color: C.mu,
            fontSize: 13,
            background: C.cd,
            border: "1px dashed " + C.bd,
            borderRadius: 10,
          }}
        >
          {cat
            ? "No processes in this category."
            : "No control charts for this machine × size combination."}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
            gap: 10,
          }}
        >
          {catRows.map(({ p, s }) => {
            const col =
              s.status === "Red" ? C.rd : s.status === "Yellow" ? C.am : C.gn;
            return (
              <div
                key={p.key}
                onClick={() => onSelect(p.key)}
                style={{
                  cursor: "pointer",
                  background: C.cd,
                  border: "1px solid " + C.bd,
                  borderLeft: "3px solid " + col,
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                      {p.pm}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.mu }}>
                      {p.mc +
                        " · " +
                        (p.rc && p.rc !== "All recipes" ? p.rc + " " : "") +
                        p.sz}
                    </div>
                  </div>
                  <StatusPill status={s.status} />
                </div>
                {_SpcMini({ s })}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 6,
                    fontSize: 11.5,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: C.mu }}>
                    {"Cp "}
                    <b
                      style={{
                        color: s.cp < 1.0 ? C.rd : s.cp < 1.33 ? C.am : C.gn,
                      }}
                    >
                      {s.cp.toFixed(2)}
                    </b>
                  </span>
                  <span style={{ color: C.mu }}>
                    {"Cpk "}
                    <b
                      style={{
                        color: s.cpk < 1.0 ? C.rd : s.cpk < 1.33 ? C.am : C.gn,
                      }}
                    >
                      {s.cpk.toFixed(2)}
                    </b>
                  </span>
                  {s.inControl ? (
                    <span style={{ color: C.gn, fontWeight: 600 }}>
                      In control
                    </span>
                  ) : (
                    <span style={{ color: C.rd, fontWeight: 700 }}>
                      Out of control
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function _XbarChart({ s, p }) {
  const W = 720,
    H = 250,
    padL = 50,
    padR = 70,
    padT = 16,
    padB = 26;
  const pw = W - padL - padR,
    ph = H - padT - padB;
  const fl = new Set(s.flagged);
  const lo0 = Math.min(s.lclX, Math.min(...s.xbar)),
    hi0 = Math.max(s.uclX, Math.max(...s.xbar)),
    pad = (hi0 - lo0) * 0.14 || 1,
    lo = lo0 - pad,
    hi = hi0 + pad;
  const X = (i) => padL + (i / (s.xbar.length - 1)) * pw,
    Y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph;
  const CL = s.Xbb,
    cs = s.cs;
  const zy = (k) => Y(CL + k * cs);
  const inRange = (v) => v >= lo && v <= hi;
  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      style={{ width: "100%", height: "auto" }}
    >
      <rect
        x={padL}
        y={zy(1)}
        width={pw}
        height={Math.max(zy(-1) - zy(1), 0)}
        fill={C.gn}
        opacity="0.05"
      />
      <rect
        x={padL}
        y={zy(2)}
        width={pw}
        height={Math.max(zy(1) - zy(2), 0)}
        fill={C.am}
        opacity="0.05"
      />
      <rect
        x={padL}
        y={zy(-1)}
        width={pw}
        height={Math.max(zy(-2) - zy(-1), 0)}
        fill={C.am}
        opacity="0.05"
      />
      <rect
        x={padL}
        y={zy(3)}
        width={pw}
        height={Math.max(zy(2) - zy(3), 0)}
        fill={C.rd}
        opacity="0.05"
      />
      <rect
        x={padL}
        y={zy(-2)}
        width={pw}
        height={Math.max(zy(-3) - zy(-2), 0)}
        fill={C.rd}
        opacity="0.05"
      />
      {[-2, -1, 1, 2].map((k, i) => (
        <line
          key={i}
          x1={padL}
          y1={zy(k)}
          x2={padL + pw}
          y2={zy(k)}
          stroke={C.bd}
          strokeWidth="0.6"
          strokeDasharray="1 3"
        />
      ))}
      <line
        x1={padL}
        y1={Y(s.uclX)}
        x2={padL + pw}
        y2={Y(s.uclX)}
        stroke={C.rd}
        strokeWidth="1.3"
        strokeDasharray="6 3"
      />
      <line
        x1={padL}
        y1={Y(s.lclX)}
        x2={padL + pw}
        y2={Y(s.lclX)}
        stroke={C.rd}
        strokeWidth="1.3"
        strokeDasharray="6 3"
      />
      <line
        x1={padL}
        y1={Y(CL)}
        x2={padL + pw}
        y2={Y(CL)}
        stroke={C.gn}
        strokeWidth="1.4"
      />
      {inRange(p.target) && (
        <line
          x1={padL}
          y1={Y(p.target)}
          x2={padL + pw}
          y2={Y(p.target)}
          stroke={C.bl}
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.7"
        />
      )}
      <text x={padL + pw + 4} y={Y(s.uclX) + 3} fontSize="9.5" fill={C.rd}>
        {"UCL " + _spcFmt(s.uclX)}
      </text>
      <text x={padL + pw + 4} y={Y(CL) + 3} fontSize="9.5" fill={C.gn}>
        {"CL " + _spcFmt(CL)}
      </text>
      <text x={padL + pw + 4} y={Y(s.lclX) + 3} fontSize="9.5" fill={C.rd}>
        {"LCL " + _spcFmt(s.lclX)}
      </text>
      {[-3, -2, -1, 1, 2, 3].map((k, i) => (
        <text
          key={i}
          x={padL - 6}
          y={zy(k) + 3}
          fontSize="8"
          fill={C.mu}
          textAnchor="end"
        >
          {(k > 0 ? "+" : "") + k + "σ"}
        </text>
      ))}
      <polyline
        points={s.xbar.map((v, i) => X(i) + "," + Y(v)).join(" ")}
        fill="none"
        stroke={C.bl}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {s.xbar.map((v, i) => {
        const bad = fl.has(i);
        return (
          <circle
            key={i}
            cx={X(i)}
            cy={Y(v)}
            r={bad ? 4.5 : 3}
            fill={bad ? C.rd : C.bl}
            stroke={bad ? "#fff" : "none"}
            strokeWidth={bad ? 1.4 : 0}
          >
            <title>{`Xbar #${i + 1}: ${_spcFmt(v)}`}</title>
          </circle>
        );
      })}
      {s.xbar.map((v, i) =>
        i % 2 === 0 ? (
          <text
            key={i}
            x={X(i)}
            y={H - 8}
            fontSize="8.5"
            fill={C.mu}
            textAnchor="middle"
          >
            {i + 1}
          </text>
        ) : null,
      )}
    </svg>
  );
}
function _RChart({ s }) {
  const W = 720,
    H = 170,
    padL = 50,
    padR = 70,
    padT = 14,
    padB = 24;
  const pw = W - padL - padR,
    ph = H - padT - padB;
  const hi = Math.max(s.uclR, Math.max(...s.R)) * 1.12 || 1;
  const X = (i) => padL + (i / (s.R.length - 1)) * pw,
    Y = (v) => padT + ph - (v / hi) * ph;
  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      style={{ width: "100%", height: "auto" }}
    >
      <line
        x1={padL}
        y1={Y(s.uclR)}
        x2={padL + pw}
        y2={Y(s.uclR)}
        stroke={C.rd}
        strokeWidth="1.3"
        strokeDasharray="6 3"
      />
      <line
        x1={padL}
        y1={Y(s.Rbar)}
        x2={padL + pw}
        y2={Y(s.Rbar)}
        stroke={C.gn}
        strokeWidth="1.4"
      />
      {s.lclR > 0 && (
        <line
          x1={padL}
          y1={Y(s.lclR)}
          x2={padL + pw}
          y2={Y(s.lclR)}
          stroke={C.rd}
          strokeWidth="1.3"
          strokeDasharray="6 3"
        />
      )}
      <text x={padL + pw + 4} y={Y(s.uclR) + 3} fontSize="9.5" fill={C.rd}>
        {"UCL " + _spcFmt(s.uclR)}
      </text>
      <text x={padL + pw + 4} y={Y(s.Rbar) + 3} fontSize="9.5" fill={C.gn}>
        {"R̄ " + _spcFmt(s.Rbar)}
      </text>
      <polyline
        points={s.R.map((v, i) => X(i) + "," + Y(v)).join(" ")}
        fill="none"
        stroke={C.pp}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {s.R.map((v, i) => {
        const bad = v > s.uclR || v < s.lclR;
        return (
          <circle
            key={i}
            cx={X(i)}
            cy={Y(v)}
            r={bad ? 4.5 : 3}
            fill={bad ? C.rd : C.pp}
            stroke={bad ? "#fff" : "none"}
            strokeWidth={bad ? 1.4 : 0}
          >
            <title>{`R #${i + 1}: ${_spcFmt(v)}`}</title>
          </circle>
        );
      })}
      {s.R.map((v, i) =>
        i % 2 === 0 ? (
          <text
            key={i}
            x={X(i)}
            y={H - 8}
            fontSize="8.5"
            fill={C.mu}
            textAnchor="middle"
          >
            {i + 1}
          </text>
        ) : null,
      )}
    </svg>
  );
}
function _CapHist({ s, p }) {
  const h = s.hist;
  const W = 720,
    H = 250,
    padL = 42,
    padR = 16,
    padT = 20,
    padB = 40;
  const pw = W - padL - padR,
    ph = H - padT - padB;
  const total = h.total,
    w = h.w;
  const expAt = (x) =>
    (total * w * Math.exp((-(x - h.mu) * (x - h.mu)) / (2 * h.sig * h.sig))) /
    (h.sig * Math.sqrt(2 * Math.PI));
  const maxC = Math.max(...h.bins.map((b) => b.c), expAt(h.mu));
  const X = (v) => padL + ((v - h.lo) / (h.hi - h.lo)) * pw,
    Y = (c) => padT + ph - (c / maxC) * ph;
  const curve = [];
  for (let i = 0; i <= 60; i++) {
    const x = h.lo + ((h.hi - h.lo) * i) / 60;
    curve.push(X(x) + "," + Y(expAt(x)));
  }
  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      style={{ width: "100%", height: "auto" }}
    >
      {h.bins.map((b, i) => {
        const oos = b.x1 <= h.lsl || b.x0 >= h.usl;
        const x = X(b.x0),
          bw = X(b.x1) - X(b.x0);
        return (
          <rect
            key={i}
            x={x + 0.5}
            y={Y(b.c)}
            width={Math.max(bw - 1, 1)}
            height={padT + ph - Y(b.c)}
            fill={oos ? C.rd : C.bl}
            opacity={oos ? 0.8 : 0.5}
          >
            <title>{`${_spcFmt(b.x0)} - ${_spcFmt(b.x1)}: ${b.c}`}</title>
          </rect>
        );
      })}
      <polyline
        points={curve.join(" ")}
        fill="none"
        stroke={C.tx}
        strokeWidth="1.6"
      />
      <line
        x1={X(h.lsl)}
        y1={padT}
        x2={X(h.lsl)}
        y2={padT + ph}
        stroke={C.rd}
        strokeWidth="1.6"
      />
      <line
        x1={X(h.usl)}
        y1={padT}
        x2={X(h.usl)}
        y2={padT + ph}
        stroke={C.rd}
        strokeWidth="1.6"
      />
      <line
        x1={X(p.target)}
        y1={padT}
        x2={X(p.target)}
        y2={padT + ph}
        stroke={C.gn}
        strokeWidth="1.4"
        strokeDasharray="4 3"
      />
      <text
        x={X(h.lsl)}
        y={padT - 6}
        fontSize="9.5"
        fill={C.rd}
        textAnchor="middle"
      >
        {"LSL " + _spcFmt(h.lsl)}
      </text>
      <text
        x={X(h.usl)}
        y={padT - 6}
        fontSize="9.5"
        fill={C.rd}
        textAnchor="middle"
      >
        {"USL " + _spcFmt(h.usl)}
      </text>
      <text
        x={X(p.target)}
        y={H - 6}
        fontSize="9"
        fill={C.gn}
        textAnchor="middle"
      >
        {"Target " + _spcFmt(p.target)}
      </text>
      <text
        x={X(s.meanAll)}
        y={H - 6}
        fontSize="9"
        fill={C.bl}
        textAnchor="middle"
      >
        {"x̄ " + _spcFmt(s.meanAll)}
      </text>
    </svg>
  );
}
function _capSp(seed, cur) {
  let s = seed || 1;
  const r = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const a = [];
  let v = cur * 0.9;
  for (let i = 0; i < 6; i++) {
    v += (cur - v) * 0.32 + (r() - 0.5) * cur * 0.05;
    a.push(Math.max(0, +v.toFixed(3)));
  }
  a[a.length - 1] = +cur.toFixed(3);
  return a;
}
const NELSON = [
  {
    id: 1,
    short: "1 point beyond 3σ",
    marker: "stop",
    sev: "Out of Control",
    desc: "One point falls outside the 3σ control limits — a strong signal of a special cause (sudden shift or outlier).",
  },
  {
    id: 2,
    short: "9 points same side of centre",
    marker: "box",
    sev: "Shift Detected",
    desc: "Nine points in a row on one side of the centre line. Indicates a sustained shift in the process mean.",
  },
  {
    id: 3,
    short: "6 points steadily rising / falling",
    marker: "box",
    sev: "Trend",
    desc: "Six points in a row continuously increasing or decreasing — a trend, typically tool wear or gradual drift.",
  },
  {
    id: 4,
    short: "14 points alternating up / down",
    marker: "box",
    sev: "Oscillation",
    desc: "Fourteen points alternating up and down — suggests over-adjustment (tampering) or two data streams mixed.",
  },
  {
    id: 5,
    short: "2 of 3 beyond 2σ (same side)",
    marker: "tri",
    sev: "Warning",
    desc: "Two of three consecutive points beyond 2σ on the same side — an early warning of a developing shift.",
  },
  {
    id: 6,
    short: "4 of 5 beyond 1σ (same side)",
    marker: "tri",
    sev: "Warning",
    desc: "Four of five consecutive points beyond 1σ on the same side — a small but sustained shift.",
  },
  {
    id: 7,
    short: "15 points within 1σ",
    marker: "box",
    sev: "Stratification",
    desc: "Fifteen points in a row within 1σ of centre — unusually low variation, often a measurement / data problem.",
  },
  {
    id: 8,
    short: "8 points beyond 1σ (both sides)",
    marker: "tri",
    sev: "Oscillation",
    desc: "Eight points in a row beyond 1σ on both sides, avoiding the centre — indicates mixture or stratification.",
  },
];
function _ruleDemoData(id) {
  switch (id) {
    case 1:
      return {
        pts: [50, 45, 54, 48, 52, 47, 53, 49, 51, 96, 50, 48, 52, 46, 54],
        hi: [9],
      };
    case 2:
      return {
        pts: [50, 58, 61, 60, 64, 59, 66, 62, 63, 60, 58, 62],
        hi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      };
    case 3:
      return {
        pts: [30, 33, 38, 43, 48, 53, 58, 63, 60],
        hi: [2, 3, 4, 5, 6, 7],
      };
    case 4:
      return {
        pts: [40, 60, 42, 58, 44, 56, 43, 57, 41, 59, 42, 58, 44, 56],
        hi: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      };
    case 5:
      return { pts: [50, 48, 52, 80, 50, 82, 49, 51, 50], hi: [3, 5] };
    case 6:
      return { pts: [50, 68, 66, 71, 64, 50, 52, 49], hi: [1, 2, 3, 4] };
    case 7:
      return {
        pts: [50, 52, 48, 51, 49, 53, 47, 50, 52, 48, 51, 49, 53, 47, 50],
        hi: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      };
    case 8:
      return {
        pts: [70, 32, 68, 34, 72, 30, 66, 36, 70, 33],
        hi: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      };
    default:
      return { pts: [50, 50, 50], hi: [] };
  }
}
function _RuleMiniChart({ id, w, h }) {
  const d = _ruleDemoData(id);
  const padX = 6,
    padY = 8;
  const pw = w - padX * 2,
    ph = h - padY * 2;
  const X = (i) =>
    padX + (d.pts.length <= 1 ? pw / 2 : i * (pw / (d.pts.length - 1)));
  const Y = (v) => padY + ph - (v / 100) * ph;
  const hi = new Set(d.hi);
  return (
    <svg viewBox={"0 0 " + w + " " + h} style={{ width: w, height: h }}>
      <line
        x1={padX}
        y1={Y(83)}
        x2={w - padX}
        y2={Y(83)}
        stroke={C.rd}
        strokeWidth="0.8"
      />
      <line
        x1={padX}
        y1={Y(50)}
        x2={w - padX}
        y2={Y(50)}
        stroke={C.mu}
        strokeWidth="0.7"
      />
      <line
        x1={padX}
        y1={Y(17)}
        x2={w - padX}
        y2={Y(17)}
        stroke={C.rd}
        strokeWidth="0.8"
      />
      <polyline
        points={d.pts.map((v, i) => X(i) + "," + Y(v)).join(" ")}
        fill="none"
        stroke={C.bl}
        strokeWidth="1.2"
      />
      {d.pts.map((v, i) => {
        const b = hi.has(i);
        return (
          <circle
            key={i}
            cx={X(i)}
            cy={Y(v)}
            r={b ? 2.6 : 1.5}
            fill={b ? C.rd : C.bl}
          />
        );
      })}
    </svg>
  );
}

function DraggableWindow({
  title,
  accent,
  onClose,
  initial,
  width,
  z,
  children,
}) {
  const [pos, setPos] = useState(initial);
  const onDown = (e) => {
    const sx = e.clientX,
      sy = e.clientY,
      ox = pos.x,
      oy = pos.y;
    const mv = (ev) =>
      setPos({ x: ox + (ev.clientX - sx), y: oy + (ev.clientY - sy) });
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    e.preventDefault();
  };
  return (
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: width,
        zIndex: z || 20,
        background: C.cd,
        border: "1px solid " + C.bd,
        borderRadius: 8,
        boxShadow: "0 12px 34px rgba(0,0,0,.22)",
        overflow: "hidden",
      }}
    >
      <div
        onMouseDown={onDown}
        style={{
          cursor: "move",
          background: accent,
          color: "#fff",
          padding: "7px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12.5,
          fontWeight: 700,
          userSelect: "none",
        }}
      >
        <span>{title}</span>
        <span
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="Close"
          style={{
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
            padding: "0 2px",
            opacity: 0.9,
          }}
        >
          {"✕"}
        </span>
      </div>
      <div style={{ maxHeight: 360, overflow: "auto" }}>{children}</div>
    </div>
  );
}

function SpcRuleWorkstation({ s, p }) {
  const [enabled, setEnabled] = useState(NELSON.map(() => true));
  const [selRule, setSelRule] = useState(1);
  const [hover, setHover] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const ruleHit = {};
  s.rules.forEach((r) => {
    ruleHit[r.id] = r.pts;
  });
  const clock = (i) => {
    const m = 6 * 60 + i * 36;
    return (
      String(Math.floor(m / 60) % 24).padStart(2, "0") +
      ":" +
      String(m % 60).padStart(2, "0")
    );
  };
  const alerts = s.rules
    .filter((r) => r.hit && enabled[r.id - 1])
    .map((r) => ({
      id: r.id,
      sev: NELSON[r.id - 1].sev,
      marker: NELSON[r.id - 1].marker,
      pts: r.pts,
      time: clock(r.pts[r.pts.length - 1]),
    }));
  const W = 760,
    H = 364,
    padL = 48,
    padR = 72,
    padT = 62,
    padB = 32;
  const pw = W - padL - padR,
    ph = H - padT - padB;
  const xb = s.xbar,
    n = xb.length;
  const lo0 = Math.min(s.lclX, Math.min(...xb)),
    hi0 = Math.max(s.uclX, Math.max(...xb)),
    pad = (hi0 - lo0) * 0.16 || 1,
    lo = lo0 - pad,
    hi = hi0 + pad;
  const X = (i) => padL + (n <= 1 ? pw / 2 : i * (pw / (n - 1)));
  const Y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph;
  const oct = (cx, cy, r) => {
    let a = "";
    for (let k = 0; k < 8; k++) {
      const ang = Math.PI / 8 + k * (Math.PI / 4);
      a +=
        (cx + r * Math.cos(ang)).toFixed(1) +
        "," +
        (cy + r * Math.sin(ang)).toFixed(1) +
        " ";
    }
    return a.trim();
  };
  const ptMark = {};
  NELSON.forEach((r) => {
    if (
      r.marker !== "box" &&
      enabled[r.id - 1] &&
      ruleHit[r.id] &&
      ruleHit[r.id].length
    ) {
      let peak = ruleHit[r.id][0];
      ruleHit[r.id].forEach((i) => {
        if (Math.abs(xb[i] - s.Xbb) > Math.abs(xb[peak] - s.Xbb)) peak = i;
      });
      if (!ptMark[peak]) ptMark[peak] = { type: r.marker, ids: [] };
      if (r.marker === "stop") ptMark[peak].type = "stop";
      ptMark[peak].ids.push(r.id);
    }
  });
  const boxes = NELSON.filter(
    (r) =>
      r.marker === "box" &&
      enabled[r.id - 1] &&
      ruleHit[r.id] &&
      ruleHit[r.id].length,
  ).map((r) => ({
    id: r.id,
    a: Math.min(...ruleHit[r.id]),
    b: Math.max(...ruleHit[r.id]),
  }));
  const iconBtn = (on) => ({
    width: 30,
    height: 28,
    borderRadius: 6,
    border: "1px solid " + (on ? C.pp : C.bd),
    background: on ? C.pp + "18" : C.cd,
    color: on ? C.pp : C.mu,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    position: "relative",
  });
  const ConfigBody = (
    <div style={{ padding: 10 }}>
      {NELSON.map((r, i) => {
        const on = enabled[i];
        const sel = selRule === r.id;
        return (
          <div
            key={r.id}
            onClick={() => setSelRule(r.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 6px",
              borderRadius: 6,
              cursor: "pointer",
              background: sel ? C.bl + "14" : "transparent",
              marginBottom: 2,
            }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => {
                e.stopPropagation();
                setEnabled((a) => a.map((v, j) => (j === i ? !v : v)));
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: "pointer" }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 11.5,
                fontWeight: sel ? 700 : 500,
                color: on ? C.tx : C.mu,
              }}
            >
              {"R" + r.id + " — " + r.short}
            </span>
            <span
              style={{
                border: "1px solid " + C.bd,
                borderRadius: 4,
                background: C.c2,
                padding: 1,
              }}
            >
              {_RuleMiniChart({ id: r.id, w: 64, h: 24 })}
            </span>
          </div>
        );
      })}
      <div
        style={{ borderTop: "1px solid " + C.bd, marginTop: 8, paddingTop: 8 }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.tx,
            marginBottom: 3,
          }}
        >
          {"Rule Demonstration"}
        </div>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.bl,
            marginBottom: 3,
          }}
        >
          {"Rule " + selRule + ": " + NELSON[selRule - 1].short}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: C.md,
            lineHeight: 1.55,
            marginBottom: 6,
          }}
        >
          {NELSON[selRule - 1].desc}
        </div>
        <div
          style={{
            background: C.c2,
            border: "1px solid " + C.bd,
            borderRadius: 6,
            padding: 5,
            display: "inline-block",
          }}
        >
          {_RuleMiniChart({ id: selRule, w: 230, h: 110 })}
        </div>
        <div style={{ fontSize: 10.5, color: C.mu, marginTop: 5 }}>
          {
            "Red points show the pattern. Uncheck a rule to stop it flagging & alerting."
          }
        </div>
      </div>
    </div>
  );
  const FeedBody = (
    <div style={{ padding: 10 }}>
      {alerts.length === 0 ? (
        <div
          style={{
            padding: "6px 2px",
            fontSize: 12,
            color: C.gn,
            fontWeight: 600,
          }}
        >
          {"✓ No active alerts — all enabled rules pass."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {alerts.map((a, i) => {
            const col = a.marker === "tri" ? C.am : C.rd;
            const ptStr =
              a.pts.length > 1
                ? a.pts[0] + 1 + "–" + (a.pts[a.pts.length - 1] + 1)
                : a.pts[0] + 1;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "center",
                  padding: "7px 9px",
                  border: "1px solid " + col + "44",
                  borderLeft: "3px solid " + col,
                  borderRadius: 6,
                  background: col + "0C",
                }}
              >
                <span
                  style={{
                    minWidth: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: col,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {"R" + a.id}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>
                    {a.sev + " (Pt " + ptStr + ")"}
                  </div>
                  <div style={{ fontSize: 11, color: C.mu }}>{a.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.mu, marginTop: 8 }}>
        {"Live — alerts appear as enabled rules are breached above."}
      </div>
    </div>
  );
  return (
    <Card
      title={
        "Interactive Process Control — X̄ Chart with Nelson Rules (" +
        p.unit +
        ")"
      }
      accent={C.pp}
    >
      <div
        style={{
          position: "relative",
          minHeight: 410,
          background: C.c2,
          borderRadius: 8,
          border: "1px solid " + C.bd,
          padding: "8px 6px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            display: "flex",
            gap: 6,
            zIndex: 15,
          }}
        >
          <button
            onClick={() => setShowConfig((v) => !v)}
            title="Nelson Rules Configuration & Demo"
            style={iconBtn(showConfig)}
          >
            {"⚙"}
          </button>
          <button
            onClick={() => setShowFeed((v) => !v)}
            title="Nelson Rule Alert Feed"
            style={iconBtn(showFeed)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {alerts.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -5,
                  right: -5,
                  minWidth: 15,
                  height: 15,
                  borderRadius: "50%",
                  background: C.rd,
                  color: "#fff",
                  fontSize: 9.5,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 2px",
                }}
              >
                {alerts.length}
              </span>
            )}
          </button>
        </div>
        <svg
          viewBox={"0 0 " + W + " " + H}
          style={{ width: "100%", height: "auto" }}
        >
          {boxes.map((bx, i) => {
            const x0 = X(bx.a) - Math.max((X(1) - X(0)) / 2, 7),
              x1 = X(bx.b) + Math.max((X(1) - X(0)) / 2, 7);
            const bw = Math.max(x1 - x0, 4);
            return (
              <g key={i}>
                <rect
                  x={x0}
                  y={padT}
                  width={bw}
                  height={ph}
                  fill="#e01b1b"
                  opacity="0.10"
                  stroke="#e01b1b"
                  strokeWidth="2"
                />
                <rect
                  x={x0 - 1}
                  y={padT - 21}
                  width={30}
                  height={18}
                  rx="3"
                  fill="#e01b1b"
                />
                <text
                  x={x0 + 14}
                  y={padT - 8}
                  fontSize="11"
                  fontWeight="800"
                  fill="#fff"
                  textAnchor="middle"
                >
                  {"R" + bx.id}
                </text>
                <text
                  x={x1 - 7}
                  y={padT + 15}
                  fontSize="10"
                  fontWeight="700"
                  fill="#c01515"
                  textAnchor="end"
                >
                  {"Point #" + (bx.a + 1) + "–" + (bx.b + 1)}
                </text>
              </g>
            );
          })}
          {(() => {
            const zy = (k) => Y(s.Xbb + k * s.cs);
            return (
              <g>
                <rect
                  x={padL}
                  y={zy(1)}
                  width={pw}
                  height={Math.max(zy(-1) - zy(1), 0)}
                  fill={C.gn}
                  opacity="0.06"
                />
                <rect
                  x={padL}
                  y={zy(2)}
                  width={pw}
                  height={Math.max(zy(1) - zy(2), 0)}
                  fill={C.am}
                  opacity="0.05"
                />
                <rect
                  x={padL}
                  y={zy(-1)}
                  width={pw}
                  height={Math.max(zy(-2) - zy(-1), 0)}
                  fill={C.am}
                  opacity="0.05"
                />
                <rect
                  x={padL}
                  y={zy(3)}
                  width={pw}
                  height={Math.max(zy(2) - zy(3), 0)}
                  fill={C.rd}
                  opacity="0.05"
                />
                <rect
                  x={padL}
                  y={zy(-2)}
                  width={pw}
                  height={Math.max(zy(-3) - zy(-2), 0)}
                  fill={C.rd}
                  opacity="0.05"
                />
                {[1, 2, -1, -2].map((k, i) => (
                  <line
                    key={i}
                    x1={padL}
                    y1={zy(k)}
                    x2={padL + pw}
                    y2={zy(k)}
                    stroke={C.mu}
                    strokeWidth="0.8"
                    strokeDasharray="2 3"
                    opacity="0.7"
                  />
                ))}
                {[
                  [3, "+3σ"],
                  [2, "+2σ"],
                  [1, "+1σ"],
                  [-1, "−1σ"],
                  [-2, "−2σ"],
                  [-3, "−3σ"],
                ].map((t, i) => (
                  <text
                    key={i}
                    x={padL - 4}
                    y={zy(t[0]) + 3}
                    fontSize="8.5"
                    fill={C.mu}
                    textAnchor="end"
                  >
                    {t[1]}
                  </text>
                ))}
              </g>
            );
          })()}
          <line
            x1={padL}
            y1={Y(s.uclX)}
            x2={padL + pw}
            y2={Y(s.uclX)}
            stroke={C.rd}
            strokeWidth="1.4"
          />
          <line
            x1={padL}
            y1={Y(s.Xbb)}
            x2={padL + pw}
            y2={Y(s.Xbb)}
            stroke={C.md}
            strokeWidth="1.4"
          />
          <line
            x1={padL}
            y1={Y(s.lclX)}
            x2={padL + pw}
            y2={Y(s.lclX)}
            stroke={C.rd}
            strokeWidth="1.4"
          />
          <text
            x={padL + pw + 5}
            y={Y(s.uclX) + 3}
            fontSize="10"
            fill={C.rd}
            fontWeight="600"
          >
            {"UCL " + _spcFmt(s.uclX)}
          </text>
          <text
            x={padL + pw + 5}
            y={Y(s.Xbb) + 3}
            fontSize="10"
            fill={C.md}
            fontWeight="600"
          >
            {"CL " + _spcFmt(s.Xbb)}
          </text>
          <text
            x={padL + pw + 5}
            y={Y(s.lclX) + 3}
            fontSize="10"
            fill={C.rd}
            fontWeight="600"
          >
            {"LCL " + _spcFmt(s.lclX)}
          </text>
          <polyline
            points={xb.map((v, i) => X(i) + "," + Y(v)).join(" ")}
            fill="none"
            stroke={C.bl}
            strokeWidth="1.8"
          />
          {xb.map((v, i) => (
            <circle
              key={i}
              cx={X(i)}
              cy={Y(v)}
              r="3"
              fill={ptMark[i] ? C.rd : C.bl}
            />
          ))}
          {xb.map((v, i) =>
            i % 2 === 0 ? (
              <text
                key={i}
                x={X(i)}
                y={H - 8}
                fontSize="8.5"
                fill={C.mu}
                textAnchor="middle"
              >
                {i + 1}
              </text>
            ) : null,
          )}
          {Object.keys(ptMark).map((k) => {
            const i = +k;
            const m = ptMark[i];
            const cx = X(i),
              cy = Y(xb[i]);
            const my = cy - 32;
            const lbl = "R" + m.ids.join("/");
            return (
              <g key={i}>
                <line
                  x1={cx}
                  y1={my + (m.type === "stop" ? 13 : 10)}
                  x2={cx}
                  y2={cy - 3}
                  stroke={m.type === "stop" ? "#e01b1b" : "#c99700"}
                  strokeWidth="1.4"
                />
                <text
                  x={cx}
                  y={my - 16}
                  fontSize="10.5"
                  fill={C.tx}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {"Point #" + (i + 1)}
                </text>
                {m.type === "stop" ? (
                  <g>
                    <polygon
                      points={oct(cx, my, 13)}
                      fill="#e01b1b"
                      stroke="#fff"
                      strokeWidth="2.2"
                    />
                    <text
                      x={cx}
                      y={my + 4}
                      fontSize="11"
                      fontWeight="800"
                      fill="#fff"
                      textAnchor="middle"
                    >
                      {lbl}
                    </text>
                  </g>
                ) : (
                  <g>
                    <polygon
                      points={
                        cx +
                        "," +
                        (my - 14) +
                        " " +
                        (cx - 14) +
                        "," +
                        (my + 11) +
                        " " +
                        (cx + 14) +
                        "," +
                        (my + 11)
                      }
                      fill="#f5c518"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                    <text
                      x={cx}
                      y={my + 8}
                      fontSize="10.5"
                      fontWeight="800"
                      fill="#3a2f00"
                      textAnchor="middle"
                    >
                      {lbl}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {xb.map((v, i) => (
            <circle
              key={"h" + i}
              cx={X(i)}
              cy={Y(v)}
              r="9"
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
          {hover != null &&
            (() => {
              const cx = X(hover),
                cy = Y(xb[hover]);
              const tx = Math.min(Math.max(cx - 46, padL), padL + pw - 92);
              return (
                <g>
                  <rect
                    x={tx}
                    y={cy - 40}
                    width={92}
                    height={30}
                    rx="4"
                    fill="#fff"
                    stroke={C.bd}
                    strokeWidth="1"
                  />
                  <text x={tx + 8} y={cy - 27} fontSize="9.5" fill={C.mu}>
                    {"X̄ #" + (hover + 1)}
                  </text>
                  <text
                    x={tx + 8}
                    y={cy - 15}
                    fontSize="10"
                    fontWeight="700"
                    fill={C.tx}
                  >
                    {"Value: " + _spcFmt(xb[hover])}
                  </text>
                </g>
              );
            })()}
        </svg>
        {showConfig && (
          <DraggableWindow
            title="Nelson Rules Configuration & Demo"
            accent={C.bl}
            onClose={() => setShowConfig(false)}
            initial={{ x: 6, y: 44 }}
            width={340}
            z={22}
          >
            {ConfigBody}
          </DraggableWindow>
        )}
        {showFeed && (
          <DraggableWindow
            title="Nelson Rule Alert Feed"
            accent={C.rd}
            onClose={() => setShowFeed(false)}
            initial={{ x: 360, y: 214 }}
            width={252}
            z={21}
          >
            {FeedBody}
          </DraggableWindow>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 14,
          justifyContent: "center",
          fontSize: 11,
          color: C.mu,
          padding: "8px 0 0",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 12,
              height: 12,
              background: C.rd,
              clipPath:
                "polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)",
              display: "inline-block",
            }}
          />
          Out-of-control (R1)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: "11px solid " + C.am,
              display: "inline-block",
            }}
          />
          Warning (R5/6/8)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 12,
              height: 10,
              background: C.rd,
              opacity: 0.12,
              border: "1px solid " + C.rd,
              borderRadius: 2,
              display: "inline-block",
            }}
          />
          Run / trend (R2/3/4/7)
        </span>
        <span style={{ color: C.mu }}>
          {"⚙ rules  ·  🔔 alerts  ·  drag a window by its title bar"}
        </span>
      </div>
    </Card>
  );
}

function SPCDetail({ p, onBack }) {
  const s = _spcCompute(p);
  const capCol = (v) => (v < 1.0 ? C.rd : v < 1.33 ? C.am : C.gn);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onBack}
          style={{
            padding: "5px 12px",
            borderRadius: 6,
            border: "1px solid " + C.bd,
            background: C.c2,
            color: C.pp,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {"‹ All processes"}
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
            {p.pm}
          </div>
          <div style={{ fontSize: 12, color: C.mu }}>
            {p.mc +
              " · " +
              (p.rc && p.rc !== "All recipes" ? p.rc + " " : "") +
              p.sz +
              " · subgroups of " +
              p.n}
          </div>
        </div>
        <span style={{ marginLeft: "auto" }}>
          <StatusPill status={s.status} />
        </span>
      </div>
      <div
        style={{
          padding: "9px 12px",
          borderRadius: 8,
          border: "1px solid " + (s.covOK ? C.gn : C.am) + "55",
          background: (s.covOK ? C.gn : C.am) + "0E",
          fontSize: 12.5,
          color: C.md,
        }}
      >
        {s.covOK
          ? "✓ Capability study valid — N=" +
            p.covN +
            " across shifts " +
            p.shifts.join("/") +
            " (≥300, all 3 shifts). Cp/Cpk are trustworthy."
          : "⚠ Capability provisional — N=" +
            p.covN +
            ", shifts " +
            p.shifts.join("/") +
            ". Below the N≥300 / 3-shift gate; treat Cp/Cpk as indicative until coverage is met."}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {_SpcTile({
          label: "Cp",
          val: s.cp.toFixed(2),
          sub: "potential (within)",
          col: capCol(s.cp),
        })}
        {_SpcTile({
          label: "Cpk",
          val: s.cpk.toFixed(2),
          sub: "actual (centred)",
          col: capCol(s.cpk),
        })}
        {_SpcTile({
          label: "Pp",
          val: s.pp.toFixed(2),
          sub: "overall",
          col: capCol(s.pp),
        })}
        {_SpcTile({
          label: "Ppk",
          val: s.ppk.toFixed(2),
          sub: "overall (centred)",
          col: capCol(s.ppk),
        })}
        {_SpcTile({
          label: "Sigma level",
          val: s.sigmaLevel.toFixed(1) + "σ",
          sub: "process",
          col: capCol(s.cpk),
        })}
      </div>
      <SpcRuleWorkstation s={s} p={p} />
      <Card title={"R Chart — subgroup range (" + p.unit + ")"} accent={C.pp}>
        <div
          style={{
            background: C.c2,
            borderRadius: 8,
            border: "1px solid " + C.bd,
            padding: "8px 6px",
          }}
        >
          {_RChart({ s })}
        </div>
        <div style={{ fontSize: 11.5, color: C.mu, marginTop: 6 }}>
          {
            "Tracks within-subgroup spread (UCL=D₄R̄). The R chart must be in control before the X̄ chart is trusted — it separates a spread problem from a centring problem."
          }
        </div>
      </Card>
      <Card
        title="Process Capability — distribution vs specification"
        accent={C.pp}
      >
        <div
          style={{
            background: C.c2,
            borderRadius: 8,
            border: "1px solid " + C.bd,
            padding: "8px 6px",
          }}
        >
          {_CapHist({ s, p })}
        </div>
        <div style={{ fontSize: 11.5, color: C.mu, marginTop: 6 }}>
          {
            "Spread of individual readings against USL/LSL with the fitted normal curve. Red bars/tails fall outside spec. Cp compares spec width to process width; Cpk penalises off-centring."
          }
        </div>
      </Card>
    </div>
  );
}

function LiveSpcMini({ chart }) {
  const values = Array.isArray(chart?.values) ? chart.values : [];
  if (!values.length)
    return (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: C.mu,
        }}
      >
        No chart data
      </div>
    );
  const W = 280,
    H = 64,
    padL = 6,
    padR = 6,
    padT = 6,
    padB = 6;
  const pw = W - padL - padR,
    ph = H - padT - padB;
  const lo = values.reduce((m, v) => (v < m ? v : m), chart.lcl ?? Infinity),
    hi = values.reduce((m, v) => (v > m ? v : m), chart.ucl ?? -Infinity),
    pad = (hi - lo) * 0.15 || 1;
  const X = (i) =>
    padL + (values.length <= 1 ? pw / 2 : i * (pw / (values.length - 1)));
  const Y = (v) =>
    padT + ph - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * ph;
  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      style={{ width: "100%", height: "100%" }}
    >
      {chart.ucl != null && (
        <line
          x1={padL}
          y1={Y(chart.ucl)}
          x2={W - padR}
          y2={Y(chart.ucl)}
          stroke={C.rd}
          strokeWidth="0.8"
          strokeDasharray="3 2"
          opacity="0.7"
        />
      )}
      {chart.lcl != null && (
        <line
          x1={padL}
          y1={Y(chart.lcl)}
          x2={W - padR}
          y2={Y(chart.lcl)}
          stroke={C.rd}
          strokeWidth="0.8"
          strokeDasharray="3 2"
          opacity="0.7"
        />
      )}
      {chart.cl != null && (
        <line
          x1={padL}
          y1={Y(chart.cl)}
          x2={W - padR}
          y2={Y(chart.cl)}
          stroke={C.gn}
          strokeWidth="0.8"
          opacity="0.7"
        />
      )}
      <polyline
        points={values.map((v, i) => X(i) + "," + Y(v)).join(" ")}
        fill="none"
        stroke={C.bl}
        strokeWidth="1.4"
      />
    </svg>
  );
}

function spcRuleClass(rule) {
  if (rule === 1) return { label: "Out of Control", color: C.rd, rank: 0 };
  if ([5, 6, 8].includes(rule))
    return { label: "Warning", color: C.am, rank: 1 };
  if ([2, 3, 4, 7].includes(rule))
    return { label: "Run / Trend", color: C.bl, rank: 2 };
  return { label: "Rule", color: C.mu, rank: 3 };
}
function spcPointClass(rules = []) {
  if (!rules.length)
    return { label: "No Nelson violation", color: C.bl, rank: 9 };
  return rules.map(spcRuleClass).sort((a, b) => a.rank - b.rank)[0];
}

/** Above this many points the detail chart draws markers for flagged points only. */
const SPC_DENSE_POINTS = 1500;

function LiveSpcChart({ title, chart, accent }) {
  const points = Array.isArray(chart?.points) ? chart.points : [];
  const [hover, setHover] = useState(null);
  const scrollRef = useRef(null);
  const plotPoints = points.filter((p) => typeof p.value === "number");
  const values = plotPoints.map((p) => p.value);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [plotPoints.length]);
  if (!values.length)
    return (
      <Card title={title} accent={accent}>
        <div
          style={{
            padding: 18,
            textAlign: "center",
            color: C.mu,
            fontSize: 13,
          }}
        >
          No chart data for this selection.
        </div>
      </Card>
    );
  const timeAxis = /\bX\b|X Chart|X Control/i.test(title || "");
  const POINT_GAP = 34,
    VIEW_W = 720,
    H = timeAxis ? 262 : 230,
    padL = 48,
    padR = 70,
    padT = 18,
    padB = timeAxis ? 60 : 28;
  const W = Math.max(VIEW_W, padL + padR + (values.length - 1) * POINT_GAP);
  const pw = W - padL - padR,
    ph = H - padT - padB;
  // reduce, not Math.min(...values): a whole-history chart can carry tens of
  // thousands of points, and spreading them as arguments can overflow.
  const lo0 = values.reduce((m, v) => (v < m ? v : m), chart.lcl ?? Infinity),
    hi0 = values.reduce((m, v) => (v > m ? v : m), chart.ucl ?? -Infinity),
    pad = (hi0 - lo0) * 0.14 || 1,
    lo = lo0 - pad,
    hi = hi0 + pad;
  const X = (i) =>
    padL + (values.length <= 1 ? pw / 2 : i * (pw / (values.length - 1)));
  const Y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph;
  const hoverPoint = hover != null ? plotPoints[hover] : null;
  const hoverRules = hoverPoint?.rules || [];
  const hoverClass = spcPointClass(hoverRules);
  const BOX_W = 224;
  const tx =
    hover != null
      ? Math.min(Math.max(X(hover) - BOX_W / 2, padL), padL + pw - BOX_W)
      : 0;
  const ty = hoverPoint ? Math.max(Y(hoverPoint.value) - 82, padT + 4) : 0;
  return (
    <Card title={title} accent={accent}>
      <div ref={scrollRef} style={{ overflowX: "auto" }}>
        <svg
          viewBox={"0 0 " + W + " " + H}
          onMouseLeave={() => setHover(null)}
          style={{
            width: W,
            minWidth: "100%",
            height: "auto",
            display: "block",
            overflow: "visible",
          }}
        >
          {chart.ucl != null && (
            <line
              x1={padL}
              y1={Y(chart.ucl)}
              x2={padL + pw}
              y2={Y(chart.ucl)}
              stroke={C.rd}
              strokeWidth="1.3"
              strokeDasharray="6 3"
            />
          )}
          {chart.cl != null && (
            <line
              x1={padL}
              y1={Y(chart.cl)}
              x2={padL + pw}
              y2={Y(chart.cl)}
              stroke={C.gn}
              strokeWidth="1.3"
            />
          )}
          {chart.lcl != null && (
            <line
              x1={padL}
              y1={Y(chart.lcl)}
              x2={padL + pw}
              y2={Y(chart.lcl)}
              stroke={C.rd}
              strokeWidth="1.3"
              strokeDasharray="6 3"
            />
          )}
          <polyline
            points={values.map((v, i) => X(i) + "," + Y(v)).join(" ")}
            fill="none"
            stroke={C.bl}
            strokeWidth="2"
          />
          {plotPoints.map((p, i) => {
            const pc = spcPointClass(p.rules);
            const flagged = Boolean(p.rules?.length);
            // A whole-history chart can hold ~24k points; one circle each
            // froze the page. The line already passes through every point,
            // so past SPC_DENSE_POINTS only rule-flagged points get a marker.
            if (!flagged && plotPoints.length > SPC_DENSE_POINTS) return null;
            return (
              <circle
                key={p.index}
                cx={X(i)}
                cy={Y(p.value)}
                r={flagged ? 4.6 : 3}
                fill={flagged ? pc.color : C.bl}
                stroke="#fff"
                strokeWidth={flagged ? 1.3 : 0}
              />
            );
          })}
          {/* One hover target for the whole plot (not one per point): the
              nearest point to the cursor's x is the hovered one. */}
          <rect
            x={padL}
            y={padT}
            width={pw}
            height={ph}
            fill="transparent"
            style={{ cursor: "crosshair" }}
            onMouseMove={(e) => {
              const box =
                e.currentTarget.ownerSVGElement.getBoundingClientRect();
              const svgX = ((e.clientX - box.left) / box.width) * W;
              const step = values.length <= 1 ? 1 : pw / (values.length - 1);
              const i = Math.round((svgX - padL) / step);
              setHover(Math.min(Math.max(i, 0), values.length - 1));
            }}
          />
          {plotPoints.map((p, i) => {
            const minLabelPx = timeAxis ? 56 : 40;
            const every = Math.max(1, Math.round(minLabelPx / POINT_GAP));
            if (i % every !== 0 && i !== plotPoints.length - 1) return null;
            const label = timeAxis ? p.time || p.index : p.index;
            const ly = H - 18;
            return (
              <text
                key={"t" + p.index}
                x={X(i)}
                y={ly}
                fontSize="9.5"
                fontWeight={timeAxis ? "600" : "400"}
                fill={C.tx}
                textAnchor={timeAxis ? "end" : "middle"}
                transform={timeAxis ? `rotate(35 ${X(i)} ${ly})` : undefined}
              >
                {label}
              </text>
            );
          })}
          {chart.ucl != null && (
            <text
              x={padL + pw + 5}
              y={Y(chart.ucl) + 3}
              fontSize="10"
              fill={C.rd}
            >
              {"UCL " + _spcFmt(chart.ucl)}
            </text>
          )}
          {chart.cl != null && (
            <text
              x={padL + pw + 5}
              y={Y(chart.cl) + 3}
              fontSize="10"
              fill={C.gn}
            >
              {"CL " + _spcFmt(chart.cl)}
            </text>
          )}
          {chart.lcl != null && (
            <text
              x={padL + pw + 5}
              y={Y(chart.lcl) + 3}
              fontSize="10"
              fill={C.rd}
            >
              {"LCL " + _spcFmt(chart.lcl)}
            </text>
          )}
          {hoverPoint && (
            <g pointerEvents="none">
              <line
                x1={X(hover)}
                y1={padT}
                x2={X(hover)}
                y2={padT + ph}
                stroke={C.mu}
                strokeWidth="0.8"
                strokeDasharray="3 3"
                opacity="0.55"
              />
              <rect
                x={tx}
                y={ty}
                width={BOX_W}
                height={hoverRules.length ? 76 : 58}
                rx="6"
                fill="#fff"
                stroke={hoverClass.color}
                strokeWidth="1.2"
              />
              <text x={tx + 9} y={ty + 15} fontSize="10" fill={C.mu}>
                {"Point #" +
                  hoverPoint.index +
                  (hoverPoint.time ? " · " + hoverPoint.time : "")}
              </text>
              <text
                x={tx + 9}
                y={ty + 31}
                fontSize="11"
                fontWeight="800"
                fill={C.tx}
              >
                {"Value: " + _spcFmt(hoverPoint.value)}
              </text>
              <text
                x={tx + 9}
                y={ty + 47}
                fontSize="10.5"
                fill={hoverClass.color}
                fontWeight="700"
              >
                {hoverRules.length ? hoverClass.label : "No Nelson violation"}
              </text>
              {hoverRules.length > 0 && (
                <text x={tx + 9} y={ty + 63} fontSize="9.5" fill={C.md}>
                  {"Rules: " +
                    hoverRules.map((r) => "R" + r).join(", ") +
                    " · z " +
                    _spcFmt(hoverPoint.z)}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: C.mu,
          marginTop: 6,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>
          {plotPoints.filter((p) => p.rules?.length).length} points with
          Nelson-rule markers.
        </span>
        {timeAxis && <span>X-axis: sampling time</span>}
        <span style={{ color: C.rd }}>R1 Out of Control</span>
        <span style={{ color: C.am }}>R5/R6/R8 Warning</span>
        <span style={{ color: C.bl }}>R2/R3/R4/R7 Run / Trend</span>
      </div>
      {/* Where the limits came from. The dots are silver readings but the
          band judging them is a gold baseline, and the two can disagree —
          so say which baseline, and say when there is no usable pair at all
          (Nelson is skipped there, and an unlabelled chart would hide it). */}
      <div
        style={{
          fontSize: 11,
          color: chart.limits_valid === false ? C.rd : C.mu,
          marginTop: 4,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {chart.limits_source && <span>Limits: {chart.limits_source}</span>}
        {chart.subgroup_size != null && (
          <span>Subgroup n = {chart.subgroup_size}</span>
        )}
        {chart.sigma != null && <span>&sigma; {_spcFmt(chart.sigma)}</span>}
        {chart.baseline_date && (
          <span>
            Baseline {chart.baseline_date}
            {chart.baseline_on_or_before === false
              ? " (later than the selected date)"
              : ""}
          </span>
        )}
        {chart.limits_valid === false && (
          <span style={{ fontWeight: 700 }}>
            Limits unusable{chart.limits_note ? ` — ${chart.limits_note}` : ""}.
            Nelson rules not evaluated.
          </span>
        )}
      </div>
    </Card>
  );
}

function LiveHistogram({ histogram }) {
  const bins = Array.isArray(histogram?.bins) ? histogram.bins : [];
  const [hoverBin, setHoverBin] = useState(null);
  if (!bins.length) return null;
  const max = Math.max(...bins.map((b) => b.count || 0), 1);
  const curveX = Array.isArray(histogram?.curve?.x) ? histogram.curve.x : [];
  const curveY = Array.isArray(histogram?.curve?.y) ? histogram.curve.y : [];
  const curveMax = Math.max(...curveY, 0);
  const refs = [
    { key: "lsl", label: "LSL", value: histogram.lsl, color: C.rd },
    { key: "target", label: "Target", value: histogram.target, color: C.pp },
    { key: "mean", label: "Mean", value: histogram.mean, color: C.bl },
    { key: "median", label: "Median", value: histogram.median, color: C.gn },
    { key: "usl", label: "USL", value: histogram.usl, color: C.rd },
  ].filter((r) => typeof r.value === "number");
  const sigmaGuides = [histogram.sigma_minus_3, histogram.sigma_plus_3].filter(
    (v) => typeof v === "number",
  );
  // Domain is anchored to where the data actually lives (bins + curve), not
  // to spec/sigma reference values, so a far-off LSL/USL doesn't compress
  // the bars into a sliver of the chart. Refs/guides only get to stretch the
  // domain a bounded amount; beyond that they're clamped to the edge when
  // rendered (see clampX below).
  const dataXs = [
    ...bins.map((b) => b.from),
    ...bins.map((b) => b.to),
    ...curveX,
  ].filter((v) => typeof v === "number" && Number.isFinite(v));
  const dataLo = dataXs.length ? Math.min(...dataXs) : 0;
  const dataHi = dataXs.length ? Math.max(...dataXs) : 1;
  const dataPad = (dataHi - dataLo) * 0.06 || 1;
  const domainLo0 = dataLo - dataPad;
  const domainHi0 = dataHi + dataPad;
  const extendSlack = (dataHi - dataLo) * 0.35 || 1;
  const extendVals = [...refs.map((r) => r.value), ...sigmaGuides].filter(
    (v) => v >= domainLo0 - extendSlack && v <= domainHi0 + extendSlack,
  );
  const lo = Math.min(domainLo0, ...extendVals);
  const hi = Math.max(domainHi0, ...extendVals);
  const clampX = (v) => Math.min(hi, Math.max(lo, v));
  const W = 760,
    padL = 36,
    padR = 22,
    padB = 34;
  const pw = W - padL - padR;
  const X = (v) => padL + ((v - lo) / (hi - lo || 1)) * pw;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (i / 4) * (hi - lo));
  const refRows = [];
  {
    const rowRight = [];
    [...refs]
      .sort((a, b) => X(clampX(a.value)) - X(clampX(b.value)))
      .forEach((r) => {
        const text = r.label + " " + _spcFmt(r.value);
        const halfW = (text.length * 5.6 + 6) / 2;
        const x = X(clampX(r.value));
        let row = rowRight.findIndex((right) => x - halfW > right + 4);
        if (row === -1) {
          row = rowRight.length;
          rowRight.push(x + halfW);
        } else {
          rowRight[row] = x + halfW;
        }
        refRows.push({ key: r.key, row });
      });
  }
  const rowCount = Math.max(1, ...refRows.map((r) => r.row + 1));
  const padT = 16 + rowCount * 13;
  const ph = 157;
  const H = padT + ph + padB;
  const Y = (c) => padT + ph - (c / max) * ph;
  const YCurve = (v) =>
    padT + ph - (curveMax > 0 ? (v / curveMax) * ph * 0.92 : 0);
  const curvePoints =
    curveX.length && curveY.length
      ? curveX
          .map((x, i) =>
            typeof x === "number" && typeof curveY[i] === "number"
              ? `${X(x)},${YCurve(curveY[i])}`
              : null,
          )
          .filter(Boolean)
          .join(" ")
      : "";
  return (
    <Card
      title="Process Capability — distribution vs specification"
      accent={C.pp}
    >
      <div
        style={{
          background: C.c2,
          border: "1px solid " + C.bd,
          borderRadius: 8,
          padding: "8px 6px",
        }}
      >
        <svg
          viewBox={"0 0 " + W + " " + H}
          style={{ width: "100%", height: "auto", display: "block" }}
          onMouseLeave={() => setHoverBin(null)}
        >
          <line
            x1={padL}
            y1={padT + ph}
            x2={padL + pw}
            y2={padT + ph}
            stroke={C.bd}
            strokeWidth="1"
          />
          {ticks.map((v, i) => {
            const x = X(v);
            return (
              <g key={`tick-${i}`} pointerEvents="none">
                <line
                  x1={x}
                  y1={padT + ph}
                  x2={x}
                  y2={padT + ph + 4}
                  stroke={C.bd}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padT + ph + 15}
                  fontSize="9"
                  fill={C.mu}
                  textAnchor="middle"
                >
                  {_spcFmt(v)}
                </text>
              </g>
            );
          })}
          {bins.map((b, i) => {
            const x = X(b.from),
              w = Math.max(1, X(b.to) - X(b.from) - 1),
              y = Y(b.count || 0);
            const hovered = hoverBin === i;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={padT + ph - y}
                  fill={b.out_of_spec ? C.rd : C.bl}
                  opacity={hovered ? 1 : b.out_of_spec ? 0.9 : 0.58}
                  rx="2"
                />
                <rect
                  x={x}
                  y={padT}
                  width={w}
                  height={ph}
                  fill="transparent"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHoverBin(i)}
                />
              </g>
            );
          })}
          {curvePoints ? (
            <polyline
              points={curvePoints}
              fill="none"
              stroke={C.pp}
              strokeWidth="2"
              opacity="0.85"
              pointerEvents="none"
            />
          ) : null}
          {sigmaGuides.map((v, i) => {
            const clamped = v !== clampX(v);
            const x = X(clampX(v));
            return (
              <line
                key={`sigma-${i}`}
                x1={x}
                y1={padT}
                x2={x}
                y2={padT + ph}
                stroke={C.mu}
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity={clamped ? 0.3 : 0.55}
                pointerEvents="none"
              />
            );
          })}
          {refs.map((r) => {
            const clamped = r.value !== clampX(r.value);
            const x = X(clampX(r.value));
            const row = refRows.find((rr) => rr.key === r.key)?.row ?? 0;
            return (
              <g key={r.key} pointerEvents="none">
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={padT + ph}
                  stroke={r.color}
                  strokeWidth={r.key === "median" ? "1.5" : "1.8"}
                  strokeDasharray={
                    clamped ? "3 2" : r.key === "median" ? "4 3" : undefined
                  }
                  opacity={clamped ? 0.6 : 1}
                />
                <text
                  x={x}
                  y={padT - 8 - (rowCount - 1 - row) * 13}
                  fontSize="9.5"
                  fill={r.color}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {r.label + " " + _spcFmt(r.value)}
                </text>
              </g>
            );
          })}
          {hoverBin != null &&
            bins[hoverBin] &&
            (() => {
              const b = bins[hoverBin];
              const bx = X(b.from),
                bw = Math.max(1, X(b.to) - X(b.from) - 1),
                by = Y(b.count || 0);
              const boxW = 132,
                boxH = 40;
              const tx = Math.min(
                Math.max(bx + bw / 2 - boxW / 2, padL),
                padL + pw - boxW,
              );
              const ty = Math.max(by - boxH - 6, 2);
              return (
                <g pointerEvents="none">
                  <rect
                    x={tx}
                    y={ty}
                    width={boxW}
                    height={boxH}
                    rx="6"
                    fill="#fff"
                    stroke={b.out_of_spec ? C.rd : C.bl}
                    strokeWidth="1.2"
                  />
                  <text x={tx + 8} y={ty + 16} fontSize="10" fill={C.mu}>
                    {_spcFmt(b.from) + " – " + _spcFmt(b.to)}
                  </text>
                  <text
                    x={tx + 8}
                    y={ty + 31}
                    fontSize="11"
                    fontWeight="800"
                    fill={C.tx}
                  >
                    {"Count: " + b.count}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>
      <div style={{ fontSize: 11.5, color: C.mu, marginTop: 6 }}>
        Sample size {histogram.sample_size ?? "—"} · Mean{" "}
        {histogram.mean != null ? _spcFmt(histogram.mean) : "—"} · Median{" "}
        {histogram.median != null ? _spcFmt(histogram.median) : "—"} · Std{" "}
        {histogram.std != null ? _spcFmt(histogram.std) : "—"} · OOS{" "}
        {/* With no spec window there is nothing to be out of, so the count is
            unknown rather than zero — "OOS 0" would read as a clean process. */}
        {histogram.spec_limits_available
          ? (histogram.out_of_spec?.count ?? 0)
          : "—"}
      </div>
      {/* Only Belt 1 Length has a documented tolerance; the rest are either
          extended from it ("assumed") or have none. An invented spec window
          is worse than a missing one, so the chart draws no USL/LSL and this
          line says why. */}
      <div style={{ fontSize: 11, color: C.mu, marginTop: 3 }}>
        {histogram.spec_limits_available ? (
          <span
            style={{
              color: histogram.tolerance_provenance === "assumed" ? C.am : C.mu,
            }}
          >
            Spec window: {histogram.spec_source}
            {histogram.tolerance_provenance === "assumed"
              ? " · tolerance assumed, not plant-documented"
              : ""}
          </span>
        ) : (
          <span>
            Spec limits not shown
            {histogram.spec_note ? ` — ${histogram.spec_note}` : ""}
          </span>
        )}
      </div>
    </Card>
  );
}

const SPC_CARDS_PER_PAGE = 60;

function LiveSPCOverview({ date, from, to, shift, onSelect }) {
  const [machine, setMachine] = useState("All");
  const [recipe, setRecipe] = useState("All");
  const [headline, setHeadline] = useState("All");
  const [options, setOptions] = useState({ machines: [], recipes: [] });
  const [baseWidgets, setBaseWidgets] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [snapshotDate, setSnapshotDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Cards rendered so far. Every card draws a sparkline now that chart points
  // are whole-history; ~2,000 at once froze the page.
  const [shown, setShown] = useState(SPC_CARDS_PER_PAGE);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setShown(SPC_CARDS_PER_PAGE);
    Promise.all([
      getSpcFilterOptions({ date: to || date, shift }),
      getSpcWidgets({ date, from, to, shift, machine, recipe }),
      getSpcWidgets({
        date,
        from,
        to,
        shift,
        machine,
        recipe,
        headlineStatus: headline,
      }),
    ])
      .then(([opt, baseBoard, board]) => {
        if (cancelled) return;
        setOptions(opt || { machines: [], recipes: [] });
        setBaseWidgets(
          Array.isArray(baseBoard?.widgets) ? baseBoard.widgets : [],
        );
        setWidgets(Array.isArray(board?.widgets) ? board.widgets : []);
        setSnapshotDate(
          board?.context?.snapshot_date ??
            baseBoard?.context?.snapshot_date ??
            opt?.context?.snapshot_date ??
            null,
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, from, to, shift, machine, recipe, headline]);
  const baseCounts = baseWidgets.reduce(
    (acc, w) => {
      acc.total += 1;
      if (w.headline_status === "Critical") acc.critical += 1;
      else if (w.headline_status === "Major") acc.major += 1;
      else if (w.headline_status === "Warning") acc.warning += 1;
      else if (w.headline_status === "Healthy") acc.healthy += 1;
      else acc.insufficient += 1;
      return acc;
    },
    {
      total: 0,
      critical: 0,
      major: 0,
      warning: 0,
      healthy: 0,
      insufficient: 0,
    },
  );
  const tiles = [
    ["Processes", baseCounts.total, C.tx, "All"],
    ["Out of specification", baseCounts.critical, C.rd, "Critical"],
    ["Marginal", baseCounts.major, C.ac, "Major"],
    ["Not capable", baseCounts.warning, C.am, "Warning"],
    ["Capable", baseCounts.healthy, C.gn, "Healthy"],
    ["Insufficient", baseCounts.insufficient, C.mu, "Insufficient Data"],
  ];
  const sel = {
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid " + C.bd,
    background: C.cd,
    color: C.tx,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    maxWidth: 260,
  };
  if (error)
    return (
      <div
        style={{
          padding: "22px 16px",
          background: C.cd,
          border: "1px solid " + C.bd,
          borderRadius: 8,
          color: C.rd,
        }}
      >
        SPC fetch failed: {error.message || "Request failed"}
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tiles.map(([label, val, col, key]) => (
          <_SpcTile
            key={label}
            label={label}
            val={loading ? "..." : val}
            sub={key === "All" ? "under SPC" : ""}
            col={col}
            onClick={() => setHeadline(headline === key ? "All" : key)}
            active={headline === key}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 12px",
          background: "#F8FAFC",
          borderRadius: 10,
          border: "1px solid " + C.bd,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: C.mu,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".3px",
          }}
        >
          Filter
        </span>
        <label
          style={{
            fontSize: 12,
            color: C.mu,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          Machine
          <select
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
            style={sel}
          >
            <option>All</option>
            {(options.machines || []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            fontSize: 12,
            color: C.mu,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          Recipe
          <select
            value={recipe}
            onChange={(e) => setRecipe(e.target.value)}
            style={sel}
          >
            <option>All</option>
            {(options.recipes || []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {(machine !== "All" || recipe !== "All" || headline !== "All") && (
          <button
            onClick={() => {
              setMachine("All");
              setRecipe("All");
              setHeadline("All");
            }}
            style={{ ...sel, color: C.pp, fontWeight: 700 }}
          >
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.mu }}>
          {loading
            ? "Fetching SPC..."
            : `Showing ${widgets.length} of ${baseCounts.total} charts`}
        </span>
      </div>
      {from && to ? (
        <div style={{ fontSize: 11.5, color: C.mu }}>
          Cp / Cpk / Pp / Ppk are averaged over {from} to {to} — gold publishes
          SPC capability per day only, so a range has no snapshot of its own.
          Charts show each combination's latest 300 subgroups (1,500 readings),
          whatever their date.
        </div>
      ) : snapshotDate ? (
        <div style={{ fontSize: 11.5, color: C.mu }}>
          Snapshot {snapshotDate}. SPC rows use the latest available snapshot on
          or before the selected date. Charts show each combination's latest 300
          subgroups (1,500 readings), whatever their date.
        </div>
      ) : null}
      {!loading && widgets.length === 0 ? (
        <div
          style={{
            padding: "28px 16px",
            textAlign: "center",
            color: C.mu,
            fontSize: 13,
            background: C.cd,
            border: "1px dashed " + C.bd,
            borderRadius: 10,
          }}
        >
          No SPC rows for this selection.
        </div>
      ) : null}
      {loading ? (
        <QualityLoader minHeight={360} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
            gap: 10,
          }}
        >
          {widgets.slice(0, shown).map((w, i) => {
            const col = spcStatus(w.headline_status).col;
            return (
              <div
                key={`${w.machine}|${w.recipe}|${w.parameter}|${i}`}
                onClick={() =>
                  onSelect({
                    machine: w.machine,
                    recipe: w.recipe,
                    parameter: w.parameter,
                  })
                }
                style={{
                  cursor: "pointer",
                  background: productionCardBg(col),
                  border: "1px solid " + col + "35",
                  borderRadius: 10,
                  padding: "14px 16px",
                  boxShadow:
                    "0 1px 3px rgba(0,0,0,.05), 0 2px 8px rgba(0,0,0,.035)",
                  minHeight: 150,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.tx,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {w.parameter}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: C.mu,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {w.machine + " · " + w.recipe}
                    </div>
                  </div>
                  <StatusPill status={spcStatus(w.headline_status).pill} />
                </div>
                <div
                  style={{
                    height: 64,
                    marginTop: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    fontSize: 12,
                    color: C.mu,
                  }}
                >
                  {w.control_chart ? (
                    <LiveSpcMini chart={w.control_chart} />
                  ) : (
                    w.insufficient?.reason ||
                    `Insufficient sample size ${w.insufficient?.sample_size ?? "—"}`
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: "auto",
                    paddingTop: 6,
                    fontSize: 11.5,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: C.mu }}>
                    Cp{" "}
                    <b style={{ color: col }}>
                      {typeof w.cp === "number" ? w.cp.toFixed(2) : "—"}
                    </b>
                  </span>
                  <span style={{ color: C.mu }}>
                    Cpk{" "}
                    <b style={{ color: col }}>
                      {typeof w.cpk === "number" ? w.cpk.toFixed(2) : "—"}
                    </b>
                  </span>
                  <span style={{ color: C.mu, marginLeft: "auto" }}>
                    {w.subgroups ?? "—"} subgroups · {w.sample_size ?? "—"}{" "}
                    readings
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && shown < widgets.length ? (
        <button
          onClick={() => setShown((n) => n + SPC_CARDS_PER_PAGE)}
          style={{ ...sel, alignSelf: "center", color: C.pp, fontWeight: 700 }}
        >
          Show more ({widgets.length - shown} remaining)
        </button>
      ) : null}
    </div>
  );
}

function spcTrendWindow(view, to) {
  if (view === "daily") {
    return { from: offsetIsoDate(to, -29), to, label: "Daily · last 30 days" };
  }
  const end = new Date(`${to}T00:00:00Z`);
  if (view === "monthly") {
    const start = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1),
    );
    return {
      from: start.toISOString().slice(0, 10),
      to,
      label: "Monthly · last 12 months",
    };
  }
  return {
    from: `${end.getUTCFullYear() - 4}-01-01`,
    to,
    label: "Yearly · last 5 years",
  };
}

function aggregateSpcTrend(points, view) {
  if (view === "daily") return points;
  const groups = new Map();
  for (const point of points) {
    const key =
      view === "monthly" ? point.date.slice(0, 7) : point.date.slice(0, 4);
    const group = groups.get(key) || { date: key, total: 0, count: 0 };
    group.total += Number(point.value);
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    date: group.date,
    value: group.total / group.count,
  }));
}

function SPCCapabilityTrendChart({ points, target, baseline, view, endDate }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const width = 1420;
  const height = 410;
  const pad = { left: 70, right: 24, top: 38, bottom: 46 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => Number(point.value));
  const low = Math.min(...values, target, baseline);
  const high = Math.max(...values, target, baseline);
  const spread = high - low || Math.abs(high) * 0.2 || 1;
  const min = low - spread * 0.14;
  const max = high + spread * 0.14;
  const x = (index) =>
    points.length === 1
      ? pad.left + plotWidth
      : pad.left + (index * plotWidth) / (points.length - 1);
  const y = (value) => pad.top + ((max - value) / (max - min)) * plotHeight;
  const targetY = y(target);
  const baselineY = y(baseline);
  const axisEvery = Math.max(1, Math.ceil(points.length / 7));
  const formatAxisLabel = (point) => {
    if (view === "monthly") {
      const [year, month] = point.date.split("-").map(Number);
      return new Intl.DateTimeFormat("en", {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(year, month - 1, 1)));
    }
    if (view === "yearly") return point.date;
    const days = Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${point.date}T00:00:00Z`)) /
        86400000,
    );
    return days === 0 ? "Today" : `${days}d`;
  };
  const formatHoverLabel = (point) => {
    if (view === "monthly") {
      const [year, month] = point.date.split("-").map(Number);
      return new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(year, month - 1, 1)));
    }
    if (view === "yearly") return point.date;
    return toDisplayDate(point.date) || point.date;
  };
  const fmt = (value) =>
    Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  const hoveredPoint = hoveredIndex == null ? null : points[hoveredIndex];
  const tooltipWidth = 176;
  const tooltipHeight = 58;
  const hoveredX = hoveredPoint ? x(hoveredIndex) : 0;
  const hoveredY = hoveredPoint ? y(hoveredPoint.value) : 0;
  const tooltipX = Math.min(
    Math.max(hoveredX - tooltipWidth / 2, pad.left + 4),
    width - pad.right - tooltipWidth - 4,
  );
  const tooltipY =
    hoveredY - tooltipHeight - 14 < pad.top
      ? hoveredY + 14
      : hoveredY - tooltipHeight - 14;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="SPC capability trend"
      onMouseLeave={() => setHoveredIndex(null)}
      style={{ display: "block", minWidth: 680 }}
    >
      <rect
        x={pad.left}
        y={pad.top}
        width={plotWidth}
        height={Math.max(0, targetY - pad.top)}
        fill="#EFF8F2"
      />
      <rect
        x={pad.left}
        y={targetY}
        width={plotWidth}
        height={pad.top + plotHeight - targetY}
        fill="#FFF5F3"
      />
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const value = max - ratio * (max - min);
        const yy = pad.top + ratio * plotHeight;
        return (
          <g key={ratio}>
            <line
              x1={pad.left}
              y1={yy}
              x2={pad.left + plotWidth}
              y2={yy}
              stroke="#E3E8F0"
              strokeDasharray="3 4"
            />
            <text
              x={pad.left - 12}
              y={yy + 4}
              textAnchor="end"
              fontSize="12"
              fill="#8A96AC"
            >
              {fmt(value)}
            </text>
          </g>
        );
      })}
      <line
        x1={pad.left}
        y1={targetY}
        x2={pad.left + plotWidth}
        y2={targetY}
        stroke="#D18A00"
        strokeWidth="2.5"
        strokeDasharray="9 5"
      />
      <text
        x={pad.left + 8}
        y={targetY - 9}
        fontSize="13"
        fontWeight="700"
        fill="#C98500"
      >
        Target {target.toFixed(2)}
      </text>
      <line
        x1={pad.left}
        y1={baselineY}
        x2={pad.left + plotWidth}
        y2={baselineY}
        stroke="#98A3B7"
        strokeWidth="1.6"
        strokeDasharray="2 5"
      />
      <text
        x={pad.left + plotWidth - 8}
        y={baselineY - 7}
        textAnchor="end"
        fontSize="12"
        fill="#8A96AC"
      >
        Baseline {baseline.toFixed(2)}
      </text>
      {points.length > 1 && (
        <polyline
          points={points
            .map((point, index) => `${x(index)},${y(point.value)}`)
            .join(" ")}
          fill="none"
          stroke="#D18A00"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {points.map((point, index) => {
        const isLast = index === points.length - 1;
        return (
          <g key={`${point.date}-${index}`}>
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r={hoveredIndex === index ? 6.5 : isLast ? 6 : 2.5}
              fill="#D18A00"
              stroke={hoveredIndex === index ? "#fff" : "none"}
              strokeWidth={hoveredIndex === index ? 2 : 0}
            />
            <circle
              cx={x(index)}
              cy={y(point.value)}
              r="12"
              fill="transparent"
              tabIndex="0"
              aria-label={`${formatHoverLabel(point)}: ${Number(point.value).toFixed(3)}`}
              style={{ cursor: "crosshair", outline: "none" }}
              onMouseEnter={() => setHoveredIndex(index)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
            />
            {(index % axisEvery === 0 || isLast) && (
              <text
                x={x(index)}
                y={height - 15}
                textAnchor={isLast ? "end" : index === 0 ? "start" : "middle"}
                fontSize="12"
                fill="#536079"
              >
                {formatAxisLabel(point)}
              </text>
            )}
          </g>
        );
      })}
      {hoveredPoint && (
        <g pointerEvents="none">
          <line
            x1={hoveredX}
            y1={pad.top}
            x2={hoveredX}
            y2={pad.top + plotHeight}
            stroke="#7C879B"
            strokeWidth="1"
            strokeDasharray="3 4"
            opacity=".7"
          />
          <rect
            x={tooltipX}
            y={tooltipY}
            width={tooltipWidth}
            height={tooltipHeight}
            rx="7"
            fill="#1F2937"
            opacity=".96"
          />
          <text
            x={tooltipX + 12}
            y={tooltipY + 21}
            fontSize="12"
            fontWeight="600"
            fill="#CBD5E1"
          >
            {formatHoverLabel(hoveredPoint)}
          </text>
          <text
            x={tooltipX + 12}
            y={tooltipY + 43}
            fontSize="15"
            fontWeight="800"
            fill="#FFFFFF"
          >
            {Number(hoveredPoint.value).toFixed(3)}
          </text>
        </g>
      )}
      <text
        x={pad.left + plotWidth}
        y={pad.top - 14}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#C98500"
      >
        Now
      </text>
    </svg>
  );
}

function SPCCapabilityTrendModal({ selection, metric, date, shift, onClose }) {
  const initialTo = date || todayInIST();
  const [view, setView] = useState("daily");
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const trendWindow = spcTrendWindow(view, initialTo);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSpcTrend({
      from: trendWindow.from,
      to: trendWindow.to,
      shift,
      ...selection,
      metric,
    })
      .then((response) => {
        if (!cancelled) setPoints(response?.points || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, selection, shift, trendWindow.from, trendWindow.to]);

  const chartPoints = aggregateSpcTrend(points, view);
  const series = chartPoints.map((point) => Number(point.value));
  const target = 1.33;
  const current = series.at(-1) ?? null;
  const baseline = series[0] ?? null;
  const gap = current == null ? null : target - current;
  const delta = current == null || baseline == null ? null : current - baseline;
  const meetsTarget = current != null && current >= target;
  const accent = meetsTarget ? C.gn : "#D18A00";

  return (
    <div
      className="no-print"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(15,23,42,.55)",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "calc(100% - 40px)",
          maxWidth: 1600,
          maxHeight: "94vh",
          overflow: "auto",
          border: "1px solid " + C.bd,
          borderRadius: 12,
          background: C.cd,
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            padding: "20px 24px",
            borderBottom: "1px solid " + C.bd,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: C.mu,
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".5px",
              }}
            >
              Trend
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: C.tx, fontSize: 24, fontWeight: 750 }}>
                {metric} — {selection.parameter}
              </span>
              {current != null && (
                <>
                  <span
                    style={{
                      padding: "3px 12px",
                      borderRadius: 999,
                      background: meetsTarget ? "#ECF8EF" : "#FFF6E8",
                      color: accent,
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                    }}
                  >
                    {meetsTarget ? "On target" : "Watch"}
                  </span>
                  <span
                    style={{
                      padding: "3px 12px",
                      borderRadius: 999,
                      background: "#FFF8EC",
                      color: "#C98500",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {gap > 0
                      ? `gap ${gap.toFixed(2)} to target`
                      : `${Math.abs(gap).toFixed(2)} above target`}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close trend"
            title="Close"
            style={{
              width: 38,
              height: 38,
              flex: "0 0 38px",
              border: "1px solid " + C.bd,
              borderRadius: 7,
              background: C.c2,
              color: C.mu,
              cursor: "pointer",
              fontSize: 25,
              lineHeight: 1,
            }}
          >
            {"×"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "14px 24px",
            borderBottom: "1px solid " + C.bd,
          }}
        >
          <span
            style={{
              color: C.mu,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            View
          </span>
          {[
            ["daily", "Daily"],
            ["monthly", "Monthly"],
            ["yearly", "Yearly"],
          ].map(([id, label]) => {
            const active = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                style={{
                  minWidth: 82,
                  padding: "6px 16px",
                  border: "1px solid " + (active ? C.bl : C.bd),
                  borderRadius: 999,
                  background: active ? "#EEF5FF" : C.c2,
                  color: active ? C.bl : C.tx,
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto", color: C.mu, fontSize: 12.5 }}>
            {trendWindow.label}
          </span>
        </div>

        <div style={{ padding: "18px 24px 22px", overflowX: "auto" }}>
          {loading ? (
            <QualityLoader minHeight={420} />
          ) : error ? (
            <div style={{ padding: 60, textAlign: "center", color: C.rd }}>
              Trend fetch failed: {error.message || "Request failed"}
            </div>
          ) : !series.length ? (
            <div style={{ padding: 60, textAlign: "center", color: C.mu }}>
              No {metric} trend data for this date range.
            </div>
          ) : (
            <>
              <SPCCapabilityTrendChart
                points={chartPoints}
                target={target}
                baseline={baseline}
                view={view}
                endDate={initialTo}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 22,
                  flexWrap: "wrap",
                  margin: "4px 0 18px",
                  color: C.mu,
                  fontSize: 12,
                }}
              >
                <TrendLegendItem color="#D18A00" label="Actual" />
                <TrendLegendItem color="#D18A00" label="Target" dashed />
                <TrendLegendItem color="#98A3B7" label="Baseline" dotted />
                <TrendLegendItem color="#A9DAB5" label="Good zone" block />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
                  gap: 10,
                }}
              >
                <TrendSummary
                  label="Current"
                  value={current.toFixed(2)}
                  color={accent}
                />
                <TrendSummary
                  label="Target"
                  value={target.toFixed(2)}
                  note="higher is better"
                  color="#D18A00"
                />
                <TrendSummary
                  label="Vs baseline"
                  value={`${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(3)}`}
                  note={`from ${baseline.toFixed(3)}`}
                  color={delta >= 0 ? C.gn : C.rd}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendLegendItem({ color, label, dashed, dotted, block }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={
          block
            ? { width: 14, height: 14, borderRadius: 2, background: color }
            : {
                width: 20,
                height: 0,
                borderTop: `2px ${dashed ? "dashed" : dotted ? "dotted" : "solid"} ${color}`,
              }
        }
      />
      {label}
    </span>
  );
}

function TrendSummary({ label, value, note, color }) {
  return (
    <div
      style={{
        minHeight: 74,
        padding: "12px 16px",
        border: "1px solid " + C.bd,
        borderRadius: 8,
        background: "#FAFBFD",
      }}
    >
      <div
        style={{
          color: C.mu,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".5px",
        }}
      >
        {label}
      </div>
      <div style={{ color, fontSize: 23, fontWeight: 800, lineHeight: 1.2 }}>
        {value}
      </div>
      {note && <div style={{ color: C.mu, fontSize: 12 }}>{note}</div>}
    </div>
  );
}

function LiveSPCDetail({ selection, date, from, to, shift, onBack }) {
  const [detail, setDetail] = useState(null);
  const [trendMetric, setTrendMetric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSpcDetail({ date, from, to, shift, ...selection })
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    date,
    from,
    to,
    shift,
    selection?.machine,
    selection?.recipe,
    selection?.parameter,
  ]);
  if (error)
    return (
      <div
        style={{
          padding: "22px 16px",
          background: C.cd,
          border: "1px solid " + C.bd,
          borderRadius: 8,
          color: C.rd,
        }}
      >
        SPC detail fetch failed: {error.message || "Request failed"}
      </div>
    );
  const cap = detail?.capability || {};
  const capCol = (v) =>
    v == null ? C.mu : v < 1 ? C.rd : v < 1.33 ? C.am : C.gn;
  const snapshotDate = detail?.context?.snapshot_date;
  const shiftSupported = detail?.context?.shift_supported;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onBack}
          style={{
            padding: "5px 12px",
            borderRadius: 6,
            border: "1px solid " + C.bd,
            background: C.c2,
            color: C.pp,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {"‹ All processes"}
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
            {selection.parameter}
          </div>
          <div style={{ fontSize: 12, color: C.mu }}>
            {selection.machine + " · " + selection.recipe}
            {from && to
              ? ` · Average ${from} to ${to}`
              : snapshotDate
                ? ` · Snapshot ${snapshotDate}`
                : ""}
            {shiftSupported === false ? " · All shifts" : ""}
          </div>
        </div>
        <span style={{ marginLeft: "auto" }}>
          {loading ? (
            <span style={{ fontSize: 11.5, color: C.mu, fontWeight: 700 }}>
              Loading
            </span>
          ) : (
            <StatusPill status={spcStatus(cap.headline_status).pill} />
          )}
        </span>
      </div>
      {loading ? (
        <QualityLoader minHeight={360} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["cp", "cpk", "pp", "ppk"].map((k) => {
              const cell = cap[k] || {};
              return (
                <_SpcTile
                  key={k}
                  label={k.toUpperCase()}
                  val={
                    loading
                      ? "..."
                      : typeof cell.value === "number"
                        ? cell.value.toFixed(2)
                        : (cell.value ?? "—")
                  }
                  sub={cell.status || ""}
                  col={capCol(cell.value)}
                  onTrend={() =>
                    setTrendMetric(k[0].toUpperCase() + k.slice(1))
                  }
                />
              );
            })}
          </div>
          {detail?.insufficient ? (
            <Card title="Insufficient Data" accent={C.am}>
              <div style={{ fontSize: 13, color: C.md }}>
                {detail.insufficient.reason
                  ? detail.insufficient.reason[0].toUpperCase() +
                    detail.insufficient.reason.slice(1) +
                    "."
                  : "No measurements available for this selection."}
              </div>
            </Card>
          ) : null}
          {detail?.x_chart && (
            <LiveSpcChart
              title="Interactive Process Control — X Chart with Nelson Rules"
              chart={detail.x_chart}
              accent={C.pp}
            />
          )}
          {Array.isArray(detail?.alerts) && detail.alerts.length ? (
            <LiveSpcAlerts alerts={detail.alerts} />
          ) : null}
          {detail?.r_chart && (
            <LiveSpcChart
              title="R Chart — subgroup range"
              chart={detail.r_chart}
              accent={C.pp}
            />
          )}
          {detail?.histogram && <LiveHistogram histogram={detail.histogram} />}
          {trendMetric && (
            <SPCCapabilityTrendModal
              selection={selection}
              metric={trendMetric}
              date={snapshotDate || date}
              shift={shift}
              onClose={() => setTrendMetric(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function LiveSpcAlerts({ alerts }) {
  const [severityFilter, setSeverityFilter] = useState("All");
  const allAlerts = Array.isArray(alerts) ? alerts : [];
  const severityColor = (severity) =>
    severity === "Out of Control" ? C.rd : severity === "Warning" ? C.am : C.bl;
  const severityOptions = [...new Set(allAlerts.map((alert) => alert.severity))]
    .filter(Boolean)
    .sort((a, b) => {
      const order = { "Out of Control": 0, Warning: 1, "Run/Trend": 2 };
      return (order[a] ?? 9) - (order[b] ?? 9);
    });
  const rows = allAlerts
    .filter(
      (alert) => severityFilter === "All" || alert.severity === severityFilter,
    )
    .map((alert) => ({
      ...alert,
      pointsLabel:
        alert.points?.first == null
          ? "—"
          : alert.points.first === alert.points.last
            ? String(alert.points.first)
            : `${alert.points.first}–${alert.points.last}`,
      firstTime: alert.time?.first || "",
      lastTime: alert.time?.last || alert.time?.first || "",
    }))
    .sort((a, b) => b.firstTime.localeCompare(a.firstTime));
  const columns = [
    {
      key: "rule",
      label: "Rule",
      align: "left",
      minWidth: 72,
      value: (row) => `R${row.rule}`,
      sortValue: (row) => row.rule,
      filterable: false,
      render: (row) => (
        <Box
          component="span"
          sx={{ color: severityColor(row.severity), fontWeight: 800 }}
        >
          R{row.rule}
        </Box>
      ),
    },
    {
      key: "chart",
      label: "Chart",
      align: "left",
      minWidth: 84,
      filterable: false,
    },
    {
      key: "severity",
      label: "Severity",
      align: "left",
      minWidth: 150,
      render: (row) => {
        const color = severityColor(row.severity);
        return (
          <Box
            component="span"
            sx={{
              display: "inline-block",
              px: 1,
              py: 0.35,
              borderRadius: 1,
              bgcolor: `${color}14`,
              color,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {row.severity}
          </Box>
        );
      },
    },
    {
      key: "pointsLabel",
      label: "Points",
      align: "left",
      minWidth: 100,
      filterable: false,
    },
    {
      key: "firstTime",
      label: "First time",
      align: "left",
      minWidth: 190,
      sortValue: (row) => Date.parse(row.firstTime) || 0,
      filterable: false,
    },
    {
      key: "lastTime",
      label: "Last time",
      align: "left",
      minWidth: 190,
      sortValue: (row) => Date.parse(row.lastTime) || 0,
      filterable: false,
    },
  ];

  const severityFilterControl = (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography
        sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}
      >
        Severity
      </Typography>
      <Select
        size="small"
        value={severityFilter}
        onChange={(event) => setSeverityFilter(event.target.value)}
        inputProps={{ "aria-label": "Filter alerts by severity" }}
        sx={{ minWidth: 150, height: 36, fontSize: 13 }}
      >
        <MenuItem value="All">All severities</MenuItem>
        {severityOptions.map((severity) => (
          <MenuItem key={severity} value={severity}>
            {severity}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  );

  return (
    <Card title={`Nelson Rule Alerts (${rows.length})`} accent={C.pp}>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.alert_id}
        searchPlaceholder="Search alerts"
        emptyMessage="No alerts match this filter."
        maxHeight={400}
        stickyHeader
        toolbarRight={severityFilterControl}
      />
    </Card>
  );
}

function SPCTab({ spcSel, setSpcSel, date, from, to, shift }) {
  return spcSel ? (
    <LiveSPCDetail
      selection={spcSel}
      date={date}
      from={from}
      to={to}
      shift={shift}
      onBack={() => setSpcSel(null)}
    />
  ) : (
    <LiveSPCOverview
      date={date}
      from={from}
      to={to}
      shift={shift}
      onSelect={setSpcSel}
    />
  );
}

const CURING_SCRAP_KPI = {
  id: "sc",
  name: "Scrap",
  agg: "SUM",
  drillType: "qScrapRework",
  drillTargets: [
    "Scrap_s",
    "Scrap_reason",
    "Scrap_m",
    "Scrap_sku",
    "Scrap_m_sku",
  ],
};

const PRODUCT_KPI_LABELS = {
  Mtms_Uniformity_Yield: "MTMS Uniformity",
  Tuo_Uniformity_Yield: "TUO Uniformity",
  Zf_Uniformity_Yield: "ZF Uniformity",
  Zf_Balancing_Yield_o: "ZF Balancing",
  Dbm_Balancing_Yield: "DBM Balancing",
  Mtms_Uniformity_Yield_m: "MTMS machine yield",
  Tuo_Uniformity_Yield_m: "TUO machine yield",
  Zf_Uniformity_Yield_m: "ZF machine yield",
  Mtms_Uniformity_Production: "MTMS tyres tested",
  Tuo_Uniformity_Production: "TUO tyres tested",
  Zf_Uniformity_Production: "ZF tyres tested",
};

function productValueColor(value, unit) {
  if (value == null) return "#9CA3AF";
  if (unit !== "%") return C.bl;
  return value >= 95 ? C.gn : value >= 90 ? C.am : C.rd;
}

/** Table-only Product drill: each clickable gold row opens its child table. */
function LiveCuringScrapDrillPanel({ date, shift, granularity, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCuringScrapRows({ date, shift, granularity, includeDrill: true })
      .then((result) => {
        if (!cancelled) setRows(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, shift, granularity]);

  return (
    <Card title="Curing Scrap — drill-down" accent={C.tl}>
      <ScrapReworkDrillPanel
        kind="Scrap"
        drillRows={toDrillRows(rows)}
        granularity={
          granularity ||
          (["A", "B", "C"].includes(String(shift).toUpperCase())
            ? `SHIFT ${String(shift).toUpperCase()}`
            : "DAY")
        }
        isLoading={loading}
        onClose={onClose}
      />
    </Card>
  );
}

function LivePaintWeightDrillPanel({ date, shift, granularity }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setRows([]);
    getProductChildren({
      kpiNames: PAINT_WEIGHT_DRILL_KPIS,
      date,
      shift,
      granularity,
    })
      .then((result) => {
        if (!cancelled) setRows(result?.rows || []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, shift, granularity]);

  const { overall, tableRows } = groupPaintWeightRows(rows);

  return (
    <Card title="GT Weight Variation — Paint Weight" accent={C.tl}>
      {loading ? (
        <QualityLoader minHeight={180} message="Loading paint weight data" />
      ) : error ? (
        <Typography role="alert" color="error" sx={{ py: 2 }}>
          Unable to load paint weight data.
        </Typography>
      ) : (
        <>
          <Stack
            direction="row"
            spacing={3}
            sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}
          >
            {PAINT_WEIGHT_OVERALL.map((column) => (
              <Box key={column.kpi}>
                <Typography variant="body2" color="text.secondary">
                  {column.label}
                </Typography>
                <Typography variant="h6">
                  {paintWeightValue(overall.get(column.kpi), 2, true)}
                </Typography>
              </Box>
            ))}
          </Stack>
          {tableRows.length ? (
            <DTable
              cols={[
                "SKU",
                ...PAINT_WEIGHT_COLUMNS.map((column) => column.label),
              ]}
              rows={tableRows}
            />
          ) : (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              No SKU data for this period.
            </Typography>
          )}
        </>
      )}
    </Card>
  );
}

function LiveProductDrillPanel({ kpi, date, shift, granularity }) {
  const initialLevel = {
    title: kpi.n,
    kpiNames: kpi.drillChildren || [],
  };
  const [levels, setLevels] = useState([initialLevel]);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const level = levels[levels.length - 1];
  const nameKey = level.kpiNames.join(",");

  useEffect(() => {
    setLevels([initialLevel]);
    // The card's value row is the source of truth for drillability. A missing
    // drill_down_attribute is a leaf, never a synthesized navigation path.
  }, [kpi.id]);

  useEffect(() => {
    if (!nameKey) {
      setRows([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setRows(null);
    getProductChildren({
      kpiNames: level.kpiNames,
      date,
      shift,
      granularity,
    })
      .then((result) => {
        if (!cancelled) setRows(result?.rows || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nameKey, date, shift, granularity]);

  const path = ["Product", kpi.n, ...levels.slice(1).map((item) => item.title)];
  const openChild = (row) => {
    if (row.drill_down?.is_leaf || !row.drill_down?.children?.length) return;
    setLevels((current) => [
      ...current,
      {
        title: row.machine || PRODUCT_KPI_LABELS[row.kpi_name] || row.kpi_name,
        kpiNames: row.drill_down.children,
      },
    ]);
  };
  const tableRows = (rows || []).map((row) => {
    const canDrill =
      !row.drill_down?.is_leaf && row.drill_down?.children?.length;
    const label =
      row.machine || PRODUCT_KPI_LABELS[row.kpi_name] || row.kpi_name;
    const cells = [
      canDrill ? (
        <span style={{ color: C.ac, fontWeight: 700 }}>{label} ›</span>
      ) : (
        label
      ),
      row.actual_value == null ? "—" : fmt(Number(row.actual_value)),
      row.unit || "—",
    ];
    // Keep table rendering generic while retaining the factual gold row used
    // to determine whether clicking this entire row may open a child level.
    cells.productRow = row;
    cells.canDrill = Boolean(canDrill);
    return cells;
  });

  return (
    <Card title={`${kpi.n} — drill-down`} accent={C.tl}>
      <Breadcrumb
        path={path}
        onNav={(index) => {
          if (index > 0) setLevels((current) => current.slice(0, index));
        }}
      />
      {loading ? (
        <QualityLoader minHeight={180} message="Loading gold data" />
      ) : tableRows.length ? (
        <>
          <DTable
            cols={["KPI / machine", "Value", "Unit"]}
            rows={tableRows}
            isRowClickable={(row) => row.canDrill}
            onRowClick={(row) => openChild(row.productRow)}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: C.mu }}>
            Click an orange row to open the next gold KPI level.
          </div>
        </>
      ) : (
        <div style={{ padding: "18px 0", color: C.mu, fontSize: 13 }}>
          No gold data available for this selection.
        </div>
      )}
    </Card>
  );
}

function QualityDashboard({ plant, onBack }) {
  const [tab, setTab] = useState("process");
  const [openKpi, setOpenKpi] = useState(null);
  const [sub, setSub] = useState("");
  const [tf, setTf] = useState("month");
  const [shift, setShift] = useState("All");
  // Calendar-driven defaults in IST. Whatever the user picks in the dropdown
  // (including months with no gold data — the cards will render NA) is what
  // shows; we never pin to a hardcoded "data date". Default filter is the
  // current calendar month.
  const _defaultMonthRange = monthRangeFromKey(currentMonthKeyInIST());
  const [tfFrom, setTfFrom] = useState(_defaultMonthRange.from);
  const [tfTo, setTfTo] = useState(_defaultMonthRange.to);
  const [tfMonth, setTfMonth] = useState(currentMonthKeyInIST());
  const [tyreType, setTyreType] = useState(
    isBanmorePlant(plant) ? "PCR" : "All",
  );
  const [trendKpi, setTrendKpi] = useState(null);
  const [spcSel, setSpcSel] = useState(null);
  // Live Process values from the Excel-backed backend (FRD §1). null until the
  // first fetch; {} on error keeps cards neutral instead of showing mock data.
  const [liveProcess, setLiveProcess] = useState(null);
  const [processLoading, setProcessLoading] = useState(true);
  const [processSummary, setProcessSummary] = useState(null);
  const [productSummary, setProductSummary] = useState(null);
  const [curingScrapRows, setCuringScrapRows] = useState(null);
  const [productHistory, setProductHistory] = useState({});
  const [scrapHistory, setScrapHistory] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [qualityAsOf, setQualityAsOf] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const processGranularity =
    tf === "month" ? "MONTH" : tf === "year" ? "YEAR" : null;
  const processDate = tf === "month" || tf === "year" ? tfFrom : tfTo;
  // SPC is a single-day view only. Month and date-range controls are hidden
  // while this tab is active, and all SPC API calls receive only `date`.
  const spcFrom = null;
  const spcTo = null;
  const productWindow = productHistoryWindow(processDate, processGranularity);

  useEffect(() => {
    let cancelled = false;
    getQualityAsOf()
      .then((res) => {
        if (!cancelled) setQualityAsOf(res?.asOf ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "process") return;
    let cancelled = false;
    setProcessLoading(true);
    getProcessSummary({
      date: processDate,
      shift,
      granularity: processGranularity,
    })
      .then((res) => {
        if (cancelled) return;
        setProcessSummary(res || null);
        const vals = (res && res.values) || {};
        const out = {};
        for (const [id, name] of Object.entries(PROCESS_KPI_NAME)) {
          out[id] = { value: vals[name] === undefined ? null : vals[name] };
        }
        setLiveProcess(out);
        setLastUpdatedAt(new Date());
      })
      .catch(() => {
        if (!cancelled) {
          setProcessSummary(null);
          setLiveProcess({});
        }
      })
      .finally(() => {
        if (!cancelled) setProcessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, processDate, shift, processGranularity]);

  useEffect(() => {
    if (tab !== "product") return;
    let cancelled = false;
    setProductLoading(true);
    Promise.allSettled([
      getProductSummary({
        date: processDate,
        shift,
        granularity: processGranularity,
      }),
      getCuringScrapRows({
        date: processDate,
        shift,
        granularity: processGranularity,
      }),
      getProductHistory({
        kpiNames: PRODUCT_HISTORY_KPIS,
        dateFrom: productWindow.from,
        dateTo: productWindow.to,
        shift,
        granularity: processGranularity,
      }),
      getCuringScrapHistory({
        dateFrom: productWindow.from,
        dateTo: productWindow.to,
        shift,
        granularity: processGranularity,
      }),
    ])
      .then(([productResult, scrapResult, historyResult, scrapHistResult]) => {
        if (cancelled) return;
        setProductHistory(
          historyResult.status === "fulfilled"
            ? historyResult.value?.series || {}
            : {},
        );
        setScrapHistory(
          scrapHistResult.status === "fulfilled"
            ? scrapHistResult.value?.points || []
            : [],
        );
        if (productResult.status === "fulfilled") setLastUpdatedAt(new Date());
        setProductSummary(
          productResult.status === "fulfilled"
            ? productResult.value || { values: {} }
            : { values: {} },
        );
        setCuringScrapRows(
          scrapResult.status === "fulfilled" && Array.isArray(scrapResult.value)
            ? scrapResult.value
            : [],
        );
      })
      .finally(() => {
        if (!cancelled) setProductLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, processDate, shift, processGranularity]);

  // Merge live overall values onto supported Process cards. KPI cards without
  // an API-backed value render as NA so the quality dashboard never shows dummy
  // KPI data as production data.
  const processCards = PROCESS_KPIS.map((k) => {
    if (!LIVE_PROCESS_KPI_IDS.has(k.id)) return toNaKpi(k);
    const live = liveProcess && liveProcess[k.id];
    if (!live) return toPendingLiveKpi(k);
    return {
      ...k,
      v: live.value == null ? "—" : String(live.value),
      status: null,
      sp: null,
      live: true,
      na: false,
      trendApi: true,
      trendKpiName: PROCESS_KPI_NAME[k.id],
      accentColor: processAccentColor(k.id, live.value),
    };
  });
  // Use the exact Production transformer and Curing/Quality source for the
  // Product tab's Scrap card, so its value, unit, status, and drill family
  // stay aligned with the existing Production Quality KPI.
  const curingScrapCard = Array.isArray(curingScrapRows)
    ? toKpiGrid(curingScrapRows, {
        section: "Curing",
        category: "Q",
        granularity:
          processGranularity ||
          (["A", "B", "C"].includes(String(shift).toUpperCase())
            ? `SHIFT ${String(shift).toUpperCase()}`
            : "DAY"),
        mode: "snapshot",
        plantId: "banmore",
        kpiDefs: [CURING_SCRAP_KPI],
      })[0]
    : null;
  const periodLabel = productPeriodLabel(
    processDate,
    processGranularity,
    shift,
  );
  const trendBaseline =
    processGranularity === "MONTH"
      ? "vs prev month"
      : processGranularity === "YEAR"
        ? "vs prev year"
        : "vs prev day";
  const productCards = PRODUCT_KPIS.map((kpi) => {
    if (kpi.productionSource === "curingScrap") {
      if (!curingScrapCard || curingScrapCard.value == null) {
        return {
          ...toNaKpi(kpi),
          v: "—",
          emptyReason: "No data for this period",
        };
      }
      return {
        ...kpi,
        ...productTrendFromPoints(scrapHistory, processDate),
        v: String(curingScrapCard.value),
        u: curingScrapCard.unit || "",
        status: curingScrapCard.status || null,
        na: false,
        live: true,
        drill: "curingScrap",
        periodLabel,
        trendBaseline,
        trendApi: true,
        trendKpiName: "Scrap",
        fetchTrendHistory: getCuringScrapHistory,
      };
    }
    if (!kpi.sourceKpi) {
      return {
        ...toNaKpi(kpi),
        v: "—",
        emptyReason: "No data for this period",
      };
    }
    const live = productSummary?.values?.[kpi.sourceKpi];
    if (!live || live.actual_value == null) {
      return {
        ...toNaKpi(kpi),
        v: "—",
        emptyReason: "No data for this period",
      };
    }
    return {
      ...kpi,
      ...productTrendFromPoints(productHistory[kpi.sourceKpi], processDate),
      v: String(live.actual_value),
      u: live.unit || (kpi.id === "gtw" ? "%" : ""),
      status: null,
      na: false,
      live: true,
      periodLabel,
      trendBaseline,
      trendApi: true,
      trendKpiName: kpi.sourceKpi,
      fetchTrendHistory: getProductKpiHistory,
      // Uniformity & Balancing cards open their own spec'd trend views.
      trendKind: isUniformityTrendCard(kpi.sourceKpi) ? "uniformity" : null,
      drill:
        kpi.id === "gtw"
          ? "paintWeight"
          : live.drill_down?.is_leaf
            ? null
            : "product",
      drillChildren: live.drill_down?.children || [],
      accentColor: productValueColor(
        Number(live.actual_value),
        live.unit || (kpi.id === "gtw" ? "%" : ""),
      ),
    };
  });
  const complaintCards = COMPLAINT_KPIS.map(toNaKpi);
  const kpis =
    tab === "spc"
      ? []
      : tab === "process"
        ? processCards
        : tab === "product"
          ? productCards
          : complaintCards;
  const openObj = openKpi ? kpis.find((k) => k.id === openKpi) : null;
  const tabAccent = tab === "process" ? C.bl : tab === "product" ? C.tl : C.rd;
  const bodyLoading =
    (tab === "process" && processLoading) ||
    (tab === "product" && productLoading);

  const toggle = (id) => {
    setOpenKpi(openKpi === id ? null : id);
    setSub("");
  };
  const onHeaderPresetChange = (payload) => {
    // ProductionTimeRangeSelect passes `{ preset, from, to }` (object);
    // accept either shape (string or object) so callers don't break.
    const preset =
      typeof payload === "string" ? payload : (payload?.preset ?? null);
    const nextFrom = typeof payload === "object" ? (payload?.from ?? "") : "";
    const nextTo = typeof payload === "object" ? (payload?.to ?? "") : "";
    setTf(preset);
    if (preset === "today") {
      const t = todayInIST();
      setTfFrom(t);
      setTfTo(t);
    } else if (preset === "month") {
      // Current calendar month in IST, 1st → last day. UTC math is fine for
      // day-count — every month has a stable number of days regardless of TZ.
      const mk = currentMonthKeyInIST();
      const [yStr, mStr] = mk.split("-");
      const lastDay = new Date(
        Date.UTC(Number(yStr), Number(mStr), 0),
      ).getUTCDate();
      const from = `${yStr}-${mStr}-01`;
      const to = `${yStr}-${mStr}-${String(lastDay).padStart(2, "0")}`;
      setTfFrom(from);
      setTfTo(to);
      setTfMonth(mk);
      setShift("All");
    } else if (preset === "year") {
      const r = currentYearRange();
      setTfFrom(r.from);
      setTfTo(r.to);
      setShift("All");
    } else {
      // Custom range (or null when the user opens the Date Range dialog).
      if (nextFrom) setTfFrom(nextFrom);
      if (nextTo) setTfTo(nextTo);
    }
  };
  const onHeaderFromChange = (value) => {
    setTf(null);
    setTfFrom(value);
    setShift("All");
  };
  const onHeaderToChange = (value) => {
    setTf(null);
    setTfTo(value);
    setShift("All");
  };
  const onHeaderDayChange = (value) => {
    setTf("day");
    setTfFrom(value);
    setTfTo(value);
  };
  const onHeaderShiftChange = (value) =>
    setShift(value === "all" ? "All" : String(value).toUpperCase());
  const onHeaderMonthChange = (monthKey) => {
    setTf("month");
    const r = monthRangeFromKey(monthKey);
    setTfFrom(r.from);
    setTfTo(r.to);
    setTfMonth(monthKey);
    setShift("All");
  };

  // ── ProductionHeader wiring ──
  // Map Quality's flat time-range state (tf, tfFrom, tfTo, tfMonth) to the
  // shape ProductionHeader expects, and convert the shift label to lowercase.
  const timeRangeForHeader = {
    preset: typeof tf === "string" ? tf.toLowerCase() : null,
    from: tfFrom,
    to: tfTo,
    month: tfMonth,
  };
  const headerShift = typeof shift === "string" ? shift.toLowerCase() : "all";
  const onHeaderExport = () => {
    // Quality uses the print-page path for export (matches the inline
    // ExportButton behaviour). Production uses html2canvas; either way the
    // user expects a PDF download.
    try {
      window.print?.();
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  // Sub-tab items rendered in the header's Row 2 (where dept tabs go on
  // production). The active tab is the current Quality sub-section.
  const subTabItems = [
    { id: "process", label: "Process", accent: C.bl },
    { id: "product", label: "Product", accent: C.tl, enabled: true },
    {
      id: "complaint",
      label: "Customer Complaint",
      accent: C.rd,
      enabled: false,
    },
    { id: "spc", label: "SPC", accent: C.pp },
  ];
  const onSubTabChange = (id) => {
    // SPC is a one-day view; any range carried in from Process falls back to
    // Today when the user enters the tab.
    if (id === "spc" && tf !== "today" && tf !== "day") {
      onHeaderPresetChange("today");
    }
    setTab(id);
    setOpenKpi(null);
    setSub("");
  };

  const renderKpiCard = (kpi) => (
    <QKpiCard
      key={kpi.id}
      kpi={{ ...kpi, v: tAdjust(kpi.v, kpi.n, tyreType, plant) }}
      isOpen={openKpi === kpi.id}
      onToggle={() => kpi.drill && toggle(kpi.id)}
      onTrend={setTrendKpi}
    />
  );

  // Group heading in the Production section-title style (sentence case,
  // primary text) so the Product tab reads like the Production dashboard.
  const productSectionHeading = (label) => (
    <Box sx={{ gridColumn: "1 / -1", mb: -0.5, mt: 0.5 }}>
      <Typography
        component="h2"
        sx={{ color: "text.primary", fontSize: 17, fontWeight: 700 }}
      >
        {label}
      </Typography>
    </Box>
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
        color: "text.primary",
        fontFamily:
          'Montserrat, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <PrintStyles />

      {/* Production-style top header — Row 1 brand + plant pill + avatar,
          Row 2 dept tabs + tyre type + time range + export. The dept tabs
          are wired to navigate between Banmore dashboards; Quality is the
          active one. */}
      <ProductionHeader
        plant={plant}
        timeRange={timeRangeForHeader}
        onTimeRangeChange={(updater) => {
          const next =
            typeof updater === "function"
              ? updater(timeRangeForHeader)
              : updater;
          // Map the production-shape update back into Quality's flat state.
          // ProductionHeader's month-dropdown click sends
          // { preset: "month", month: "2026-07" } — that hits this branch
          // FIRST so the user's pick reaches onHeaderMonthChange (which sets
          // tfFrom/tfTo/tfMonth from monthRangeFromKey) instead of
          // onHeaderPresetChange (which would hard-reset to the as-of month).
          // Preset pills clear month to null; only a valid dropdown key
          // selects a specific month. A reset must use the current month.
          if (
            next?.preset === "month" &&
            /^\d{4}-(0[1-9]|1[0-2])$/.test(next.month)
          ) {
            onHeaderMonthChange(next.month);
          } else if (next?.preset !== undefined) {
            onHeaderPresetChange({
              preset: next.preset,
              from: next.from ?? "",
              to: next.to ?? "",
            });
          } else if (next?.from) {
            onHeaderFromChange(next.from);
          } else if (next?.to) {
            onHeaderToChange(next.to);
          }
        }}
        shift={headerShift}
        onShiftChange={onHeaderShiftChange}
        onExport={onHeaderExport}
        asOf={qualityAsOf}
        lastUpdatedAt={lastUpdatedAt}
        categoryTabs={subTabItems.map((t) => ({
          id: t.id,
          label: t.label,
          enabled: t.enabled,
        }))}
        activeCategory={tab}
        onCategoryChange={onSubTabChange}
        tyreTypes={[]}
        tyreType={tyreType}
        onTyreTypeChange={setTyreType}
        hiddenPresets={tab === "spc" ? ["month", "range"] : []}
        singleDay={tab === "spc" ? processDate : null}
        onSingleDayChange={tab === "spc" ? onHeaderDayChange : undefined}
        showSpcAlertIcon={tab === "spc"}
      />

      {/* Main content */}
      <Box
        sx={{
          px: { xs: 2, md: 3 },
          py: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {bodyLoading ? (
          <QualityLoader minHeight="calc(100vh - 220px)" />
        ) : (
          <>
            <TyreTypeBanner tt={tyreType} plant={plant} />
            {tab === "spc" ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <SPCTab
                  spcSel={spcSel}
                  setSpcSel={setSpcSel}
                  date={processDate}
                  from={spcFrom}
                  to={spcTo}
                  shift={shift}
                />
              </Box>
            ) : (
              <KpiSplitLayout
                open={Boolean(openObj)}
                cards={
                  <>
                    {tab === "product" ? (
                      <>
                        {productSectionHeading("Uniformity & Balancing")}
                        {productCards.slice(0, 7).map(renderKpiCard)}
                        {productSectionHeading("Other Product KPIs")}
                        {productCards.slice(7).map(renderKpiCard)}
                      </>
                    ) : (
                      kpis.map(renderKpiCard)
                    )}
                  </>
                }
                panel={
                  <>
                    {tab === "process" && (
                      <ProcessDrillPanel
                        kpi={openObj}
                        sub={sub}
                        setSub={setSub}
                        date={processDate}
                        shift={shift}
                        granularity={processGranularity}
                        processSummary={processSummary}
                        onOpenSPC={(mc) => {
                          setTab("spc");
                          setSpcSel(mc);
                          setOpenKpi(null);
                          setSub("");
                        }}
                      />
                    )}
                    {tab === "product" &&
                      (openObj?.drill === "curingScrap" ? (
                        <LiveCuringScrapDrillPanel
                          date={processDate}
                          shift={shift}
                          granularity={processGranularity}
                          onClose={() => setOpenKpi(null)}
                        />
                      ) : openObj?.drill === "paintWeight" ? (
                        <LivePaintWeightDrillPanel
                          date={processDate}
                          shift={shift}
                          granularity={processGranularity}
                        />
                      ) : (
                        <LiveProductDrillPanel
                          kpi={openObj}
                          date={processDate}
                          shift={shift}
                          granularity={processGranularity}
                        />
                      ))}
                    {tab === "complaint" && (
                      <ComplaintDrillPanel
                        kpi={openObj}
                        sub={sub}
                        setSub={setSub}
                      />
                    )}
                  </>
                }
              />
            )}
          </>
        )}
      </Box>
      {trendKpi?.trendKind === "uniformity" && (
        <UniformityTrendModal
          key={trendKpi.trendKpiName}
          open
          onClose={() => setTrendKpi(null)}
          cardKpi={trendKpi.trendKpiName}
          title={trendKpi.n}
          today={todayInIST()}
          initialFilter={
            tf === "today" || tf === "day"
              ? { preset: "today", shift: String(shift).toLowerCase() }
              : tf === "month"
                ? {
                    preset: "month",
                    month: tfMonth === currentMonthKeyInIST() ? null : tfMonth,
                  }
                : { preset: "custom", from: tfFrom, to: tfTo }
          }
        />
      )}
      {trendKpi && trendKpi.trendApi && trendKpi.trendKind !== "uniformity" && (
        <LiveProcessTrendPanel
          kpi={trendKpi}
          onClose={() => setTrendKpi(null)}
          dateFrom={trendKpi.fetchTrendHistory ? productWindow.from : tfFrom}
          dateTo={
            trendKpi.fetchTrendHistory
              ? productWindow.to
              : processGranularity
                ? processDate
                : tfTo
          }
          shift={shift}
          granularity={processGranularity}
          fetchHistory={trendKpi.fetchTrendHistory}
        />
      )}
    </Box>
  );
}

export default QualityDashboard;
