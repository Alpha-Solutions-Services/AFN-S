/** Gmail-suite style identity for Alpha Freight Network outreach. */

export const SALES_SENDER_NAME = "Muhammad Mikran";
export const SALES_REPLY_TO = "mikran.dispatch@gmail.com";
export const SALES_WEBSITE = "https://alphasolutions.software";

/** Plain-text signature appended to drafts and sends. */
export const SALES_EMAIL_SIGNATURE = [
  "",
  "—",
  "Muhammad Mikran",
  "Dispatch Manager | Freight Operations BDE",
  "mikran.dispatch@gmail.com",
  "Dispatch phone: (859) 363-5897",
  "Company phone: (801) 382-8126",
  "WA",
  "",
  "Also: Website Developer · AI Automation Expert · Business Development Expert",
  "Owner · Alpha Solutions",
  "Dispatching with precision · Building with purpose · alphasolutions.software",
].join("\n");

/** HTML block styled like a Gmail professional signature. */
export const SALES_EMAIL_SIGNATURE_HTML = `
<div style="margin-top:16px;padding-top:12px;border-top:1px solid #dadce0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#202124;">
  <div style="font-size:15px;font-weight:700;color:#1a73e8;">Muhammad Mikran</div>
  <div style="color:#5f6368;">Dispatch Manager | Freight Operations BDE</div>
  <div style="margin-top:8px;">
    <a href="mailto:mikran.dispatch@gmail.com" style="color:#1a73e8;text-decoration:none;">mikran.dispatch@gmail.com</a>
  </div>
  <div style="color:#3c4043;">Dispatch phone: (859) 363-5897</div>
  <div style="color:#3c4043;">Company phone: (801) 382-8126</div>
  <div style="color:#5f6368;">WA</div>
  <div style="margin-top:10px;color:#5f6368;font-size:12px;">
    Also: Website Developer · AI Automation Expert · Business Development Expert
  </div>
  <div style="margin-top:4px;font-weight:600;color:#202124;">Owner · Alpha Solutions</div>
  <div style="margin-top:4px;color:#5f6368;font-size:12px;font-style:italic;">
    Dispatching with precision · Building with purpose ·
    <a href="https://alphasolutions.software" style="color:#1a73e8;text-decoration:none;">alphasolutions.software</a>
  </div>
</div>
`.trim();

export function ensureSalesSignature(body: string): string {
  const trimmed = body.trimEnd();
  if (trimmed.includes("Muhammad Mikran") && trimmed.includes("alphasolutions.software")) {
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

/** Split plain body from our signature marker for HTML rendering. */
export function bodyWithoutSignature(body: string): string {
  const marker = "\n—\nMuhammad Mikran";
  const idx = body.indexOf(marker);
  if (idx >= 0) return body.slice(0, idx).trimEnd();
  const alt = "\n-\nMuhammad Mikran";
  const idx2 = body.indexOf(alt);
  if (idx2 >= 0) return body.slice(0, idx2).trimEnd();
  return body.trimEnd();
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
    ${SALES_EMAIL_SIGNATURE_HTML}
  </div>
</body>
</html>`;
}
