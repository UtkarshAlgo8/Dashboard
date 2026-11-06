import { useReducer } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import CloseIcon from "@mui/icons-material/Close";
import { Card } from "@/components/quality/shared/Card.jsx";
import { Breadcrumb } from "@/components/quality/shared/Breadcrumb.jsx";
import { DTable } from "@/components/quality/shared/DTable.jsx";
import UniformityRawPlot from "@/components/quality/UniformityRawPlot.jsx";
import useUniformityPage from "@/hooks/useUniformityPage.js";
import {
  INITIAL_UNIFORMITY_NAV,
  uniformityLevel,
  uniformityNavigation,
} from "@/lib/uniformityDrill.js";

const display = (value) =>
  value == null
    ? "—"
    : Number(value).toLocaleString("en-IN", { maximumSignificantDigits: 15 });

/** Selected BTP Gold level, or an explicitly clicked Silver failure page. */
export default function UniformityDrillPanel({
  card,
  title,
  period,
  onClose,
  parentBreadcrumb = null,
  onParentNav,
}) {
  const [nav, dispatch] = useReducer(
    uniformityNavigation,
    INITIAL_UNIFORMITY_NAV,
  );
  const level = uniformityLevel(nav);
  const scope = {
    ...period,
    card: card.id,
    machine: nav.machine,
    sku: nav.sku,
    offset: nav.offset,
    limit: 100,
    ...(level === "barcodes" ? { parameter: nav.parameter } : { level }),
  };
  const { data, loading, error, retry } = useUniformityPage(
    level === "barcodes" ? "barcodes" : "gold",
    scope,
  );
  const prefix = parentBreadcrumb ?? ["Uniformity & Balancing", title];
  const path = [
    ...prefix,
    ...[nav.machine, nav.sku, nav.parameter].filter(Boolean),
  ];
  const action = (type, value, expected) => dispatch({ type, value, expected });
  const link = (text, type, value, expected) => (
    <Button
      size="small"
      onClick={() => action(type, value, expected)}
      sx={{ textTransform: "none" }}
    >
      {text}
    </Button>
  );
  const rows = (data?.rows ?? []).map((row) => {
    if (level === "machine")
      return [row.machine, display(row.yield_pct), display(row.tyres_tested)];
    if (level === "sku")
      return [row.sku, display(row.yield_pct), display(row.tyres_tested)];
    if (level === "parameter")
      return [
        row.parameter,
        row.failed_tyres,
        display(row.failed_pct),
        ...(card.plot
          ? [
              <Tooltip
                key="plot"
                title={`Plot measured values — ${row.parameter}`}
              >
                <IconButton
                  size="small"
                  aria-label={`Plot ${row.parameter}`}
                  onClick={() => action("plot", row.parameter)}
                >
                  <ShowChartIcon fontSize="small" />
                </IconButton>
              </Tooltip>,
            ]
          : []),
      ];
    return [
      row.barcode,
      row.test_time,
      row.shift,
      card.id.startsWith("zf-")
        ? ""
        : row.actual_value == null
          ? "—"
          : String(row.actual_value),
      row.grade ?? "—",
      "—",
      "—",
    ];
  });
  const renderCell = (cell, index, row) => {
    if (level === "machine" && index === 0) return link(cell, "machine", cell);
    if (level === "sku" && index === 0 && card.id !== "tuo")
      return link(cell, "sku", cell);
    if (level === "parameter" && index === 1)
      return cell == null ? "—" : link(display(cell), "barcodes", row[0], cell);
    return cell;
  };
  const columns =
    level === "barcodes"
      ? ["Barcode", "Test time", "Shift", "Value", "Grade", "LSL", "USL"]
      : level === "parameter"
        ? [
            "Parameter",
            "Failed tyres",
            "Failed %",
            ...(card.plot ? ["Plot"] : []),
          ]
        : [level === "machine" ? "Machine" : "SKU", "Yield %", "Tyres tested"];
  return (
    <Card title={`${title} — drill-down`}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="start"
        spacing={1}
      >
        <Breadcrumb
          path={path}
          onNav={(index) => {
            if (parentBreadcrumb && index < prefix.length - 1)
              return onParentNav(index);
            if (index === 0) return onClose();
            dispatch({ type: "back", index: index - (prefix.length - 2) });
          }}
        />
        <IconButton
          size="small"
          aria-label="Close Uniformity drill"
          onClick={onClose}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        {period.from} — {period.to} ·{" "}
        {period.shift === "ALL" ? "All shifts" : `Shift ${period.shift}`} ·{" "}
        {level === "barcodes"
          ? "Silver · latest test per barcode"
          : `Gold · ${period.period === "range" ? "weighted DAY range" : "stored period"}`}
      </Typography>
      {level === "sku" && card.id === "tuo" && (
        <Alert severity="info" sx={{ mb: 1 }}>
          TUO status/barcode drill unavailable pending Athena source
          availability. No parameter level.
          <Box sx={{ mt: 1 }}>
            <Button size="small" disabled>
              View status barcodes — unavailable
            </Button>
          </Box>
        </Alert>
      )}
      {level === "parameter" && card.id.startsWith("zf-") && (
        <Alert severity="info" sx={{ mb: 1 }}>
          ZF stores grades only. Raw plots are unavailable; barcode Value
          remains blank.
        </Alert>
      )}
      {loading ? (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <CircularProgress size={24} aria-label="Loading Uniformity table" />
        </Box>
      ) : error ? (
        <Alert severity="error" action={<Button onClick={retry}>Retry</Button>}>
          {error.message || "Unable to load Uniformity data."}
        </Alert>
      ) : (
        <>
          {level === "barcodes" &&
            data?.total != null &&
            nav.expected != null &&
            data.total !== nav.expected && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                Gold reports {display(nav.expected)} failed tyres; Silver
                currently returns {display(data.total)} distinct barcodes for
                this exact selection. Counts do not match.
              </Alert>
            )}
          {rows.length ? (
            <DTable
              cols={columns}
              rows={rows}
              renderCell={renderCell}
              rowKey={(row) => row[0]}
              compareCells={(a, b, index) =>
                index === 0 && ["machine", "sku"].includes(level)
                  ? String(a)
                      .toLowerCase()
                      .localeCompare(String(b).toLowerCase())
                  : undefined
              }
            />
          ) : (
            <Typography sx={{ py: 2 }} color="text.secondary">
              No {level === "barcodes" ? "failed barcodes" : "Gold rows"} for
              this selection.
            </Typography>
          )}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Button
              disabled={nav.offset === 0}
              onClick={() => action("page", Math.max(0, nav.offset - 100))}
            >
              Previous
            </Button>
            <Typography variant="caption">
              {data?.total == null
                ? "Page outside current results"
                : `${data.total} rows · page ${nav.offset / 100 + 1}`}
            </Typography>
            <Button
              disabled={!data?.has_more}
              onClick={() => action("page", nav.offset + 100)}
            >
              Next
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Sorting applies to the current page only.
            {data?.has_more ? " More rows available on the next page." : ""}
          </Typography>
        </>
      )}
      {nav.plot && (
        <UniformityRawPlot
          key={`${nav.machine}|${nav.sku}|${nav.plot}`}
          scope={{
            ...period,
            card: card.id,
            machine: nav.machine,
            sku: nav.sku,
            parameter: nav.plot,
          }}
          title={`${title} · ${nav.machine} · ${nav.sku} · ${nav.plot}`}
          onClose={() => action("plot", null)}
        />
      )}
    </Card>
  );
}
