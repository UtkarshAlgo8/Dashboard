/**
 * Scheduler Adherence mail (Daily Infiniti Scheduler metrics, JK BTP Curing).
 *
 *   GET  /mail/scheduler-adherence/preview?date=YYYY-MM-DD
 *   POST /mail/scheduler-adherence/send
 *        { date, manual: { gt, rc4, mixing }, mode: "official" | "custom", to, cc }
 *
 * "official" sends to MAIL_TO / MAIL_CC from env; the client's to/cc are
 * ignored. "custom" sends to the to/cc typed in the pop-up (for checking the
 * mail before the official send) and is logged as a test, so it never counts
 * as the day's official send.
 *
 * The mail ignores the dashboard's filters: always Banmore, Curing, All
 * Product Types, for the chosen report (plant) day. Send re-reads the values
 * instead of trusting the preview, so stale numbers are never mailed.
 */
import { config } from "../config.js";
import { getCuringMailValues, MAIL_FIELDS } from "../mail/curing-kpis.js";
import { renderSchedulerMail, DEFAULT_MANUAL_FULFILMENT } from "../mail/template.js";
import { sendMail, missingSmtpSettings } from "../mail/mailer.js";
import { logSend, lastSent } from "../mail/send-log.js";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_LABELS = {
  mtd_under_pct: "MTD Underproduction %",
  mtd_under_skus: "MTD Underproduction SKU count",
  mtd_over_pct: "MTD Overproduction %",
  mtd_over_skus: "MTD Overproduction SKU count",
  daily_fulfilment_pct: "Daily Schedule Fulfillment % (Curing)",
  daily_over_qty: "Daily Curing Overproduction (tyres)",
  daily_over_skus: "Daily Curing Overproduction SKU count",
  daily_under_qty: "Daily Curing Underproduction (tyres)",
  daily_under_skus: "Daily Curing Underproduction SKU count",
};

function fail(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, details } });
}

/** ISO date of an IST wall-clock instant, offset by `days`. */
function istIso(ms, days = 0) {
  const d = new Date(ms + IST_OFFSET_MS);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Yesterday's plant day — the default report date. */
function defaultReportDay() {
  // TEMPORARY (2026-10-15): report two days back (13-Oct) instead of
  // yesterday. Revert this commit to restore -1.
  const TEMP_REPORT_DAY_OFFSET = -2;
  return istIso(Date.now(), TEMP_REPORT_DAY_OFFSET);
}

/** A plant day (07:00 → 07:00 IST) is complete once 07:00 the next day passes. */
function isPlantDayClosed(reportDay) {
  const [y, m, d] = reportDay.split("-").map(Number);
  const closesAtUtc = Date.UTC(y, m - 1, d + 1, 7, 0) - IST_OFFSET_MS;
  return Date.now() >= closesAtUtc;
}

function parseReportDay(raw) {
  const day = raw == null || raw === "" ? defaultReportDay() : String(raw);
  if (!ISO_RE.test(day) || Number.isNaN(Date.parse(day))) return null;
  return day;
}

function parseList(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;\s]+/);
  return [...new Set(list.map((e) => String(e).trim()).filter(Boolean))];
}

/** Row-3 manual percentages, or an error message. */
function parseManual(raw) {
  const out = {};
  for (const [key, label] of [["gt", "GT Building"], ["rc4", "4RC"], ["mixing", "Mixing"]]) {
    const v = raw?.[key];
    const n = typeof v === "number" ? v : Number.parseFloat(v);
    if (v === "" || v == null || !Number.isFinite(n) || n < 0 || n > 100) {
      return { error: `${label} % must be a number from 0 to 100.` };
    }
    out[key] = n;
  }
  return { manual: out };
}

/** Problems with a recipient list; empty when it can be sent to. */
function recipientProblems(to, cc, { custom }) {
  const problems = [];
  if (!to.length) problems.push(custom ? "Add at least one To address." : "No recipients configured (MAIL_TO).");
  const all = [...to, ...cc];
  const bad = all.filter((e) => !EMAIL_RE.test(e));
  if (bad.length) problems.push(`Invalid email address: ${bad.join(", ")}.`);
  const domains = config.mail.customAllowedDomains;
  if (custom && domains.length) {
    const outside = all.filter((e) => EMAIL_RE.test(e) && !domains.includes(e.split("@")[1].toLowerCase()));
    if (outside.length) problems.push(`Not an allowed domain (${domains.join(", ")}): ${outside.join(", ")}.`);
  }
  return problems;
}

function canSend(user) {
  const roles = config.mail.sendRoles;
  return !roles.length || roles.includes(user?.role);
}

/**
 * Values + rendered mail + data check for one report day. Recipient checks
 * are separate — they depend on official vs custom.
 */
async function buildMail(reportDay, manual = DEFAULT_MANUAL_FULFILMENT) {
  const { values, sources, errors } = await getCuringMailValues(reportDay);
  const problems = [...errors];
  // TEMPORARY (2026-10-15): allow sending before the plant day closes, so the
  // 14-Oct mail can go out now. Revert this commit to restore the check.
  const TEMP_SKIP_PLANT_DAY_CHECK = true;
  if (!TEMP_SKIP_PLANT_DAY_CHECK && !isPlantDayClosed(reportDay)) {
    problems.push(`Plant day ${reportDay} is not complete yet (it closes at 07:00 the next day).`);
  }
  const missing = MAIL_FIELDS.filter((f) => values[f.key] == null).map((f) => FIELD_LABELS[f.key]);
  if (missing.length) problems.push(`Missing values: ${missing.join(", ")}.`);
  const smtp = missingSmtpSettings();
  if (smtp.length) problems.push(`Mail server not configured: ${smtp.join(", ")}.`);

  return {
    reportDate: reportDay,
    values,
    sources,
    // Values read from the temporary snapshot rather than gold.
    fromSnapshot: Object.values(sources).includes("snapshot"),
    dataCheck: { ok: problems.length === 0, problems },
    ...renderSchedulerMail(values, reportDay, manual),
  };
}

export async function getPreview(req, res, next) {
  try {
    if (!canSend(req.user)) return fail(res, 403, "FORBIDDEN", "You are not allowed to send this mail.");
    const reportDay = parseReportDay(req.query.date);
    if (!reportDay) return fail(res, 400, "VALIDATION_ERROR", "date must be YYYY-MM-DD.");

    const [mail, sentForDay] = await Promise.all([buildMail(reportDay), lastSent(reportDay)]);
    res.json({
      data: {
        ...mail,
        defaultDate: defaultReportDay(),
        manualDefaults: DEFAULT_MANUAL_FULFILMENT,
        official: {
          to: config.mail.to,
          cc: config.mail.cc,
          problems: recipientProblems(config.mail.to, config.mail.cc, { custom: false }),
        },
        customAllowedDomains: config.mail.customAllowedDomains,
        alreadySent: sentForDay,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function postSend(req, res, next) {
  try {
    if (!canSend(req.user)) return fail(res, 403, "FORBIDDEN", "You are not allowed to send this mail.");
    const body = req.body ?? {};
    const reportDay = parseReportDay(body.date);
    if (!reportDay) return fail(res, 400, "VALIDATION_ERROR", "date must be YYYY-MM-DD.");
    const { manual, error } = parseManual(body.manual);
    if (error) return fail(res, 400, "VALIDATION_ERROR", error);

    const custom = body.mode === "custom";
    const to = custom ? parseList(body.to) : config.mail.to;
    const cc = custom ? parseList(body.cc) : config.mail.cc;
    const badRecipients = recipientProblems(to, cc, { custom });
    if (badRecipients.length) {
      return fail(res, 400, "INVALID_RECIPIENTS", "The mail was not sent.", { problems: badRecipients });
    }

    const mail = await buildMail(reportDay, manual);
    if (!mail.dataCheck.ok) {
      return fail(res, 422, "DATA_CHECK_FAILED", "The mail was not sent.", { problems: mail.dataCheck.problems });
    }

    // Custom sends are checks before the official one: logged as tests so
    // they never show up as "already sent".
    const log = { reportDate: reportDay, isTest: custom, user: req.user, to, cc, values: { ...mail.values, manual } };
    let result;
    try {
      result = await sendMail({ to, cc, subject: mail.subject, html: mail.html, text: mail.text });
    } catch (err) {
      await logSend({ ...log, status: "failed", error: err.message });
      return fail(res, 502, "SEND_FAILED", `Mail server rejected the send: ${err.message}`);
    }

    await logSend({ ...log, status: "sent", messageId: result.messageId });
    res.json({
      data: {
        sent: true,
        mode: custom ? "custom" : "official",
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      },
    });
  } catch (err) {
    next(err);
  }
}
