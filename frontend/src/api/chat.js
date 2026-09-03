import client from "./client.js";
import { mockDelay } from "@/lib/mockDelay.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== "false";

/**
 * Knowledge base responses for typical plant operational queries.
 */
function getMockResponse(userMessage = "") {
  const query = userMessage.toLowerCase().trim();

  if (query.includes("oee")) {
    return (
      "**Banmore Plant OEE Summary (Current Snapshot)**\n\n" +
      "- **Overall Plant OEE:** **78.4%** (Target: 82.0%)\n" +
      "- **Mixing Section:** 81.2% (Availability 92%, Performance 91%, Quality 97%)\n" +
      "- **TBM Section:** 77.8% (Minor bottleneck observed in bead loading)\n" +
      "- **Curing Section:** 76.5% (Down due to scheduled press maintenance)\n\n" +
      "*Recommendation:* Check Curing press temperature stabilization logs to improve overall availability."
    );
  }

  if (query.includes("downtime")) {
    return (
      "**Top Downtime Causes (Yesterday - Banmore Plant)**\n\n" +
      "1. **Curing Press #4 Seal Leakage:** 42 mins (Unplanned mechanical)\n" +
      "2. **TBM Size Changeover (185/65 R15 to 215/60 R16):** 35 mins (Planned changeover)\n" +
      "3. **Extruder Die Temperature Fluctuation:** 18 mins (Thermal stabilization)\n" +
      "4. **Raw Material Conveyor Jam:** 12 mins (Cleared by Shift B maintenance)\n\n" +
      "Total recorded downtime was **107 minutes**, within the allowable 120-minute daily tolerance threshold."
    );
  }

  if (query.includes("scrap") || query.includes("waste")) {
    return (
      "**Scrap & Rejection Analysis (Banmore PCR)**\n\n" +
      "- **Current Scrap Rate:** **1.84%** (Target threshold: < 1.50%)\n" +
      "- **Major Scrap Contributors:**\n" +
      "  - Bead unseating in Curing: **42%** of total scrap\n" +
      "  - Ply blister / air entrapment in TBM: **31%**\n" +
      "  - Tread extrusion weight variance: **15%**\n" +
      "  - Others: **12%**\n\n" +
      "*Action Item:* Quality team has flagged Mold Cavity #12 for inspection during upcoming shift change."
    );
  }

  if (query.includes("shift") || query.includes("comparison")) {
    return (
      "**Shift Production Comparison (PCR Tires)**\n\n" +
      "- **Shift A (06:00 - 14:00):** 4,820 tires (101.4% of shift target) 🟢\n" +
      "- **Shift B (14:00 - 22:00):** 4,690 tires (98.7% of shift target) 🟡\n" +
      "- **Shift C (22:00 - 06:00):** 4,310 tires (94.2% of shift target) 🔴\n\n" +
      "*Note:* Shift C output was affected by the 42-minute press seal repair."
    );
  }

  if (
    query.includes("hello") ||
    query.includes("hi") ||
    query.includes("hey")
  ) {
    return (
      "Hello! I am **JK Agent**, your industrial AI copilot for the JK Tyre operations dashboard.\n\n" +
      "I can assist you with:\n" +
      "- **Plant OEE & Line Performance**\n" +
      "- **Downtime root cause breakdowns**\n" +
      "- **Scrap, defects & quality metrics**\n" +
      "- **Shift-wise output comparisons**\n\n" +
      "What operational data would you like to explore today?"
    );
  }

  // Fallback operational reply
  return (
    `I have logged your inquiry: *"${userMessage}"*\n\n` +
    "Based on current telemetry from the **Banmore Plant**:\n" +
    "- Lines are operating within nominal thermal and pressure bounds.\n" +
    "- Daily production attainment is currently at **98.2%**.\n\n" +
    "You can ask me specific details regarding **OEE**, **downtime reasons**, **scrap percentages**, or **shift comparisons**."
  );
}

/**
 * Sends a message to the JK Agent backend or simulated assistant.
 *
 * @param {{
 *   message: string,
 *   context?: { plantId?: string, sectionId?: string, range?: string },
 *   history?: Array<{ sender: string, text: string }>
 * }} payload
 * @returns {Promise<{ reply: string, timestamp: string }>}
 */
export function sendChatMessage(payload) {
  if (USE_MOCK) {
    const replyText = getMockResponse(payload.message);
    const result = {
      reply: replyText,
      timestamp: new Date().toISOString(),
    };
    return mockDelay(result, 600, 1100);
  }

  return client
    .post("/chat/completions", payload)
    .then((res) => res.data ?? res);
}
