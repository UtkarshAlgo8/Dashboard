import client from "./client.js";

/**
 * Scheduler Adherence mail (Daily Infiniti Scheduler metrics, JK BTP Curing).
 * Recipients are configured on the backend (MAIL_TO / MAIL_CC); the dashboard
 * only asks for confirmation.
 */

/** Report day, subject, recipients and data check. Default date: yesterday. */
export function fetchSchedulerMailPreview({ date } = {}) {
  return client.get("/mail/scheduler-adherence/preview", {
    params: { date: date || undefined },
  });
}

/** Send the mail for one report (plant) day, YYYY-MM-DD. */
export function sendSchedulerMail({ date }) {
  return client.post("/mail/scheduler-adherence/send", { date });
}
