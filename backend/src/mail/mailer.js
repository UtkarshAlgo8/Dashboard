/** SMTP transport for outgoing report mail. Built lazily from config.mail.smtp. */
import nodemailer from "nodemailer";
import { config } from "../config.js";

let transport = null;

/** Names of the SMTP settings that are missing; empty when mail can be sent. */
export function missingSmtpSettings() {
  const { host, user, pass } = config.mail.smtp;
  return [
    !host && "SMTP_HOST",
    !user && "SMTP_USER",
    !pass && "SMTP_PASS",
    !config.mail.from && "MAIL_FROM",
  ].filter(Boolean);
}

function getTransport() {
  if (!transport) {
    const { host, port, secure, requireTLS, user, pass } = config.mail.smtp;
    transport = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS,
      auth: { user, pass },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transport;
}

/** @returns {Promise<{ messageId: string, accepted: string[], rejected: string[] }>} */
export async function sendMail({ to, cc, subject, html, text }) {
  const info = await getTransport().sendMail({
    from: config.mail.from,
    to,
    cc: cc?.length ? cc : undefined,
    subject,
    html,
    text,
  });
  return {
    messageId: info.messageId,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
  };
}
