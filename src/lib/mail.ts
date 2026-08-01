import nodemailer from "nodemailer";
import {
  SALES_CC,
  SALES_REPLY_TO,
  SALES_SENDER_NAME,
  buildSalesEmailHtml,
  ensureSalesSignature,
} from "@/lib/email-signature";
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
}): Promise<{ messageId: string }> {
  const to = opts.to.trim().toLowerCase();
  if (!to || isSyntheticEmail(to)) {
    throw new Error(
      "Recipient has no real email address (phone-only contact). Skip or add an email."
    );
  }

  const auth = getSmtpAuth();
  const from = getSalesMailFrom();
  const fromName = getSalesMailFromName();
  const replyTo = getSalesReplyTo();
  const cc = getSalesCc();
  const text = ensureSalesSignature(opts.body);
  const html = buildSalesEmailHtml(text);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth,
  });

  const info = await transporter.sendMail({
    from: `"${fromName}" <${from}>`,
    replyTo,
    to,
    cc: cc && cc !== to ? cc : undefined,
    subject: opts.subject,
    text,
    html,
    headers: {
      "X-Mailer": "Alpha Sales Point",
    },
  });

  return { messageId: info.messageId || `smtp-${Date.now()}` };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
