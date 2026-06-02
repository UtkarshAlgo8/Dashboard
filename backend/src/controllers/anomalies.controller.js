/**
 * Anomalies strip — stubbed to [] in Phase 1 (status is out of scope,
 * so there's no upstream signal). Returning [] keeps the frontend's
 * empty state happy.
 */
export function getAnomalies(_req, res) {
  res.json({ data: [] });
}
