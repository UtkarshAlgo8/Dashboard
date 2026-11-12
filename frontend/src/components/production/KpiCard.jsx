import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import GridViewIcon from "@mui/icons-material/GridView";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import AccessTimeFilledIcon from "@mui/icons-material/AccessTimeFilled";
import Sparkline from "./Sparkline.jsx";
import { formatIndianNumber } from "@/lib/numberFormat.js";
import { toDisplayDate } from "@/lib/dateFormat.js";
import { evaluateKpiTier, getKpiCardTheme } from "@/lib/thresholds.js";

/**
 * Adobe XD Thematic KPI Card
 * Supports dynamic threshold tiers: green, amber, red.
 */
function KpiCard({
  kpi,
  isDrilling = false,
  isDrilldown = false,
  onClick,
  onTrendOpen,
  onCloseDrill,
  alignMetrics = false,
}) {
  const theme = useTheme();
  if (!kpi) return null;

  // Heading-only card (temporarily disabled KPI): title and a dash, nothing
  // clickable, no sparkline, progress bar, trend or action icons.
  const disabled = Boolean(kpi.disabled);

  // Determine dynamic threshold tier: "green" | "amber" | "red"
  const tier = evaluateKpiTier(kpi);
  const cardTheme = getKpiCardTheme(theme, tier);

  // Pick Icon based on KPI
  const kpiId = String(kpi.id || kpi.rawName || "").toLowerCase();
  const kpiName = String(kpi.name || "").toLowerCase();

  let HeaderIcon;
  let displayName;
  let subtitle;

  if (kpiId.includes("oee") || kpiName.includes("oee")) {
    HeaderIcon = SettingsIcon;
    displayName = "OEE";
    subtitle = "";
  } else if (
    kpiId.includes("comp") ||
    kpiName.includes("compliance") ||
    kpiName.includes("fulfillment") ||
    kpiName.includes("plan")
  ) {
    HeaderIcon = CheckCircleIcon;
    displayName = kpi.name || "SKU Plan Fulfillment";
    subtitle = "of total planned";
  } else if (kpiId.includes("downtime") || kpiName.includes("downtime")) {
    HeaderIcon = AccessTimeFilledIcon;
    displayName = kpi.name || "Total Downtime";
    subtitle = kpi.unit ? kpi.unit : "mins";
  } else if (kpiId.includes("prod") || kpiName.includes("prod")) {
    HeaderIcon = GridViewIcon;
    displayName = kpi.name || "Production";
    subtitle = kpi.unit || "NOS";
  } else {
    HeaderIcon = GridViewIcon;
    displayName = kpi.name || "KPI";
    subtitle = kpi.unit ?? "";
  }

  // Calculate Progress % & formatted value
  const numVal =
    typeof kpi.value === "number"
      ? kpi.value
      : kpi.value != null && kpi.value !== ""
        ? parseFloat(kpi.value)
        : null;

  let progressPct = 0;
  let formattedVal = "–";

  if (numVal != null && !isNaN(numVal)) {
    if (kpiId.includes("oee") || kpiName.includes("oee")) {
      progressPct = Math.min(100, Math.max(0, numVal));
      formattedVal = `${Number.isInteger(numVal) ? numVal : numVal.toFixed(1)}%`;
    } else if (
      kpiId.includes("comp") ||
      kpiName.includes("compliance") ||
      kpiName.includes("plan")
    ) {
      progressPct = Math.min(100, Math.max(0, numVal));
      formattedVal =
        kpi.decimals != null
          ? `${numVal.toFixed(kpi.decimals)}%`
          : `${Number.isInteger(numVal) ? numVal : numVal.toFixed(1)}%`;
    } else {
      const target =
        typeof kpi.target === "number"
          ? kpi.target
          : kpi.target != null && kpi.target !== ""
            ? parseFloat(kpi.target)
            : null;
      if (target != null && !isNaN(target) && target > 0) {
        progressPct = Math.min(100, Math.max(0, (numVal / target) * 100));
      } else {
        progressPct = numVal > 0 ? 100 : 0;
      }
      formattedVal = formatIndianNumber(numVal);
    }
  }

  // Trend formatting & colour resolution
  const trendUp = kpi.trend == null ? true : kpi.trend >= 0;
  const isFavourable =
    kpi.trendFavourable ?? (kpi.trend == null ? true : kpi.trend >= 0);
  const trendColor =
    kpi.trend == null || kpi.trend === ""
      ? theme.palette.text.secondary
      : isFavourable
        ? theme.custom.status.green
        : theme.custom.status.red;

  let trendVal = "–";
  const isProduction = kpiId.includes("prod") || kpiName.includes("prod");
  const trendValue =
    kpi.trendValue == null || kpi.trendValue === ""
      ? null
      : Number(kpi.trendValue);
  const trendPct =
    kpi.trend == null || kpi.trend === "" ? null : Number(kpi.trend);

  if (isProduction) {
    const unitLabel = kpi.unit || "NOS";
    if (Number.isFinite(trendValue)) {
      trendVal = `${trendValue > 0 ? "+" : ""}${formatIndianNumber(trendValue)} ${unitLabel}`;
    } else if (Number.isFinite(trendPct) && Number.isFinite(numVal)) {
      const denominator = 1 + trendPct / 100;
      if (denominator !== 0) {
        const baselineValue = numVal / denominator;
        const absoluteDifference = Math.round(numVal - baselineValue);
        trendVal = `${absoluteDifference > 0 ? "+" : ""}${formatIndianNumber(absoluteDifference)} ${unitLabel}`;
      }
    }
  } else if (Number.isFinite(trendPct)) {
    trendVal = `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%`;
  }
  const trendLabel = kpi.trendBaseline ?? "vs prev";

  const hasSpark = Array.isArray(kpi.spark) && kpi.spark.length >= 2;

  return (
    <Box
      onClick={disabled ? undefined : () => onClick?.(kpi)}
      sx={{
        position: "relative",
        containerType: "inline-size",
        backgroundColor: cardTheme.cardBg,
        border: isDrilling ? 2 : 1,
        borderColor: isDrilling ? "primary.main" : `${cardTheme.sparkColor}30`,
        borderRadius: 2.5,
        p: 1.75,
        minWidth: 0,
        boxShadow: isDrilling
          ? "0 4px 14px rgba(0,0,0,0.08)"
          : theme.custom.shadow,
        cursor: kpi.drillable && !disabled ? "pointer" : "default",
        transition: "all 0.15s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: alignMetrics ? "flex-start" : "space-between",
        minHeight: alignMetrics && kpi.quantityTotals ? 160 : 136,
        "&:hover": {
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
        },
      }}
    >
      {/* 1. Header: Icon + Title + Info (i) */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.75 }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ minWidth: 0 }}
        >
          <HeaderIcon
            sx={{ fontSize: 20, color: cardTheme.iconColor, flexShrink: 0 }}
          />
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              color: "text.primary",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName}
          </Typography>
        </Stack>

        {!disabled && !kpi.quantityLines && !kpi.hideInfo && (
          <Tooltip title="KPI Details & Calculation Info" arrow>
            <InfoOutlinedIcon
              sx={{
                fontSize: 18,
                color: "text.secondary",
                cursor: "pointer",
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
      </Stack>

      {/* 2. Main Metric + Sparkline */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{
          my: 0.25,
          minWidth: 0,
          ...(kpi.quantityBreakdown?.length && {
            alignItems: "flex-start",
            flexWrap: "wrap",
            rowGap: 0.5,
          }),
        }}
      >
        {/* Left: Value, Unit & Sub-Badges */}
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            alignItems="baseline"
            spacing={0.75}
            sx={{ minWidth: 0 }}
          >
            {kpi.quantityTotals ? (
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  columnGap: 1,
                  rowGap: 0.5,
                  minWidth: 0,
                }}
              >
                {kpi.quantityTotals.map(({ value, unit, fullValue }, index) => (
                  <Tooltip
                    key={unit || value}
                    title={fullValue ?? `${value} ${unit}`}
                    arrow
                    describeChild
                  >
                    <Stack
                      tabIndex={0}
                      aria-label={fullValue ?? `${value} ${unit}`}
                      direction="row"
                      alignItems="baseline"
                      spacing={0.75}
                      sx={{
                        whiteSpace: "nowrap",
                        borderRadius: 0.5,
                        "&:focus-visible": {
                          outline: "2px solid",
                          outlineColor: "primary.main",
                          outlineOffset: 3,
                        },
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                          fontSize: kpi.quantityBreakdown?.length
                            ? { xs: 21, md: 22, lg: 23 }
                            : { xs: 24, md: 26, lg: 28 },
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                          ...(kpi.quantityBreakdown?.length && {
                            "@container (max-width: 300px)": { fontSize: 19 },
                          }),
                          lineHeight: 1.2,
                          color: cardTheme.textColor,
                        }}
                      >
                        {value}
                      </Typography>
                      {unit && (
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "text.secondary",
                            ...(kpi.quantityBreakdown?.length && {
                              "@container (max-width: 300px)": { fontSize: 11 },
                            }),
                          }}
                        >
                          {unit}
                        </Typography>
                      )}
                      {index < kpi.quantityTotals.length - 1 && (
                        <Typography
                          component="span"
                          sx={{ fontSize: 14, color: "text.disabled" }}
                        >
                          ·
                        </Typography>
                      )}
                    </Stack>
                  </Tooltip>
                ))}
              </Box>
            ) : (
              <Typography
                sx={{
                  fontSize: { xs: 24, md: 26, lg: 28 },
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: cardTheme.textColor,
                  whiteSpace: "nowrap",
                }}
              >
                {kpi.formattedValue ?? formattedVal}
              </Typography>
            )}
            {subtitle && !disabled && (
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Stack>

          {/* Badges / Annotations row (placed neatly below the metric value) */}
          {(Boolean(kpi.topMachine) ||
            Boolean(kpi.note) ||
            Boolean(kpi.partialDay) ||
            Boolean(kpi.truncated) ||
            Boolean(kpi.asOfDate)) && (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.25 }}
            >
              {kpi.note && (
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "text.secondary",
                    whiteSpace: kpi.quantityLines ? "normal" : "nowrap",
                  }}
                >
                  {kpi.note}
                </Typography>
              )}
              {kpi.asOfDate && (
                <Tooltip
                  title="No data for the selected day yet, so this card shows the latest day available."
                  arrow
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                    }}
                  >
                    as of {toDisplayDate(kpi.asOfDate)}
                  </Typography>
                </Tooltip>
              )}
              {kpi.topMachine && (
                <Tooltip
                  title={`Machine with the most downtime in this window (Breakdown, Power Failure, Preventive Maintenance, Setup & Change, Operations/Material/Manpower — excludes No Schedule): ${Math.round(kpi.topMachine.minutes).toLocaleString()} min.`}
                  arrow
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Top: {kpi.topMachine.machine} (
                    {Math.round(kpi.topMachine.minutes).toLocaleString()} min)
                  </Typography>
                </Tooltip>
              )}
              {kpi.partialDay && (
                <Tooltip
                  title="This day is still in progress — one or more shifts have no row yet, so a comparison against the previous full day would be an artefact."
                  arrow
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "warning.main",
                      whiteSpace: "nowrap",
                    }}
                  >
                    in progress · partial day
                  </Typography>
                </Tooltip>
              )}
              {kpi.truncated && (
                <Tooltip
                  title="The row cap was reached for this window, so the oldest days are missing from this total. Narrow the date range for a complete figure."
                  arrow
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "error.main",
                      whiteSpace: "nowrap",
                    }}
                  >
                    partial data · range too wide
                  </Typography>
                </Tooltip>
              )}
            </Stack>
          )}
        </Stack>

        {Boolean(kpi.quantityBreakdown?.length) && (
          <Stack spacing={0.25} sx={{ minWidth: 0, flexShrink: 0 }}>
            {kpi.quantityBreakdown.map(({ label, quantities }) => (
              <Stack
                key={label}
                direction="row"
                alignItems="baseline"
                justifyContent="space-between"
                spacing={0.75}
              >
                <Typography
                  component="span"
                  sx={{
                    fontSize: 10.5,
                    color: "text.secondary",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label.replace(" Compound", "")}
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.5}
                  useFlexGap
                  flexWrap="wrap"
                  justifyContent="flex-end"
                >
                  {quantities.map(({ value, unit, fullValue }, index) => (
                    <Tooltip
                      key={`${unit}-${index}`}
                      title={fullValue}
                      arrow
                      describeChild
                    >
                      <Typography
                        component="span"
                        tabIndex={0}
                        aria-label={`${label}: ${fullValue}`}
                        sx={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          color: "text.primary",
                          whiteSpace: "nowrap",
                          borderRadius: 0.5,
                          "&:focus-visible": {
                            outline: "2px solid",
                            outlineColor: "primary.main",
                            outlineOffset: 2,
                          },
                        }}
                      >
                        {value}
                        {unit ? ` ${unit}` : ""}
                      </Typography>
                    </Tooltip>
                  ))}
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}

        {/* Sparkline Graph — Auto-hides when card is too narrow (<215px) to prevent text collision */}
        {hasSpark && (
          <Box
            sx={{
              flexShrink: 0,
              ml: 1,
              "@container (max-width: 215px)": {
                display: "none",
              },
            }}
          >
            <Sparkline
              data={kpi.spark}
              color={cardTheme.sparkColor}
              width={70}
              height={22}
              onClick={(e) => {
                e.stopPropagation();
                onTrendOpen?.(kpi);
              }}
            />
          </Box>
        )}
      </Stack>

      {kpi.quantityLines && (
        <Stack
          spacing={0.5}
          sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: "divider" }}
        >
          {kpi.quantityLines.map(({ label, value, quantities }) => (
            <Box
              key={label}
              sx={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
                columnGap: 1.5,
                alignItems: "baseline",
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "text.secondary",
                  minWidth: 0,
                  overflowWrap: "break-word",
                }}
              >
                {label}
              </Typography>
              <Stack
                direction="row"
                useFlexGap
                flexWrap="wrap"
                justifyContent="flex-end"
                alignItems="baseline"
                columnGap={0.75}
                rowGap={0.25}
                sx={{ minWidth: 0 }}
              >
                {(quantities ?? [value]).map((quantity, index, items) => {
                  const display =
                    typeof quantity === "string"
                      ? { value: quantity, unit: "", fullValue: quantity }
                      : quantity;
                  return (
                    <Tooltip
                      key={display.unit || display.value}
                      title={display.fullValue}
                      arrow
                      describeChild
                    >
                      <Stack
                        component="span"
                        direction="row"
                        alignItems="baseline"
                        spacing={0.5}
                        tabIndex={0}
                        aria-label={display.fullValue}
                        sx={{
                          whiteSpace: "nowrap",
                          borderRadius: 0.5,
                          "&:focus-visible": {
                            outline: "2px solid",
                            outlineColor: "primary.main",
                            outlineOffset: 2,
                          },
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 13,
                            fontWeight: 600,
                            lineHeight: 1.5,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {display.value}
                        </Typography>
                        {display.unit && (
                          <Typography
                            component="span"
                            sx={{
                              fontSize: 11.5,
                              color: "text.secondary",
                              lineHeight: 1.5,
                            }}
                          >
                            {display.unit}
                          </Typography>
                        )}
                        {index < items.length - 1 && (
                          <Typography
                            component="span"
                            sx={{ fontSize: 12, color: "text.disabled" }}
                          >
                            ·
                          </Typography>
                        )}
                      </Stack>
                    </Tooltip>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* 3. Horizontal Target / Progress Bar with Gradient */}
      {!disabled && !kpi.hideProgress && !isDrilling && !isDrilldown && (
        <Box
          sx={{
            width: "100%",
            height: 6,
            borderRadius: 3,
            backgroundColor: cardTheme.trackColor,
            overflow: "hidden",
            my: 0.75,
          }}
        >
          <Box
            sx={{
              width: `${progressPct}%`,
              height: "100%",
              borderRadius: 3,
              background: cardTheme.barGradient || cardTheme.barColor,
              transition: "width 0.4s ease",
            }}
          />
        </Box>
      )}

      {/* Production vs Plan & Shortfall (SKU Plan Fulfillment) — Compact single-line row */}
      {!disabled &&
        kpi.produced != null &&
        kpi.planned != null &&
        !isDrilling &&
        !isDrilldown && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mt: 0.5, mb: 0.25, minWidth: 0, flexWrap: "wrap", gap: 0.5 }}
          >
            <Typography
              sx={{
                fontSize: 11.5,
                fontWeight: 600,
                color: "text.secondary",
                whiteSpace: "nowrap",
              }}
            >
              Prod / Plan:{" "}
              <Box
                component="span"
                sx={{ fontWeight: 700, color: cardTheme.textColor }}
              >
                {formatIndianNumber(kpi.produced)}
              </Box>{" "}
              / {formatIndianNumber(kpi.planned)} {kpi.quantityUnit || "NOS"}
            </Typography>

            {kpi.shortfall != null && (
              <Typography
                sx={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                {kpi.shortfall > 0 ? (
                  <>
                    Shortfall:{" "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: theme.custom?.status?.red ?? "error.main",
                      }}
                    >
                      {formatIndianNumber(kpi.shortfall)}
                    </Box>{" "}
                    {kpi.quantityUnit || "NOS"}
                  </>
                ) : kpi.shortfall < 0 ? (
                  <>
                    Surplus:{" "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: theme.custom?.status?.green ?? "success.main",
                      }}
                    >
                      +{formatIndianNumber(-kpi.shortfall)}
                    </Box>{" "}
                    {kpi.quantityUnit || "NOS"}
                  </>
                ) : (
                  <>
                    Shortfall:{" "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: theme.custom?.status?.green ?? "success.main",
                      }}
                    >
                      0
                    </Box>{" "}
                    {kpi.quantityUnit || "NOS"}
                  </>
                )}
              </Typography>
            )}
          </Stack>
        )}

      {/* 4. Footer: Trend Badge & Action Icons */}
      {!disabled && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: alignMetrics ? "auto" : 0.5, pt: alignMetrics ? 1.25 : 0 }}
        >
          {/* Snapshot metadata replaces the hidden trend placeholder. */}
          {kpi.snapshotLabel ? (
            <Typography
              sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.5 }}
            >
              {kpi.snapshotLabel}
            </Typography>
          ) : (
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{ visibility: kpi.hideTrend ? "hidden" : "visible" }}
            >
              {trendUp ? (
                <ArrowOutwardIcon sx={{ fontSize: 15, color: trendColor }} />
              ) : (
                <SouthEastIcon sx={{ fontSize: 15, color: trendColor }} />
              )}
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: trendColor,
                }}
              >
                {trendVal}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "text.secondary",
                }}
              >
                {trendLabel}
              </Typography>
            </Stack>
          )}

          {/* Action Drilldown & Table Icons */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {!kpi.hideTrend && (
              <Tooltip title="View Trend Analytics" arrow>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrendOpen?.(kpi);
                  }}
                  sx={{
                    p: 0.25,
                    color: "text.secondary",
                    "&:hover": { color: "primary.main" },
                  }}
                >
                  <ShowChartIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title="Drilldown Data Table" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDrilling) onCloseDrill?.();
                  else onClick?.(kpi);
                }}
                sx={{
                  p: 0.25,
                  color: "text.secondary",
                  "&:hover": { color: "primary.main" },
                }}
              >
                <TableChartOutlinedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}

export default KpiCard;
