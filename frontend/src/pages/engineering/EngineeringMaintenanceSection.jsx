import { useState } from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { getCompliance } from "@/api/compliance.js";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import EngineeringKpiGrid from "@/components/engineering/EngineeringKpiGrid.jsx";
import { StatTile } from "@/components/quality/shared/StatTile.jsx";
import ComplianceDrillPanel from "@/components/compliance/ComplianceDrillPanel.jsx";
import { ENGINEERING_MAINTENANCE_KPIS } from "@/lib/mockData.js";
import {
  complianceCard,
  COMPLIANCE_COUNT_COLUMNS,
  COMPLIANCE_PERIOD_HELP,
  storedCompliancePeriod,
} from "@/lib/compliance.js";

const placeholders = ENGINEERING_MAINTENANCE_KPIS.filter(
  (kpi) => kpi.id !== "pmCompliance",
).map((kpi) => ({
  ...kpi,
  value: "Unavailable",
  unit: "",
  target: null,
  status: "grey",
}));

/** The BTP Maintenance tab: two live compliance cards, no mock KPI values. */
export default function EngineeringMaintenanceSection({
  period: selectedPeriod,
  shift,
}) {
  const [open, setOpen] = useState(null);
  const period = storedCompliancePeriod({ ...selectedPeriod, shift });
  const query = usePolledQuery(
    () => getCompliance({ ids: ["pm", "daily"], ...period }),
    {
      enabled: Boolean(period),
      interval: 0,
      deps: [period?.date, period?.granularity],
    },
  );
  const context = query.data?.context;
  const matches =
    period &&
    context?.date === period.date &&
    context?.granularity === period.granularity;
  return (
    <Stack spacing={2}>
      <Typography component="h1" sx={{ fontSize: 20, fontWeight: 700 }}>
        Maintenance
      </Typography>
      {!period && <Alert severity="info">{COMPLIANCE_PERIOD_HELP}</Alert>}
      {query.error && period && (
        <Alert severity="error">
          Compliance unavailable: {query.error.message}
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        {["pm", "daily"].map((id) => (
          <QKpiCard
            key={id}
            kpi={complianceCard(id, matches ? query.data.kpis[id] : null, {
              period,
              error: query.error,
              isLoading: query.isLoading || (period && !matches),
            })}
            isOpen={open === id}
            onToggle={() => setOpen(open === id ? null : id)}
          />
        ))}
      </Box>
      {matches && (
        <Box>
          <Typography sx={{ mb: 1, fontSize: 13, fontWeight: 600 }}>
            Daily Check Sheet counts (NOS) · BTP
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {COMPLIANCE_COUNT_COLUMNS.map(([key, label]) => (
              <StatTile
                key={key}
                label={label}
                value={query.data.kpis.daily?.counts[key] ?? "—"}
              />
            ))}
          </Stack>
        </Box>
      )}
      {open && period && (
        <ComplianceDrillPanel
          key={`${open}|${period.date}|${period.granularity}`}
          id={open}
          period={period}
          onClose={() => setOpen(null)}
        />
      )}
      <Box>
        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
          Other Maintenance KPIs are not connected yet.
        </Typography>
        <EngineeringKpiGrid kpis={placeholders} isLoading={false} />
      </Box>
    </Stack>
  );
}
