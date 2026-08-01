/**
 * Official Alpha Freight Network outreach contacts.
 * Google Voice is the primary number carriers should call/text.
 */
export const GOOGLE_VOICE_NUMBER = "8593635897";
export const GOOGLE_VOICE_DISPLAY = "(859) 363-5897";
export const COMPANY_PHONE_DISPLAY = "(801) 382-8126";
export const SALES_SENDER_NAME = "Muhammad Mikran";
export const SALES_REPLY_TO = "mikran.dispatch@gmail.com";
export const SALES_WEBSITE = "https://alphasolutions.software";
export const SALES_WEBSITE_HOST = "alphasolutions.software";

/** Fixed CTA line — always used; AI must not invent other numbers. */
export const SALES_CTA_BLOCK = [
  "",
  `Ready to talk? Call or text our Google Voice: ${GOOGLE_VOICE_DISPLAY}`,
  `Or reply to this email — ${SALES_REPLY_TO}`,
].join("\n");

export const SALES_CTA_HTML = `
<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#202124;">
  <strong>Ready to talk?</strong>
  Call or text our Google Voice:
  <a href="tel:+1${GOOGLE_VOICE_NUMBER}" style="color:#1a73e8;text-decoration:none;font-weight:600;">${GOOGLE_VOICE_DISPLAY}</a>
  <br />
  Or reply to this email —
  <a href="mailto:${SALES_REPLY_TO}" style="color:#1a73e8;text-decoration:none;">${SALES_REPLY_TO}</a>
</p>
`.trim();

/** Plain-text signature appended after CTA. */
export const SALES_EMAIL_SIGNATURE = [
  "",
  "—",
  "Muhammad Mikran",
  "Dispatch Manager | Freight Operations BDE",
  SALES_REPLY_TO,
  `Google Voice (call/text): ${GOOGLE_VOICE_DISPLAY}`,
  `Company phone: ${COMPANY_PHONE_DISPLAY}`,
  "WA",
  "",
  "Also: Website Developer · AI Automation Expert · Business Development Expert",
  "Owner · Alpha Solutions",
  `Dispatching with precision · Building with purpose · ${SALES_WEBSITE_HOST}`,
].join("\n");

export const SALES_EMAIL_SIGNATURE_HTML = `
<div style="margin-top:16px;padding-top:12px;border-top:1px solid #dadce0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#202124;">
  <div style="font-size:15px;font-weight:700;color:#1a73e8;">Muhammad Mikran</div>
  <div style="color:#5f6368;">Dispatch Manager | Freight Operations BDE</div>
  <div style="margin-top:8px;">
    <a href="mailto:${SALES_REPLY_TO}" style="color:#1a73e8;text-decoration:none;">${SALES_REPLY_TO}</a>
  </div>
  <div style="color:#3c4043;">
    Google Voice (call/text):
    <a href="tel:+1${GOOGLE_VOICE_NUMBER}" style="color:#1a73e8;text-decoration:none;">${GOOGLE_VOICE_DISPLAY}</a>
  </div>
  <div style="color:#3c4043;">Company phone: ${COMPANY_PHONE_DISPLAY}</div>
  <div style="color:#5f6368;">WA</div>
  <div style="margin-top:10px;color:#5f6368;font-size:12px;">
    Also: Website Developer · AI Automation Expert · Business Development Expert
  </div>
  <div style="margin-top:4px;font-weight:600;color:#202124;">Owner · Alpha Solutions</div>
  <div style="margin-top:4px;color:#5f6368;font-size:12px;font-style:italic;">
    Dispatching with precision · Building with purpose ·
    <a href="${SALES_WEBSITE}" style="color:#1a73e8;text-decoration:none;">${SALES_WEBSITE_HOST}</a>
  </div>
</div>
`.trim();

const OFFICIAL_DIGIT_SET = new Set([
  GOOGLE_VOICE_NUMBER,
  "8013828126",
]);

/** Remove any phone numbers the AI invented that are not our official ones. */
export function scrubInventedPhoneNumbers(text: string): string {
  return text.replace(
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g,
    (match) => {
      const digits = match.replace(/\D/g, "").replace(/^1(?=\d{10})/, "");
      if (OFFICIAL_DIGIT_SET.has(digits)) return match;
      return "";
    }
  ).replace(/[ \t]{2,}/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

export function ensureSalesSignature(body: string): string {
  let trimmed = scrubInventedPhoneNumbers(body.trimEnd());
  // Drop trailing soft CTAs without our number so we don't double-ask
  trimmed = trimmed
    .replace(/\n?(Give us a quick call|call us|Call us)[^\n]*$/i, "")
    .trimEnd();

  if (!trimmed.includes(GOOGLE_VOICE_DISPLAY)) {
    trimmed = `${trimmed}\n${SALES_CTA_BLOCK}`;
  }
  if (
    trimmed.includes("Muhammad Mikran") &&
    trimmed.includes(SALES_WEBSITE_HOST)
  ) {
    return trimmed;
  }
  return `${trimmed}\n${SALES_EMAIL_SIGNATURE}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function bodyWithoutSignature(body: string): string {
  const markers = [
    "\n—\nMuhammad Mikran",
    "\n-\nMuhammad Mikran",
    `\n${SALES_CTA_BLOCK.trim()}`,
  ];
  let cut = body;
  for (const marker of markers) {
    const idx = cut.indexOf(marker);
    if (idx >= 0) cut = cut.slice(0, idx);
  }
  // Also cut at CTA line if present
  const ctaIdx = cut.indexOf("Ready to talk? Call or text our Google Voice:");
  if (ctaIdx >= 0) cut = cut.slice(0, ctaIdx);
  return cut.trimEnd();
}

export function buildSalesEmailHtml(plainBodyWithSignature: string): string {
  const main = bodyWithoutSignature(plainBodyWithSignature);
  const paragraphs = main
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#202124;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:600px;padding:8px 0;">
    ${paragraphs}
    ${SALES_CTA_HTML}
    ${SALES_EMAIL_SIGNATURE_HTML}
  </div>
</body>
</html>`;
}
