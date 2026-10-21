import client from "./client.js";

/**
 * Scheduler Adherence mail (Daily Infiniti Scheduler metrics, JK BTP Curing).
 * Official recipients are configured on the backend (MAIL_TO / MAIL_CC);
 * custom recipients are typed in the pop-up.
 */

/** Values, subject, data check and official recipients for one report day. */
export function fetchSchedulerMailPreview({ date } = {}) {
  return client.get("/mail/scheduler-adherence/preview", {
    params: { date: date || undefined },
  });
}

/**
 * @param {object} body
 * @param {string} body.date report (plant) day, YYYY-MM-DD
 * @param {{gt: number, rc4: number, mixing: number}} body.manual row-3 GT Building / 4RC / Mixing %
 * @param {"official"|"custom"} body.mode
 * @param {string[]} [body.to] custom only
 * @param {string[]} [body.cc] custom only
 */
export function sendSchedulerMail(body) {
  return client.post("/mail/scheduler-adherence/send", body);
}
