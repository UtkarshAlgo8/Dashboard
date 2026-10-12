import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

/**
 * Knowledge base responses for typical plant operational queries.
 * Shaped like the real ChatResponse so the rest of the app has exactly
 * one response contract to deal with, mock or live.
 */
function getMockResponse(userMessage = "", intent = "query") {
  const query = userMessage.toLowerCase().trim();

  let finalAnswer;
  if (query.includes("oee")) {
    finalAnswer =
      "**Banmore Plant OEE Summary (Current Snapshot)**\n\n" +
      "- **Overall Plant OEE:** **78.4%** (Target: 82.0%)\n" +
      "- **Mixing Section:** 81.2% (Availability 92%, Performance 91%, Quality 97%)\n" +
      "- **TBM Section:** 77.8% (Minor bottleneck observed in bead loading)\n" +
      "- **Curing Section:** 76.5% (Down due to scheduled press maintenance)\n\n" +
      "*Recommendation:* Check Curing press temperature stabilization logs to improve overall availability.";
  } else if (query.includes("downtime")) {
    finalAnswer =
      "**Top Downtime Causes (Yesterday - Banmore Plant)**\n\n" +
      "1. **Curing Press #4 Seal Leakage:** 42 mins (Unplanned mechanical)\n" +
      "2. **TBM Size Changeover (185/65 R15 to 215/60 R16):** 35 mins (Planned changeover)\n" +
      "3. **Extruder Die Temperature Fluctuation:** 18 mins (Thermal stabilization)\n" +
      "4. **Raw Material Conveyor Jam:** 12 mins (Cleared by Shift B maintenance)\n\n" +
      "Total recorded downtime was **107 minutes**, within the allowable 120-minute daily tolerance threshold.";
  } else if (query.includes("scrap") || query.includes("waste")) {
    finalAnswer =
      "**Scrap & Rejection Analysis (Banmore PCR)**\n\n" +
      "- **Current Scrap Rate:** **1.84%** (Target threshold: < 1.50%)\n" +
      "- **Major Scrap Contributors:**\n" +
      "  - Bead unseating in Curing: **42%** of total scrap\n" +
      "  - Ply blister / air entrapment in TBM: **31%**\n" +
      "  - Tread extrusion weight variance: **15%**\n" +
      "  - Others: **12%**\n\n" +
      "*Action Item:* Quality team has flagged Mold Cavity #12 for inspection during upcoming shift change.";
  } else if (query.includes("shift") || query.includes("comparison")) {
    finalAnswer =
      "**Shift Production Comparison (PCR Tires)**\n\n" +
      "- **Shift A (06:00 - 14:00):** 4,820 tires (101.4% of shift target) 🟢\n" +
      "- **Shift B (14:00 - 22:00):** 4,690 tires (98.7% of shift target) 🟡\n" +
      "- **Shift C (22:00 - 06:00):** 4,310 tires (94.2% of shift target) 🔴\n\n" +
      "*Note:* Shift C output was affected by the 42-minute press seal repair.";
  } else if (
    query.includes("hello") ||
    query.includes("hi") ||
    query.includes("hey")
  ) {
    finalAnswer =
      "Hello! I am **JK Agent**, your industrial AI copilot for the JK Tyre operations dashboard.\n\n" +
      "I can assist you with:\n" +
      "- **Plant OEE & Line Performance**\n" +
      "- **Downtime root cause breakdowns**\n" +
      "- **Scrap, defects & quality metrics**\n" +
      "- **Shift-wise output comparisons**\n\n" +
      "What operational data would you like to explore today?";
  } else {
    finalAnswer =
      `I have logged your inquiry: *"${userMessage}"*\n\n` +
      "Based on current telemetry from the **Banmore Plant**:\n" +
      "- Lines are operating within nominal thermal and pressure bounds.\n" +
      "- Daily production attainment is currently at **98.2%**.\n\n" +
      "You can ask me specific details regarding **OEE**, **downtime reasons**, **scrap percentages**, or **shift comparisons**.";
  }

  // Shaped like the live ChatResponse: no `columns` / `preview_rows`, and
  // the report fields the `report` intent populates.
  const base = {
    session_id: null,
    intent,
    final_answer: finalAnswer,
    execution_error: null,
    current_kpi_family: null,
    generated_sql: null,
    result_id: null,
    row_count: null,
    is_large_result: false,
    download_available: false,
    wants_plot: false,
    plot_spec: null,
    report_id: null,
    report_type: null,
    report_available: false,
  };

  if (intent === "plot") {
    return {
      ...base,
      result_id: "mock-result-plot",
      row_count: 16,
      download_available: true,
      wants_plot: true,
      plot_spec: {
        chart_type: "line",
        x: "date",
        y: "actual_value",
        group_by: null,
      },
    };
  }
  if (intent === "report") {
    return {
      ...base,
      report_id: "mock-report-1",
      report_type: "production_summary",
      report_available: true,
    };
  }
  if (intent === "analyze") {
    return {
      ...base,
      result_id: "mock-result-analyze",
      row_count: 42,
      download_available: true,
    };
  }
  return base;
}

/**
 * Sends a query to the JK Agent (JK KPI Assistant, proxied via the
 * backend) or a simulated assistant when mocking.
 *
 * @param {{ query: string, session_id: string, intent: import("@/lib/chatIntents.js").ChatIntent }} payload
 * @returns {Promise<object>} ChatResponse
 */
export function sendChatMessage(payload) {
  if (USE_MOCK) {
    const result = getMockResponse(payload.query, payload.intent);
    return mockDelay(result, 600, 1100);
  }

  return client.post("/chat", payload);
}

/**
 * Fetches the full cached result set for a chat response — used both for
 * the CSV download and to supply the rows a `plot_spec` is charted from,
 * since the upstream no longer returns `preview_rows` inline.
 *
 * @param {string} resultId
 * @returns {Promise<{ result_id: string, row_count: number, columns: string[], rows: object[] }>}
 */
export function downloadChatResult(resultId) {
  return client.get(`/chat/download/${encodeURIComponent(resultId)}`);
}

/**
 * Fetches a generated report PDF as a Blob.
 *
 * The backend route is auth-gated, so this goes through the API client to
 * pick up the Bearer header rather than being linked to directly. The
 * interceptor's `{ data }` unwrapping does not apply to a blob response,
 * so the raw axios body is returned.
 *
 * @param {string} reportId
 * @returns {Promise<Blob>}
 */
export async function downloadChatReportPdf(reportId) {
  if (USE_MOCK) {
    return mockDelay(
      new Blob(["Mock JK Agent report"], { type: "application/pdf" }),
      400,
      800,
    );
  }

  const response = await client.get(
    `/chat/report/${encodeURIComponent(reportId)}/pdf`,
    { responseType: "blob", rawEnvelope: true },
  );
  return response;
}
