/**
 * Engineering "Reliability" tab (spec 16/17): the 5-card grid (Breakdown,
 * MTBF, MTTR, Zero Breakdown, Top Machine Breakdowns), each expanding a
 * drill panel inline below the grid when clicked.
 */
import { useEffect, useState } from "react";
import { getReliabilitySummary } from "@/api/engineering.js";
import JKLoader from "@/components/JKLoader.jsx";
import { C } from "./reliabilityShared.jsx";
import ReliabilityCardsGrid from "./ReliabilityCardsGrid.jsx";

function EngineeringReliabilitySection({ date, from, to, granularity = "MONTH" }) {
  // The response is stamped with the period it answered for, so "still
  // loading" is DERIVED (stamp !== current period) rather than held in its
  // own state. That covers the first render and every period change with one
  // rule, and avoids a setState-in-effect cascading render.
  const requestKey = `${date}|${from ?? ""}|${to ?? ""}|${granularity}`;
  const [result, setResult] = useState({ key: null, values: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getReliabilitySummary({ date, from, to, granularity })
      .then(
        (res) =>
          !cancelled &&
          setResult({ key: requestKey, values: res?.values ?? null, error: null }),
      )
      .catch(
        (err) => !cancelled && setResult({ key: requestKey, values: null, error: err }),
      );
    return () => {
      cancelled = true;
    };
  }, [date, from, to, granularity, requestKey]);

  if (result.key !== requestKey) {
    return <JKLoader message="Loading reliability KPIs" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {result.error && (
        <div style={{ color: C.rd, fontSize: 13 }}>
          Summary fetch failed: {result.error.message}
        </div>
      )}
      <ReliabilityCardsGrid
        values={result.values}
        date={date}
        granularity={granularity}
        includeTopMachines={true}
      />
    </div>
  );
}

export default EngineeringReliabilitySection;
