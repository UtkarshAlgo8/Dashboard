/**
 * Renders the Daily Infiniti Scheduler mail exactly like the manual one:
 * greeting, one-line intro, a 4-column table with 5 KPI rows, sign-off.
 * Only the values and the report date change day to day.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" → { short: "12-Oct", long: "12-Oct-2026", spaced: "12 Oct 2026" } */
export function reportDayLabels(reportDay) {
  const [y, m, d] = reportDay.split("-");
  const mon = MONTHS[Number(m) - 1];
  const short = `${d}-${mon}`;
  return { short, long: `${short}-${y}`, spaced: `${d} ${mon} ${y}` };
}

const AUTO_NOTE =
  "Note: This is an auto-generated email from the Production Dashboard. Please do not reply to this email.";

const NA = "not available";

function pct(v) {
  return v == null ? NA : `${Number(v).toFixed(2)}%`;
}

// Daily Schedule Fulfillment % for the other sections in row 3. Not automated
// yet: entered in the send pop-up for each mail. These are only its defaults.
export const DEFAULT_MANUAL_FULFILMENT = { gt: 81.9, rc4: 70.06, mixing: 44.85 };

function manualFulfilment(m) {
  return `GT Building ${pct(m.gt)}, 4RC ${pct(m.rc4)}, Mixing ${pct(m.mixing)}`;
}

function qty(v) {
  return v == null ? NA : Math.round(Number(v)).toLocaleString("en-US");
}

function skus(v) {
  return v == null ? `${NA} SKUs` : `${v} SKUs`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** The 5 table rows: [kpi, definition, btp value]. */
function rows(v, short, manual) {
  return [
    [
      "MTD Underproduction %",
      `Cumulative shortfall against cumulative approved schedule over the approved schedule through ${short} C, SKU-by-SKU.`,
      `${pct(v.mtd_under_pct)} across ${skus(v.mtd_under_skus)}`,
    ],
    [
      "MTD Overproduction %",
      `Cumulative actual above cumulative approved schedule over the approved schedule through ${short} C, SKU-by-SKU.`,
      `${pct(v.mtd_over_pct)} across ${skus(v.mtd_over_skus)}`,
    ],
    [
      `Daily Schedule Fulfillment % (${short})`,
      `Actual credited against ${short} schedule at SKU/item/recipe level.`,
      `Curing ${pct(v.daily_fulfilment_pct)}, ${manualFulfilment(manual)}`,
    ],
    [
      `Daily Curing Overproduction (${short})`,
      `SKU-wise actual above ${short} Curing schedule.`,
      `${qty(v.daily_over_qty)} tyres across ${skus(v.daily_over_skus)}`,
    ],
    [
      `Daily Curing Underproduction (${short})`,
      `SKU-wise actual below ${short} Curing schedule.`,
      `${qty(v.daily_under_qty)} tyres across ${skus(v.daily_under_skus)}`,
    ],
  ];
}

/**
 * @param {Record<string, number|null>} values the 9 mail values
 * @param {string} reportDay ISO yyyy-mm-dd
 * @param {{gt: number, rc4: number, mixing: number}} [manual] row-3 GT Building / 4RC / Mixing %
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderSchedulerMail(values, reportDay, manual = DEFAULT_MANUAL_FULFILMENT) {
  const { short, long, spaced } = reportDayLabels(reportDay);
  const intro = `Please find below the Schedule vs Actual metrics through ${spaced}`;
  const subject = `JK BTP – Daily Infiniti Scheduler Metrics – ${long}`;
  const body = rows(values, short, manual);

  const cell = "border:1px solid #999;padding:6px 10px;vertical-align:top;";
  const head = `${cell}background:#f2f2f2;font-weight:bold;text-align:left;`;
  const tableRows = body
    .map(
      ([kpi, def, val], i) =>
        `<tr><td style="${cell}">${i + 1}</td><td style="${cell}">${escapeHtml(kpi)}</td>` +
        `<td style="${cell}">${escapeHtml(def)}</td><td style="${cell}font-weight:bold;">${escapeHtml(val)}</td></tr>`,
    )
    .join("");

  const html =
    `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#222;">` +
    `<p>Dear Sir,</p>` +
    `<p>${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse;font-size:13px;">` +
    `<colgroup><col style="width:32px"><col style="width:230px"><col style="width:420px"><col style="width:300px"></colgroup>` +
    `<thead><tr><th style="${head}">#</th><th style="${head}">KPI</th><th style="${head}">Definition</th><th style="${head}">BTP</th></tr></thead>` +
    `<tbody>${tableRows}</tbody></table>` +
    `<p>Thanks,<br>Algo8</p>` +
    `<p style="font-size:12px;color:#666;">${AUTO_NOTE}</p></div>`;

  const text = [
    "Dear Sir,",
    "",
    intro,
    "",
    ...body.map(([kpi, def, val], i) => `${i + 1}. ${kpi}: ${val}\n   ${def}`),
    "",
    "Thanks,",
    "Algo8",
    "",
    AUTO_NOTE,
  ].join("\n");

  return { subject, html, text };
}
