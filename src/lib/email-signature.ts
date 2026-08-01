/**
 * Official Alpha Freight Network outreach contacts & email layout.
 * Google Voice is the primary number carriers should call/text.
 */
export const GOOGLE_VOICE_NUMBER = "8593635897";
export const GOOGLE_VOICE_DISPLAY = "(859) 363-5897";
export const SALES_SENDER_NAME = "Muhammad Mikran";
export const SALES_REPLY_TO = "mikran.dispatch@gmail.com";
export const SALES_CC = "kevin.afn.dispatch@gmail.com";
export const SALES_FREIGHT_URL = "https://www.alphasolutions.software/freight";
export const SALES_WEBSITE_HOST = "alphasolutions.software";

/** Full pitch facts — drafts must stay inside this product truth. */
export const ALPHA_FREIGHT_PITCH = {
  brand: "Alpha Freight Network (Alpha Solutions)",
  tagline: "The back-office for your trucking operation",
  summary:
    "Professional dispatching, rate negotiation, and carrier support for US owner-operators and fleets.",
  fee: "Dispatch fee: 8% of gross per load (standard) or 6% for long-term contracts.",
  equipment:
    "Equipment: dry van, reefer, flatbed, and step deck across the 48 continental US states.",
  services:
    "Services: load coverage, rate negotiation, DAT management, FMCSA compliance support, driver hunting, and MC lease-on programs when needed.",
  howItWorks:
    "How it works: align on lanes → we negotiate rates → you haul → we help loads close and get paid cleanly.",
  website: SALES_FREIGHT_URL,
} as const;

export const SALES_PITCH_BLOCK = [
  "",
  "— What we offer —",
  ALPHA_FREIGHT_PITCH.brand,
  ALPHA_FREIGHT_PITCH.summary,
  ALPHA_FREIGHT_PITCH.fee,
  ALPHA_FREIGHT_PITCH.equipment,
  ALPHA_FREIGHT_PITCH.services,
  ALPHA_FREIGHT_PITCH.howItWorks,
  `Details: ${SALES_FREIGHT_URL}`,
].join("\n");

export const SALES_CTA_BLOCK = [
  "",
  "Ready to talk?",
  `Call or text our Google Voice: ${GOOGLE_VOICE_DISPLAY}`,
  `Or reply to this email — ${SALES_REPLY_TO}`,
].join("\n");

export const SALES_EMAIL_SIGNATURE = [
  "",
  "—",
  "Muhammad Mikran",
  "Dispatch Manager | Freight Operations BDE",
  SALES_REPLY_TO,
  `Google Voice (call/text): ${GOOGLE_VOICE_DISPLAY}`,
  "",
  "Also: Website Developer · AI Automation Expert · Business Development Expert",
  "Owner · Alpha Solutions",
  `Dispatching with precision · Building with purpose · ${SALES_FREIGHT_URL}`,
].join("\n");

const OFFICIAL_DIGIT_SET = new Set([GOOGLE_VOICE_NUMBER]);

export function scrubInventedPhoneNumbers(text: string): string {
  return text
    .replace(
      /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g,
      (match) => {
        const digits = match.replace(/\D/g, "").replace(/^1(?=\d{10})/, "");
        if (OFFICIAL_DIGIT_SET.has(digits)) return match;
        return "";
      }
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/**
 * Finalize outbound body:
 * AI opener → full pitch block → Google Voice CTA → Mikran signature
 */
export function ensureSalesSignature(body: string): string {
  let trimmed = scrubInventedPhoneNumbers(body.trimEnd());
  trimmed = trimmed
    .replace(/\n?(Give us a quick call|call us|Call us)[^\n]*$/i, "")
    .trimEnd();

  // Strip prior auto blocks so regenerate/send doesn't duplicate
  trimmed = bodyWithoutSignature(trimmed);

  const parts = [trimmed];
  if (!trimmed.includes("What we offer")) {
    parts.push(SALES_PITCH_BLOCK);
  }
  parts.push(SALES_CTA_BLOCK);
  parts.push(SALES_EMAIL_SIGNATURE);
  return parts.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bodyWithoutSignature(body: string): string {
  let cut = body;
  const markers = [
    "\n— What we offer —",
    "\n- What we offer -",
    "\nReady to talk?",
    "\n—\nMuhammad Mikran",
    "\n-\nMuhammad Mikran",
  ];
  for (const marker of markers) {
    const idx = cut.indexOf(marker);
    if (idx >= 0) cut = cut.slice(0, idx);
  }
  return cut.trimEnd();
}

export function buildSalesEmailHtml(
  plainBodyWithSignature: string,
  opts?: { openTrackingUrl?: string }
): string {
  const opener = bodyWithoutSignature(plainBodyWithSignature);
  const openerHtml = opener
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#202124;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

  const trackingPixel = opts?.openTrackingUrl
    ? `<img src="${escapeHtml(opts.openTrackingUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8f9fa;">
  <div style="max-width:620px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:8px;padding:28px 24px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#5f6368;margin-bottom:16px;">
        Alpha Freight Network
      </div>

      ${openerHtml}

      <div style="margin:22px 0;padding:16px 18px;background:#f1f3f4;border-radius:8px;border-left:4px solid #1a73e8;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#174ea6;margin-bottom:10px;">
          What we offer
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#3c4043;">
          <p style="margin:0 0 8px 0;"><strong>${escapeHtml(ALPHA_FREIGHT_PITCH.brand)}</strong> — ${escapeHtml(ALPHA_FREIGHT_PITCH.tagline)}</p>
          <p style="margin:0 0 8px 0;">${escapeHtml(ALPHA_FREIGHT_PITCH.summary)}</p>
          <p style="margin:0 0 8px 0;">${escapeHtml(ALPHA_FREIGHT_PITCH.fee)}</p>
          <p style="margin:0 0 8px 0;">${escapeHtml(ALPHA_FREIGHT_PITCH.equipment)}</p>
          <p style="margin:0 0 8px 0;">${escapeHtml(ALPHA_FREIGHT_PITCH.services)}</p>
          <p style="margin:0 0 8px 0;">${escapeHtml(ALPHA_FREIGHT_PITCH.howItWorks)}</p>
          <p style="margin:0;">
            <a href="${SALES_FREIGHT_URL}" style="color:#1a73e8;text-decoration:none;font-weight:600;">View Alpha Freight →</a>
          </p>
        </div>
      </div>

      <div style="margin:20px 0;padding:16px 18px;background:#e8f0fe;border-radius:8px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#174ea6;margin-bottom:8px;">
          Ready to talk?
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#202124;">
          Call or text our Google Voice:
          <a href="tel:+1${GOOGLE_VOICE_NUMBER}" style="color:#1a73e8;text-decoration:none;font-weight:700;">${GOOGLE_VOICE_DISPLAY}</a>
          <br />
          Or reply to this email —
          <a href="mailto:${SALES_REPLY_TO}" style="color:#1a73e8;text-decoration:none;">${SALES_REPLY_TO}</a>
        </div>
      </div>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #dadce0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#202124;">
        <div style="font-size:15px;font-weight:700;color:#1a73e8;">Muhammad Mikran</div>
        <div style="color:#5f6368;">Dispatch Manager | Freight Operations BDE</div>
        <div style="margin-top:8px;">
          <a href="mailto:${SALES_REPLY_TO}" style="color:#1a73e8;text-decoration:none;">${SALES_REPLY_TO}</a>
        </div>
        <div style="color:#3c4043;margin-top:2px;">
          Google Voice (call/text):
          <a href="tel:+1${GOOGLE_VOICE_NUMBER}" style="color:#1a73e8;text-decoration:none;">${GOOGLE_VOICE_DISPLAY}</a>
        </div>
        <div style="margin-top:12px;color:#5f6368;font-size:12px;">
          Also: Website Developer · AI Automation Expert · Business Development Expert
        </div>
        <div style="margin-top:4px;font-weight:600;color:#202124;">Owner · Alpha Solutions</div>
        <div style="margin-top:4px;color:#5f6368;font-size:12px;font-style:italic;">
          Dispatching with precision · Building with purpose ·
          <a href="${SALES_FREIGHT_URL}" style="color:#1a73e8;text-decoration:none;">alphasolutions.software/freight</a>
        </div>
      </div>
      ${trackingPixel}
    </div>
  </div>
</body>
</html>`;
}
