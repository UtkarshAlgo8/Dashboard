-- Send log for the Scheduler Adherence (Daily Infiniti Scheduler) mail.
-- backend/src/mail/send-log.js also creates this table on first use.
--
-- Run once against the auth DB (default name: `authdb`).
--   mysql -u root -p authdb < 2026-10-14-mail-send-log.sql

CREATE TABLE IF NOT EXISTS MailSendLog (
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
);
