/* eslint-disable */
/**
 * Engineering "Overview" tab (spec 16/17): the Loss Tree (pie + 4-level
 * drill) above the same 4 summary cards used by the Reliability tab
 * (Breakdown, MTBF, MTTR, Zero Breakdown — NOT Top Machine Breakdowns).
 */
import { useEffect, useState } from "react";
import { getEngineeringLossTree } from "@/api/engineering.js";
import { getReliabilitySummary } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { Card, C, ReliabilityDrillPanel, LOSS_TREE_LEVELS } from "./reliabilityShared.jsx";
import { LossTreePie } from "./reliabilityPanels.jsx";
import ReliabilityCardsGrid from "./ReliabilityCardsGrid.jsx";

function EngineeringOverviewSection({ date, granularity = "MONTH" }) {
  const [lossRows, setLossRows] = useState([]);
  const [lossLoading, setLossLoading] = useState(true);
  const [lossError, setLossError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [summaryValues, setSummaryValues] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  // Both start true — the page shows one loader until BOTH the Loss Tree and
  // the summary cards have answered, rather than painting half a dashboard.
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLossLoading(true);
    setLossError(null);
    setSelectedCategory(null);
    getEngineeringLossTree({ date, granularity })
      .then((res) => !cancelled && setLossRows(Array.isArray(res?.rows) ? res.rows : []))
      .catch((err) => !cancelled && setLossError(err))
      .finally(() => !cancelled && setLossLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, granularity]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);
    getReliabilitySummary({ date, granularity })
      .then((res) => !cancelled && setSummaryValues(res?.values ?? null))
      .catch((err) => !cancelled && setSummaryError(err))
      .finally(() => !cancelled && setSummaryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, granularity]);

  if (lossLoading || summaryLoading) {
    return <JKLoader message="Loading Engineering overview" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card accent={C.rd}>
        <LossTreePie rows={lossRows} loading={lossLoading} error={lossError} onSlice={setSelectedCategory} />
        {selectedCategory && (
          <div style={{ marginTop: 12 }}>
            <ReliabilityDrillPanel
              levels={LOSS_TREE_LEVELS}
              date={date}
              granularity={granularity}
              agg="sum"
              rootLabel="Loss Tree"
              initialFilters={{ productType: selectedCategory }}
              initialLabel={selectedCategory}
            />
          </div>
        )}
      </Card>

      {summaryError && (
        <div style={{ color: C.rd, fontSize: 13 }}>Summary fetch failed: {summaryError.message}</div>
      )}
      <ReliabilityCardsGrid values={summaryValues} date={date} granularity={granularity} includeTopMachines={false} />
    </div>
  );
}

export default EngineeringOverviewSection;
