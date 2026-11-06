import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import KpiCard from "@/components/production/KpiCard.jsx";
import JKLoader from "@/components/JKLoader.jsx";
import ScrapReworkDrillPanel from "@/components/drills/quality/ScrapReworkDrillPanel.jsx";
import PaintWeightDrill from "@/components/technical/PaintWeightDrill.jsx";
import UniformityDrillPanel from "@/components/quality/UniformityDrillPanel.jsx";
import {
  overallUniformityFamily,
  uniformityCard,
} from "@/lib/uniformityDrill.js";
import {
  getCuringScrapRows,
  getProductChildren,
  getProductSummary,
} from "@/api/quality.js";
import { toDrillRows, toKpiGrid } from "@/lib/kpi-transformer.js";
import {
  PAINT_WEIGHT_HEADLINE_KPI,
  toGtWeightCard,
} from "@/lib/paintWeight.js";

const PRODUCT_KPIS = [
  {
    id: "overallYield",
    name: "Overall Production Yield",
    sourceKpi: "Overall_Production_Yield",
  },
  {
    id: "tyresTested",
    name: "Uniformity Tyres Tested",
    sourceKpi: "Overall_Uniformity_Production",
  },
  {
    id: "mtmsYield",
    name: "MTMS Uniformity Yield",
    sourceKpi: "Mtms_Uniformity_Yield",
  },
  {
    id: "tuoYield",
    name: "TUO Uniformity Yield",
    sourceKpi: "Tuo_Uniformity_Yield",
  },
  {
    id: "zfYield",
    name: "ZF Uniformity Yield",
    sourceKpi: "Zf_Uniformity_Yield",
  },
  {
    id: "zfBalancing",
    name: "ZF Balancing Yield",
    sourceKpi: "Zf_Balancing_Yield_o",
  },
  {
    id: "dbmBalancing",
    name: "DBM Balancing Yield",
    sourceKpi: "Dbm_Balancing_Yield",
  },
  { id: "insp", name: "Inspector Rating" },
  { id: "gtw", name: "GT Weight Variation" },
  { id: "eg", name: "E-Grade Count" },
  { id: "sc", name: "Scrap", productionSource: "curingScrap" },
  { id: "cta", name: "CTA Compliance" },
];

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

function formatValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("en-IN") : "—";
}

function UnavailableProductCard({ name }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 136,
        minWidth: 0,
        p: 1.75,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRadius: 2.5,
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <GridViewOutlinedIcon sx={{ color: "text.disabled", fontSize: 20 }} />
        <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>{name}</Typography>
      </Stack>
      <Typography
        sx={{
          fontSize: 28,
          lineHeight: 1.1,
          fontWeight: 800,
          color: "text.disabled",
        }}
      >
        —
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        No gold data available
      </Typography>
    </Paper>
  );
}

function SectionHeading({ children }) {
  return (
    <Typography
      component="h2"
      sx={{
        mb: 1,
        fontSize: 12,
        fontWeight: 800,
        color: "text.secondary",
        textTransform: "uppercase",
        letterSpacing: 0.55,
      }}
    >
      {children}
    </Typography>
  );
}

function ProductGrid({ cards, openDrill, onOpenDrill, vertical = false }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: vertical
          ? "1fr"
          : "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
        gap: 1,
      }}
    >
      {cards.map((card) =>
        card.value == null ? (
          <UnavailableProductCard key={card.id} name={card.name} />
        ) : (
          <KpiCard
            key={card.id}
            kpi={card}
            isDrilling={openDrill?.id === card.id}
            onClick={card.drillable ? onOpenDrill : undefined}
          />
        ),
      )}
    </Box>
  );
}

function ProductBreadcrumb({ path, onNavigate }) {
  return (
    <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ mb: 1.5 }}>
      {path.map((item, index) => (
        <Stack key={`${item}-${index}`} direction="row" alignItems="center">
          {index > 0 && (
            <Typography sx={{ px: 0.5, color: "text.disabled" }}>›</Typography>
          )}
          {index === path.length - 1 ? (
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              {item}
            </Typography>
          ) : (
            <Button
              size="small"
              onClick={() => onNavigate(index)}
              sx={{ minWidth: 0, p: 0.25, textTransform: "none", fontSize: 13 }}
            >
              {item}
            </Button>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

function ProductChildrenDrill({
  kpi,
  date,
  shift,
  granularity,
  onClose,
  drillPeriod,
  onClearDrillShift,
  onBridgeChange,
}) {
  const initialLevel = useMemo(
    () => ({ title: kpi.name, kpiNames: kpi.drillChildren ?? [] }),
    [kpi.name, kpi.drillChildren],
  );
  const [levels, setLevels] = useState([initialLevel]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [bridge, setBridge] = useState(null);
  const level = levels[levels.length - 1];
  const namesKey = level.kpiNames.join(",");

  useEffect(() => {
    if (!namesKey) return undefined;
    let cancelled = false;
    getProductChildren({
      kpiNames: level.kpiNames,
      date,
      shift,
      granularity,
    })
      .then((result) => {
        if (!cancelled) setRows(result?.rows ?? []);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setRows([]);
          setError(requestError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, granularity, level.kpiNames, namesKey, shift]);

  const openChild = (row) => {
    if (row.drill_down?.is_leaf || !row.drill_down?.children?.length) return;
    setRows(null);
    setError(null);
    setLevels((current) => [
      ...current,
      {
        title: row.machine || PRODUCT_KPI_LABELS[row.kpi_name] || row.kpi_name,
        kpiNames: row.drill_down.children,
      },
    ]);
  };
  const path = [
    "Uniformity & Balancing",
    kpi.name,
    ...levels.slice(1).map((item) => item.title),
  ];

  if (bridge) {
    if (!drillPeriod)
      return (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography>
            Choose All Shifts for a month or date range, or select a single day
            to use a shift.
          </Typography>
          <Button onClick={onClearDrillShift}>Use All Shifts</Button>
          <Button
            onClick={() => {
              setBridge(null);
              onBridgeChange(false);
            }}
          >
            Back to families
          </Button>
        </Paper>
      );
    return (
      <>
        {drillPeriod.period === "range" && (
          <Typography variant="caption" color="text.secondary">
            Cards show the latest snapshot; this drill covers the selected date
            range.
          </Typography>
        )}
        <UniformityDrillPanel
          key={JSON.stringify([bridge.familyKpi, drillPeriod])}
          card={uniformityCard(bridge.familyKpi)}
          title={bridge.title}
          period={drillPeriod}
          parentBreadcrumb={["Uniformity & Balancing", kpi.name, bridge.title]}
          onClose={onClose}
          onParentNav={(index) => {
            if (index === 0) return onClose();
            setBridge(null);
            onBridgeChange(false);
          }}
        />
      </>
    );
  }
  return (
    <Paper component="section" variant="outlined" sx={{ mt: 2, p: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: 750 }}>
          {kpi.name} — drill-down
        </Typography>
        <Button size="small" onClick={onClose}>
          Close
        </Button>
      </Stack>
      {kpi.sourceKpi === "Overall_Production_Yield" &&
        drillPeriod?.period === "range" && (
          <Typography variant="caption" color="text.secondary">
            Family rows use the latest-day snapshot; the selected family drill
            covers the full date range.
          </Typography>
        )}
      <ProductBreadcrumb
        path={path}
        onNavigate={(index) => {
          if (index > 0) {
            setRows(null);
            setError(null);
            setLevels((current) => current.slice(0, index));
          }
        }}
      />
      {rows == null ? (
        <Box sx={{ display: "grid", placeItems: "center", minHeight: 160 }}>
          <CircularProgress size={26} aria-label="Loading gold data" />
        </Box>
      ) : error ? (
        <Typography sx={{ py: 2, fontSize: 13, color: "error.main" }}>
          Unable to load gold drill data. Please try again.
        </Typography>
      ) : rows.length ? (
        <>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label={`${kpi.name} drill-down`}>
              <TableHead>
                <TableRow>
                  <TableCell>KPI / machine</TableCell>
                  <TableCell>Machine</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell>Unit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => {
                  const familyKpi =
                    levels.length === 1
                      ? overallUniformityFamily(
                          kpi.sourceKpi,
                          level.kpiNames,
                          row,
                        )
                      : null;
                  const canDrill = Boolean(
                    familyKpi ||
                    (!row.drill_down?.is_leaf &&
                      row.drill_down?.children?.length),
                  );
                  const guideControl = Boolean(familyKpi);
                  const label =
                    row.machine ||
                    PRODUCT_KPI_LABELS[row.kpi_name] ||
                    row.kpi_name;
                  const activate = () => {
                    if (!familyKpi) return openChild(row);
                    setBridge({ familyKpi, title: label });
                    onBridgeChange(true);
                  };
                  return (
                    <TableRow
                      key={`${row.kpi_name}-${row.machine || "summary"}-${index}`}
                      hover={canDrill}
                      onClick={canDrill && !guideControl ? activate : undefined}
                      onKeyDown={
                        canDrill && !guideControl
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                activate();
                              }
                            }
                          : undefined
                      }
                      tabIndex={canDrill && !guideControl ? 0 : undefined}
                      role={canDrill && !guideControl ? "button" : undefined}
                      sx={
                        canDrill
                          ? {
                              cursor: "pointer",
                              "&:focus-visible": {
                                outline: "2px solid",
                                outlineColor: "primary.main",
                                outlineOffset: -2,
                              },
                            }
                          : undefined
                      }
                    >
                      <TableCell
                        sx={
                          canDrill
                            ? { color: "primary.main", fontWeight: 700 }
                            : undefined
                        }
                      >
                        {canDrill && guideControl ? (
                          <Button
                            size="small"
                            onClick={activate}
                            sx={{ textTransform: "none" }}
                          >
                            {label} ›
                          </Button>
                        ) : (
                          <>
                            {label}
                            {canDrill ? " ›" : ""}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.machine && row.machine !== label
                          ? row.machine
                          : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {formatValue(row.actual_value)}
                      </TableCell>
                      <TableCell>{row.unit || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          <Typography sx={{ mt: 1, fontSize: 12, color: "text.secondary" }}>
            Select a highlighted row to open its next gold KPI level.
          </Typography>
        </>
      ) : (
        <Typography sx={{ py: 2, fontSize: 13, color: "text.secondary" }}>
          No gold data available for this selection.
        </Typography>
      )}
    </Paper>
  );
}

function CuringScrapDrill({ date, shift, granularity, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCuringScrapRows({ date, shift, granularity, includeDrill: true })
      .then((result) => {
        if (!cancelled) setRows(Array.isArray(result) ? result : []);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setRows([]);
          setError(requestError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, granularity, shift]);

  return (
    <Paper component="section" variant="outlined" sx={{ mt: 2, p: 2 }}>
      <Typography sx={{ mb: 1.5, fontSize: 16, fontWeight: 750 }}>
        Curing Scrap — drill-down
      </Typography>
      {error ? (
        <Typography sx={{ py: 2, fontSize: 13, color: "error.main" }}>
          Unable to load Curing Scrap drill data. Please try again.
        </Typography>
      ) : (
        <ScrapReworkDrillPanel
          kind="Scrap"
          drillRows={toDrillRows(rows)}
          granularity={granularity}
          isLoading={loading}
          onClose={onClose}
        />
      )}
    </Paper>
  );
}

/** Technical cards use the established Quality Product Gold source. */
export default function TechnicalUniformityBalancingSection({
  date,
  shift = "All",
  granularity = "DAY",
  drillPeriod,
  onClearDrillShift,
}) {
  const [summary, setSummary] = useState(null);
  const [scrapRows, setScrapRows] = useState(null);
  const [loading, setLoading] = useState(Boolean(date));
  const [error, setError] = useState(null);
  const [openDrill, setOpenDrill] = useState(null);
  const [bridged, setBridged] = useState(false);
  const closeDrill = () => {
    setBridged(false);
    setOpenDrill(null);
  };
  const openCard = (card) => {
    setBridged(false);
    setOpenDrill(card);
  };

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    Promise.allSettled([
      getProductSummary({ date, shift, granularity }),
      getCuringScrapRows({ date, shift, granularity }),
    ])
      .then(([summaryResult, scrapResult]) => {
        if (cancelled) return;
        const failed = [summaryResult, scrapResult].find(
          (result) => result.status === "rejected",
        );
        setSummary(
          summaryResult.status === "fulfilled"
            ? (summaryResult.value ?? { values: {} })
            : { values: {} },
        );
        setScrapRows(
          scrapResult.status === "fulfilled" && Array.isArray(scrapResult.value)
            ? scrapResult.value
            : [],
        );
        setError(failed?.reason ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, granularity, shift]);

  const curingScrapCard = useMemo(
    () =>
      Array.isArray(scrapRows)
        ? toKpiGrid(scrapRows, {
            section: "Curing",
            category: "Q",
            granularity,
            mode: "snapshot",
            plantId: "banmore",
            kpiDefs: [CURING_SCRAP_KPI],
          })[0]
        : null,
    [granularity, scrapRows],
  );
  const cards = useMemo(
    () =>
      PRODUCT_KPIS.map((definition) => {
        if (definition.productionSource === "curingScrap") {
          if (curingScrapCard?.value == null)
            return { ...definition, value: null };
          return {
            ...definition,
            value: curingScrapCard.value,
            unit: curingScrapCard.unit || "",
            status: curingScrapCard.status || null,
            drillable: true,
            drillType: "curingScrap",
          };
        }
        // GT Weight stays under "Other Product KPIs", so it carries no
        // sourceKpi; its value is the paint-weight headline gold KPI.
        if (definition.id === "gtw")
          return (
            toGtWeightCard(
              summary?.values?.[PAINT_WEIGHT_HEADLINE_KPI],
              definition,
            ) ?? { ...definition, value: null }
          );
        if (!definition.sourceKpi) return { ...definition, value: null };
        const live = summary?.values?.[definition.sourceKpi];
        if (live?.actual_value == null) return { ...definition, value: null };
        return {
          ...definition,
          value: Number(live.actual_value),
          unit: live.unit || "",
          drillable: Boolean(
            uniformityCard(definition.sourceKpi) ||
            (!live.drill_down?.is_leaf && live.drill_down?.children?.length),
          ),
          drillType: uniformityCard(definition.sourceKpi)
            ? "uniformity"
            : "product",
          drillChildren: live.drill_down?.children ?? [],
        };
      }),
    [curingScrapCard, summary],
  );
  const uniformityCards = cards.filter((card) => card.sourceKpi);
  const otherCards = cards.filter((card) => !card.sourceKpi);
  const vertical = openDrill?.drillType === "uniformity" || bridged;

  return (
    <Box component="section" aria-labelledby="technical-uniformity-heading">
      <Typography
        id="technical-uniformity-heading"
        component="h1"
        sx={{ mb: 1.5, fontSize: 18, fontWeight: 750, color: "text.primary" }}
      >
        Uniformity &amp; Balancing
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexDirection: {
            xs: "column",
            lg: vertical ? "row" : "column",
          },
          gap: 2,
          alignItems: "flex-start",
        }}
      >
        <Box
          sx={{
            width: "100%",
            minWidth: 0,
            flex: vertical ? { lg: "0 0 250px" } : undefined,
          }}
        >
          {loading ? (
            <JKLoader message="Loading KPIs" />
          ) : (
            <>
              {error && (
                <Typography
                  sx={{ mb: 1.5, fontSize: 12.5, color: "error.main" }}
                >
                  Some live values could not be loaded. Unavailable cards remain
                  marked as no data.
                </Typography>
              )}
              <Stack spacing={2.5}>
                <Box>
                  <SectionHeading>Uniformity &amp; Balancing</SectionHeading>
                  <ProductGrid
                    cards={uniformityCards}
                    openDrill={openDrill}
                    onOpenDrill={openCard}
                    vertical={vertical}
                  />
                </Box>
                <Box>
                  <SectionHeading>Other Product KPIs</SectionHeading>
                  <ProductGrid
                    cards={otherCards}
                    openDrill={openDrill}
                    onOpenDrill={openCard}
                    vertical={vertical}
                  />
                </Box>
              </Stack>
            </>
          )}
        </Box>
        <Box sx={{ width: "100%", minWidth: 0, flex: 1 }}>
          {openDrill?.drillType === "uniformity" && !drillPeriod && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography>
                Choose All Shifts for a month or date range, or select a single
                day to use a shift.
              </Typography>
              <Button onClick={onClearDrillShift}>Use All Shifts</Button>
            </Paper>
          )}
          {openDrill?.drillType === "uniformity" && drillPeriod && (
            <>
              {drillPeriod.period === "range" && (
                <Typography variant="caption" color="text.secondary">
                  Cards show the latest snapshot; this drill covers the selected
                  date range.
                </Typography>
              )}
              <UniformityDrillPanel
                key={JSON.stringify([openDrill.id, drillPeriod])}
                card={uniformityCard(openDrill.sourceKpi)}
                title={openDrill.name}
                period={drillPeriod}
                onClose={() => setOpenDrill(null)}
              />
            </>
          )}
          {openDrill?.drillType === "product" && (
            <ProductChildrenDrill
              key={`${openDrill.id}-${date}-${shift}-${granularity}`}
              kpi={openDrill}
              date={date}
              shift={shift}
              granularity={granularity}
              drillPeriod={drillPeriod}
              onClearDrillShift={onClearDrillShift}
              onBridgeChange={setBridged}
              onClose={closeDrill}
            />
          )}
          {openDrill?.drillType === "paintWeight" && (
            <PaintWeightDrill
              key={`${date}-${shift}-${granularity}`}
              date={date}
              shift={shift}
              granularity={granularity}
              breadcrumb={["Uniformity & Balancing", openDrill.name]}
              onClose={() => setOpenDrill(null)}
            />
          )}
          {openDrill?.drillType === "curingScrap" && (
            <CuringScrapDrill
              key={`${date}-${shift}-${granularity}`}
              date={date}
              shift={shift}
              granularity={granularity}
              onClose={() => setOpenDrill(null)}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
