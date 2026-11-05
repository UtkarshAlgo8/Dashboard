import { useState } from "react";
import { Alert, Stack, Typography } from "@mui/material";
import { getCompliance } from "@/api/compliance.js";
import { usePolledQuery } from "@/hooks/usePolledQuery.js";
import { QKpiCard } from "@/components/quality/shared/QualityKpiCard.jsx";
import { KpiSplitLayout } from "@/components/quality/shared/KpiSplitLayout.jsx";
import ComplianceDrillPanel from "@/components/compliance/ComplianceDrillPanel.jsx";
import {
  complianceCard,
  COMPLIANCE_PERIOD_HELP,
  storedCompliancePeriod,
} from "@/lib/compliance.js";

/** BTP Maintenance: connected cards only, with one shared right-hand drill. */
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
  const drillOpen = Boolean(open && period);

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
      <KpiSplitLayout
        open={drillOpen}
        cards={["pm", "daily"].map((id) => (
          <QKpiCard
            key={id}
            kpi={complianceCard(id, matches ? query.data.kpis[id] : null, {
              period,
              error: query.error,
              isLoading: query.isLoading || (period && !matches),
            })}
            isOpen={drillOpen && open === id}
            onToggle={() => setOpen(open === id ? null : id)}
          />
        ))}
        panel={
          drillOpen && (
            <ComplianceDrillPanel
              key={`${open}|${period.date}|${period.granularity}`}
              id={open}
              period={period}
              onClose={() => setOpen(null)}
            />
          )
        }
      />
    </Stack>
  );
}
