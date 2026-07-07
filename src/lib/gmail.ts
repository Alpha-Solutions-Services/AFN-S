import type { EmailDraft } from "@/lib/types";

interface RefreshTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }
  return { clientId, clientSecret };
}

export async function getGmailAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getGoogleCredentials();

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as RefreshTokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Failed to refresh Gmail access token");
  }
  return data.access_token;
}

function toBase64Url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawMessage(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    opts.body,
  ];
  return toBase64Url(lines.join("\r\n"));
}

export async function sendGmailMessage(opts: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}): Promise<{ messageId: string }> {
  const raw = buildRawMessage(opts);

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || "Gmail API send failed");
  }
  return { messageId: data.id };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { EmailDraft };
