import { isSyntheticEmail } from "@/lib/phone";

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Common disposable / throwaway domains — skip before burn reputation. */
const BLOCKED_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.org",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwaway.email",
  "yopmail.com",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "example.com",
  "example.org",
  "test.com",
  "noemail.local",
]);

export type EmailValidation = {
  ok: boolean;
  email: string;
  reason?: string;
};

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateOutboundEmail(raw: string | null | undefined): EmailValidation {
  const email = normalizeEmail(raw ?? "");
  if (!email) {
    return { ok: false, email, reason: "Missing email" };
  }
  if (isSyntheticEmail(email)) {
    return { ok: false, email, reason: "Phone-only contact (no real email)" };
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, email, reason: "Invalid email format" };
  }
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain || BLOCKED_DOMAINS.has(domain)) {
    return { ok: false, email, reason: `Blocked / disposable domain: ${domain || "?"}` };
  }
  if (domain.includes("..") || domain.startsWith("-") || domain.endsWith("-")) {
    return { ok: false, email, reason: "Invalid domain" };
  }
  return { ok: true, email };
}

/** Optional MX lookup — fail closed only when DNS answers with no MX/A. */
export async function validateOutboundEmailWithMx(
  raw: string | null | undefined
): Promise<EmailValidation> {
  const basic = validateOutboundEmail(raw);
  if (!basic.ok) return basic;

  const domain = basic.email.split("@")[1];
  try {
    const dns = await import("dns/promises");
    try {
      const mx = await dns.resolveMx(domain);
      if (mx?.length) return basic;
    } catch {
      // try A/AAAA as some domains use implicit MX
    }
    try {
      const a = await dns.resolve4(domain);
      if (a?.length) return basic;
    } catch {
      // continue
    }
    try {
      const aaaa = await dns.resolve6(domain);
      if (aaaa?.length) return basic;
    } catch {
      // continue
    }
    return {
      ok: false,
      email: basic.email,
      reason: `No mail records (MX/A) for ${domain}`,
    };
  } catch {
    // DNS module unavailable — keep format-only pass
    return basic;
  }
}
