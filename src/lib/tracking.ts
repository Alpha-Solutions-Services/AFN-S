import { getSiteUrl } from "@/lib/site-url";
import { SALES_FREIGHT_URL } from "@/lib/email-signature";

/** 1×1 transparent GIF */
export const TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export function buildOpenTrackingUrl(token: string): string {
  const base = getSiteUrl();
  return `${base}/api/track/open/${encodeURIComponent(token)}`;
}

export function buildClickTrackingUrl(token: string, destination?: string): string {
  const base = getSiteUrl();
  const dest = destination || SALES_FREIGHT_URL;
  const q = new URLSearchParams({ to: dest });
  return `${base}/api/track/click/${encodeURIComponent(token)}?${q.toString()}`;
}

/** Only allow redirects to our own marketing/freight URLs. */
export function isAllowedClickDestination(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "alphasolutions.software" ||
      host === "www.alphasolutions.software" ||
      host.endsWith(".alphasolutions.software")
    );
  } catch {
    return false;
  }
}

/**
 * Google Voice web dialer deep link.
 * Use NEXT_PUBLIC_GOOGLE_VOICE_ACCOUNT=0|1|2 for which Google account
 * in Chrome is logged into Voice (check voice.google.com/u/N/...).
 */
export function googleVoiceCallUrl(phoneRaw: string): string {
  const digits = phoneRaw.replace(/\D/g, "");
  let e164 = digits;
  if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) e164 = `+${digits}`;
  else if (!digits.startsWith("+")) e164 = `+${digits}`;

  const account = process.env.NEXT_PUBLIC_GOOGLE_VOICE_ACCOUNT?.trim() || "0";
  return `https://voice.google.com/u/${account}/calls?a=nc,${encodeURIComponent(e164)}`;
}
