/**
 * Send log for the Scheduler Adherence mail: every send and test send, with
 * the user, recipients and the 9 values. Lives in the auth MySQL DB — see
 * migrations/2026-10-14-mail-send-log.sql. The table is also created on first
 * use, so a deploy without the migration still logs.
 */
import { Sequelize } from "sequelize";
import { authsequelize } from "../db/index.js";

const REPORT = "scheduler-adherence";

let ready = null;

function ensureTable() {
  if (!ready) {
    ready = authsequelize
      .query(
        `CREATE TABLE IF NOT EXISTS MailSendLog (
           id INT AUTO_INCREMENT PRIMARY KEY,
           report VARCHAR(64) NOT NULL,
           reportDate DATE NOT NULL,
           isTest TINYINT(1) NOT NULL DEFAULT 0,
           status VARCHAR(16) NOT NULL,
           userId INT NULL,
           userEmail VARCHAR(255) NULL,
           userName VARCHAR(255) NULL,
           recipientsTo TEXT NULL,
           recipientsCc TEXT NULL,
           kpiValues JSON NULL,
           messageId VARCHAR(255) NULL,
           error TEXT NULL,
           createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
           INDEX idx_mail_report_date (report, reportDate)
         )`,
      )
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

function userName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || null;
}

/** Best effort: a logging failure must not turn a delivered mail into an error. */
export async function logSend({ reportDate, isTest, status, user, to, cc, values, messageId, error }) {
  try {
    await ensureTable();
    await authsequelize.query(
      `INSERT INTO MailSendLog
         (report, reportDate, isTest, status, userId, userEmail, userName,
          recipientsTo, recipientsCc, kpiValues, messageId, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          REPORT,
          reportDate,
          isTest ? 1 : 0,
          status,
          user?.userId ?? null,
          user?.email ?? null,
          userName(user),
          to.join(", "),
          cc.join(", "),
          JSON.stringify(values),
          messageId ?? null,
          error ?? null,
        ],
      },
    );
  } catch (err) {
    console.error("[mail] send log write failed:", err.message);
  }
}

/** Latest successful real send — overall, or for one report date. */
export async function lastSent(reportDate = null) {
  try {
    await ensureTable();
    const rows = await authsequelize.query(
      `SELECT DATE_FORMAT(reportDate, '%Y-%m-%d') AS reportDate, userName, userEmail, createdAt
         FROM MailSendLog
        WHERE report = ? AND isTest = 0 AND status = 'sent'
              ${reportDate ? "AND reportDate = ?" : ""}
        ORDER BY createdAt DESC LIMIT 1`,
      {
        replacements: reportDate ? [REPORT, reportDate] : [REPORT],
        type: Sequelize.QueryTypes.SELECT,
      },
    );
    const r = rows[0];
    if (!r) return null;
    return {
      reportDate: r.reportDate,
      by: r.userName ?? r.userEmail,
      at: new Date(r.createdAt).toISOString(),
    };
  } catch (err) {
    console.error("[mail] send log read failed:", err.message);
    return null;
  }
}
