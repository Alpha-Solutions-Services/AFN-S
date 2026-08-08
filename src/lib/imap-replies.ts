import { ImapFlow } from "imapflow";

function getImapAuth() {
  const user =
    process.env.SALES_MAIL_USER?.trim().toLowerCase() ||
    process.env.SALES_MAIL_FROM?.trim().toLowerCase() ||
    "sales.afn.alpha@gmail.com";
  const pass = process.env.SALES_MAIL_APP_PASSWORD?.trim();
  if (!user || !pass) {
    throw new Error(
      "IMAP not configured. Set SALES_MAIL_USER and SALES_MAIL_APP_PASSWORD."
    );
  }
  return { user, pass };
}

export type InboxReplyHit = {
  fromEmail: string;
  subject: string;
  messageId: string | null;
  date: string | null;
};

export type BounceHit = {
  recipientEmail: string;
  subject: string;
  date: string | null;
  snippet: string;
};

/**
 * Scan Gmail inbox (via App Password IMAP) for recent inbound messages.
 */
export async function fetchRecentInboxReplies(opts?: {
  sinceDays?: number;
  maxMessages?: number;
}): Promise<InboxReplyHit[]> {
  const sinceDays = opts?.sinceDays ?? 14;
  const maxMessages = opts?.maxMessages ?? 200;
  const auth = getImapAuth();

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth,
    logger: false,
  });

  const hits: InboxReplyHit[] = [];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - sinceDays);

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since }, { uid: true });
      const recent = (uids || []).slice(-maxMessages);

      for await (const msg of client.fetch(recent, {
        uid: true,
        envelope: true,
      })) {
        const from = msg.envelope?.from?.[0];
        const fromEmail = from?.address?.trim().toLowerCase();
        if (!fromEmail) continue;

        if (
          fromEmail === auth.user ||
          fromEmail === "sales.afn.alpha@gmail.com" ||
          fromEmail === "mikran.dispatch@gmail.com" ||
          fromEmail === "kevin.afn.dispatch@gmail.com" ||
          fromEmail.includes("mailer-daemon") ||
          fromEmail.includes("postmaster")
        ) {
          continue;
        }

        hits.push({
          fromEmail,
          subject: msg.envelope?.subject ?? "",
          messageId: msg.envelope?.messageId ?? null,
          date: msg.envelope?.date
            ? new Date(msg.envelope.date).toISOString()
            : null,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return hits;
}

function extractBounceRecipient(text: string): string | null {
  const patterns = [
    /(?:Final-Recipient|Original-Recipient):\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/i,
    /Your message to\s+\*?([^\s*<>]+@[^\s*<>]+)\*?/i,
    /(?:was not delivered to|couldn't be delivered to|failed permanently:)\s*<?([^\s<>]+@[^\s<>]+)>?/i,
    /Delivery to the following recipient(?:s)? failed[^:]*:\s*([^\s<>]+@[^\s<>]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().toLowerCase().replace(/[*>]+$/g, "");
  }
  const emails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  const skip = new Set([
    "mailer-daemon@googlemail.com",
    "mailer-daemon@gmail.com",
    "postmaster@gmail.com",
    "sales.afn.alpha@gmail.com",
    "mikran.dispatch@gmail.com",
    "kevin.afn.dispatch@gmail.com",
  ]);
  for (const e of emails) {
    const lower = e.toLowerCase();
    if (!skip.has(lower) && !lower.includes("mailer-daemon")) return lower;
  }
  return null;
}

/** Pull Gmail bounce / "Message blocked" notices and extract recipient emails. */
export async function fetchRecentBounces(opts?: {
  sinceDays?: number;
  maxMessages?: number;
}): Promise<BounceHit[]> {
  const sinceDays = opts?.sinceDays ?? 14;
  const maxMessages = opts?.maxMessages ?? 150;
  const auth = getImapAuth();

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth,
    logger: false,
  });

  const hits: BounceHit[] = [];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - sinceDays);

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since }, { uid: true });
      const recent = (uids || []).slice(-maxMessages);

      for await (const msg of client.fetch(recent, {
        uid: true,
        envelope: true,
        source: { start: 0, maxLength: 12000 },
      })) {
        const from = msg.envelope?.from?.[0];
        const fromEmail = from?.address?.trim().toLowerCase() ?? "";
        const subject = msg.envelope?.subject ?? "";
        const isBounce =
          fromEmail.includes("mailer-daemon") ||
          fromEmail.includes("postmaster") ||
          /message blocked|undeliverable|delivery status notification|mail delivery subsystem/i.test(
            subject
          );
        if (!isBounce) continue;

        const sourceText =
          typeof msg.source === "string"
            ? msg.source
            : Buffer.isBuffer(msg.source)
              ? msg.source.toString("utf8")
              : "";
        const recipient = extractBounceRecipient(`${subject}\n${sourceText}`);
        if (!recipient) continue;

        hits.push({
          recipientEmail: recipient,
          subject,
          date: msg.envelope?.date
            ? new Date(msg.envelope.date).toISOString()
            : null,
          snippet: sourceText.slice(0, 280),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return hits;
}

/**
 * Gmail SMTP often does not place a copy in Sent for app-password SMTP.
 */
export async function appendToGmailSent(
  rawRfc822: Buffer,
  auth?: { user: string; pass: string }
): Promise<void> {
  const resolved = auth ?? getImapAuth();
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: resolved,
    logger: false,
  });

  await client.connect();
  try {
    let mailbox = "[Gmail]/Sent Mail";
    try {
      await client.mailboxOpen(mailbox, { readOnly: true });
      await client.mailboxClose().catch(() => undefined);
    } catch {
      mailbox = "Sent";
    }

    await client.append(mailbox, rawRfc822, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => undefined);
  }
}
