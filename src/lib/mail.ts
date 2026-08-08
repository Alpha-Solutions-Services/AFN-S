import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import {
  SALES_CC,
  SALES_REPLY_TO,
  SALES_SENDER_NAME,
  buildSalesEmailHtml,
  ensureSalesSignature,
} from "@/lib/email-signature";
import { appendToGmailSent } from "@/lib/imap-replies";
import { isSyntheticEmail } from "@/lib/phone";

const DEFAULT_FROM = "sales.afn.alpha@gmail.com";

export function getSalesMailFrom(): string {
  return process.env.SALES_MAIL_FROM?.trim().toLowerCase() || DEFAULT_FROM;
}

export function getSalesMailFromName(): string {
  return process.env.SALES_MAIL_FROM_NAME?.trim() || SALES_SENDER_NAME;
}

export function getSalesReplyTo(): string {
  return (
    process.env.SALES_MAIL_REPLY_TO?.trim().toLowerCase() || SALES_REPLY_TO
  );
}

export function getSalesCc(): string {
  return process.env.SALES_MAIL_CC?.trim().toLowerCase() || SALES_CC;
}

/** Shared sales mailbox via Gmail SMTP + App Password (not per-user OAuth). */
export function isSalesMailConfigured(): boolean {
  const user = process.env.SALES_MAIL_USER?.trim() || getSalesMailFrom();
  const pass = process.env.SALES_MAIL_APP_PASSWORD?.trim();
  return Boolean(user && pass);
}

function getSmtpAuth() {
  const user =
    process.env.SALES_MAIL_USER?.trim().toLowerCase() || getSalesMailFrom();
  const pass = process.env.SALES_MAIL_APP_PASSWORD?.trim();
  if (!user || !pass) {
    throw new Error(
      "Sales mailbox not configured. Set SALES_MAIL_USER and SALES_MAIL_APP_PASSWORD (Gmail App Password)."
    );
  }
  return { user, pass };
}

export async function sendSalesEmail(opts: {
  to: string;
  subject: string;
  body: string;
  openTrackingUrl?: string;
  freightClickUrl?: string;
  unsubscribeUrl?: string;
  /** Team mailbox to send from (10 Forces). Falls back to legacy single mailbox. */
  mailbox?: { email: string; appPassword: string; name?: string };
}): Promise<{ messageId: string; mailbox: string }> {
  const to = opts.to.trim().toLowerCase();
  if (!to || isSyntheticEmail(to)) {
    throw new Error(
      "Recipient has no real email address (phone-only contact). Skip or add an email."
    );
  }

  const auth = opts.mailbox
    ? { user: opts.mailbox.email.trim().toLowerCase(), pass: opts.mailbox.appPassword }
    : getSmtpAuth();
  const from = opts.mailbox
    ? opts.mailbox.email.trim().toLowerCase()
    : getSalesMailFrom();
  const fromName = getSalesMailFromName();
  const replyTo = getSalesReplyTo();
  const cc = getSalesCc();
  const text = ensureSalesSignature(opts.body);
  const stopLine = opts.unsubscribeUrl
    ? `\n\nTo stop email from Alpha Freight Network: ${opts.unsubscribeUrl}`
    : "";
  const html = buildSalesEmailHtml(text, {
    openTrackingUrl: opts.openTrackingUrl,
    freightClickUrl: opts.freightClickUrl,
    unsubscribeUrl: opts.unsubscribeUrl,
  });

  const headers: Record<string, string> = {
    "X-Mailer": "Alpha Sales Point",
  };
  if (opts.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${opts.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const mailFields = {
    from: `"${fromName}" <${from}>`,
    replyTo,
    to,
    cc: cc && cc !== to ? cc : undefined,
    subject: opts.subject,
    text: text + stopLine,
    html,
    headers,
  };

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth,
  });

  const info = await transporter.sendMail(mailFields);
  const messageId = info.messageId || `smtp-${Date.now()}`;

  try {
    const raw = await new MailComposer({
      ...mailFields,
      messageId,
      date: new Date(),
    })
      .compile()
      .build();
    await appendToGmailSent(raw, auth);
  } catch {
    // Delivered via SMTP — don't fail the send if Sent-folder append fails
  }

  return { messageId, mailbox: from };
}

/**
 * Internal, non-tracked alert email sent from the hub mailbox
 * (sales.afn.alpha). Used for open/reply notifications to the team + hub.
 */
export async function sendInternalAlert(opts: {
  to: string[];
  subject: string;
  body: string;
}): Promise<void> {
  const auth = getSmtpAuth(); // hub credentials
  const from = getSalesMailFrom();
  const recipients = Array.from(
    new Set(opts.to.map((r) => r.trim().toLowerCase()).filter(Boolean))
  );
  if (recipients.length === 0) return;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth,
  });

  await transporter.sendMail({
    from: `"AFN Alerts" <${from}>`,
    to: recipients,
    subject: opts.subject,
    text: opts.body,
    headers: { "X-Mailer": "Alpha Sales Point" },
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
