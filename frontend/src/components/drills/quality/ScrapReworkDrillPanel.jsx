import { useMemo, useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import DrillSkeleton from "@/components/drills/shared/DrillSkeleton.jsx";
import { snapshotLatest } from "@/lib/drillDate.js";
import { canonicalizeSubSection } from "@/lib/dashboardRowScopes.js";

// changes.md §1/§8: match granularity spelling-tolerantly ("Daily" vs the
// real "DAY") so the subsection drill pins the SAME granularity as the card
// and never sums DAY + SHIFT + MONTH rows together.
const GRAN_SYNONYMS = new Map([
  ["daily", "DAY"],
  ["day", "DAY"],
  ["today", "DAY"],
  ["mtd", "MONTH"],
  ["month", "MONTH"],
  ["monthly", "MONTH"],
  ["shift a", "SHIFT A"],
  ["shift b", "SHIFT B"],
  ["shift c", "SHIFT C"],
]);
function normGran(v) {
  if (v == null) return null;
  const k = String(v).trim().toLowerCase().replace(/\s+/g, " ");
  return GRAN_SYNONYMS.get(k) ?? String(v).trim().toUpperCase();
}
function sameGran(a, b) {
  return normGran(a) === normGran(b);
}
function sameSub(a, b) {
  return canonicalizeSubSection(a) === canonicalizeSubSection(b);
}

/**
 * Scrap / Rework drill panel — quality-change.md §4 / §5.
 *
 * Both KPIs share the same shape, parameterised by `kind` ("Scrap" or
 * "Rework"). Flow:
 *   1. Subsection-wise list (Scrap_s / Rework_s) — one row per scrap
 *      subsection (Building / Curing / Engineering / Development; these
 *      come from the sub_section value on the scrap rows, NOT the normal
 *      dashboard subsections).
 *   2. Click a subsection → default View By = Reason (Scrap_reason /
 *      Rework_reason, reason text from `remarks`). A View By toggle
 *      switches Reason / Machine / SKU / Machine + SKU, all filtered to
 *      the clicked subsection.
 *
 * Reads from the drill rows already fetched (category='Quality' is pinned
 * server-side per §7, so the Productivity OEE-loss "Scrap" leaf is never
 * mixed in). Values are read verbatim for the snapshot day.
 *
 * @param {('Scrap'|'Rework')} kind
 * @param {object[]} drillRows - toDrillRows() output for this KPI's targets
 * @param {string} granularity
 * @param {string} [mode]
 * @param {boolean} [isLoading]
 */
function ScrapReworkDrillPanel({
  kind = "Scrap",
  drillRows = [],
  granularity = "DAY",
  mode = "snapshot",
  isLoading = false,
}) {
  const [selectedSub, setSelectedSub] = useState(null);
  const [viewBy, setViewBy] = useState("reason");

  // kpi_name prefix: Scrap_s / Rework_s, Scrap_reason / Rework_reason, …
  const K = {
    s: `${kind}_s`,
    reason: `${kind}_reason`,
    machine: `${kind}_m`,
    sku: `${kind}_sku`,
    both: `${kind}_m_sku`,
  };

  const atGranularity = useMemo(
    () =>
      snapshotLatest(
        (drillRows ?? []).filter((r) => sameGran(r.granularity, granularity)),
        mode,
      ),
    [drillRows, granularity, mode],
  );

  // Subsection list (Scrap_s / Rework_s): one row per scrap subsection.
  const subsections = useMemo(() => {
    const bySub = new Map();
    for (const r of atGranularity) {
      // changes.md §6: merge casing/spelling duplicates into one subsection.
      const sub = canonicalizeSubSection(r.subSection);
      if (r.kpiName !== K.s || !sub) continue;
      const cur = bySub.get(sub) ?? { sub, total: 0 };
      if (typeof r.actual === "number") cur.total += r.actual;
      bySub.set(sub, cur);
    }
    return [...bySub.values()].sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atGranularity, kind]);

  // Active leaf kpi_name for the current View By.
  const leafKpi = K[viewBy];

  // Rows for the selected subsection at the active View By lens.
  const detailRows = useMemo(() => {
    if (!selectedSub) return [];
    const matched = atGranularity.filter(
      (r) => r.kpiName === leafKpi && sameSub(r.subSection, selectedSub),
    );
    const groups = new Map();
    const keyOf = (r) => {
      if (viewBy === "reason") return r.remarks ?? "—";
      if (viewBy === "machine") return r.machine ?? "—";
      if (viewBy === "sku") return r.itemCode ?? "—";
      return `${r.machine ?? "—"}||${r.itemCode ?? "—"}`;
    };
    for (const r of matched) {
      const k = keyOf(r);
      const cur = groups.get(k) ?? {
        reason: r.remarks ?? "—",
        machine: r.machine ?? "—",
        itemCode: r.itemCode ?? "—",
        qty: 0,
      };
      if (typeof r.actual === "number") cur.qty += r.actual;
      groups.set(k, cur);
    }
    return [...groups.values()]
      .filter((g) => g.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  }, [atGranularity, selectedSub, leafKpi, viewBy]);

  if (subsections.length === 0) {
    if (isLoading) return <DrillSkeleton title rows={5} cols={4} />;
    return (
      <Box sx={{ p: 3, textAlign: "center", color: "text.disabled" }}>
        <Typography sx={{ fontSize: 13 }}>
          No {kind} drill data in this date range.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 700,
          color: "primary.main",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {kind} — subsection-wise
      </Typography>

      <SubsectionTable
        rows={subsections}
        selected={selectedSub}
        onSelect={(s) =>
          setSelectedSub((cur) => {
            const next = cur === s ? null : s;
            if (next) setViewBy("reason"); // default view per §4/§5
            return next;
          })
        }
      />

      {selectedSub && (
        <>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 600,
                color: "text.disabled",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              View by
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={viewBy}
              onChange={(_, v) => v && setViewBy(v)}
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.5,
                  py: 0.25,
                  fontSize: 12,
                  textTransform: "none",
                },
              }}
            >
              <ToggleButton value="reason">Reason</ToggleButton>
              <ToggleButton value="machine">Machine</ToggleButton>
              <ToggleButton value="sku">SKU</ToggleButton>
              <ToggleButton value="both">Machine + SKU</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
              {detailRows.length} rows · {selectedSub}
            </Typography>
          </Stack>

          {detailRows.length > 0 ? (
            <DetailTable rows={detailRows} viewBy={viewBy} kind={kind} />
          ) : (
            <Box sx={{ p: 2, textAlign: "center", color: "text.disabled" }}>
              <Typography sx={{ fontSize: 13 }}>
                No {viewBy} rows for {selectedSub} in this fetch.
              </Typography>
            </Box>
          )}
        </>
      )}
    </Stack>
  );
}

function SubsectionTable({ rows, selected, onSelect }) {
  const theme = useTheme();
  return (
    <TableContainer
      sx={{ border: 1, borderColor: "divider", borderRadius: 1.25 }}
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <Th align="left">Subsection</Th>
            <Th>Quantity</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const isSel = selected === r.sub;
            return (
              <TableRow
                key={r.sub}
                hover
                onClick={() => onSelect(r.sub)}
                sx={{
                  cursor: "pointer",
                  backgroundColor: isSel
                    ? `${theme.custom.brand.orange}1f`
                    : undefined,
                }}
              >
                <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                  {r.sub}
                </TableCell>
                <TableCell align="center" sx={{ fontSize: 13, fontWeight: 600 }}>
                  {Math.round(r.total).toLocaleString()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function DetailTable({ rows, viewBy }) {
  const showReason = viewBy === "reason";
  const showMachine = viewBy === "machine" || viewBy === "both";
  const showSku = viewBy === "sku" || viewBy === "both";
  return (
    <TableContainer
      sx={{
        maxHeight: 360,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.25,
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {showReason && <Th align="left">Reason</Th>}
            {showMachine && <Th align="left">Machine</Th>}
            {showSku && <Th align="left">Item Code</Th>}
            <Th>Quantity</Th>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} hover>
              {showReason && (
                <TableCell sx={{ fontSize: 13 }}>{r.reason}</TableCell>
              )}
              {showMachine && (
                <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>
                  {r.machine}
                </TableCell>
              )}
              {showSku && (
                <TableCell sx={{ fontSize: 13, fontFamily: "monospace" }}>
                  {r.itemCode}
                </TableCell>
              )}
              <TableCell align="center" sx={{ fontSize: 13, fontWeight: 600 }}>
                {Math.round(r.qty).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function Th({ children, align = "center" }) {
  return (
    <TableCell
      align={align}
      sx={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "text.disabled",
        backgroundColor: "background.paper",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </TableCell>
  );
}

export default ScrapReworkDrillPanel;
