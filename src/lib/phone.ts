/** Normalize US (and +1) numbers for tel: click-to-call. */
export function digitsOnly(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function normalizeUsPhone(raw: string | null | undefined): {
  digits: string;
  e164: string;
  display: string;
  telHref: string;
} | null {
  if (!raw?.trim()) return null;
  let digits = digitsOnly(raw);
  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return {
      digits,
      e164: `+1${digits}`,
      display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
      telHref: `tel:+1${digits}`,
    };
  }

  // Fallback: enough digits to dial as-is
  if (digits.length >= 10) {
    const e164 = digits.startsWith("1") ? `+${digits}` : `+${digits}`;
    return {
      digits,
      e164,
      display: raw.trim(),
      telHref: `tel:${e164}`,
    };
  }

  return null;
}

/** Stable placeholder so phone-only rows still upsert on (owner_id, email). */
export function syntheticEmailFromPhone(phone: string): string {
  const digits = digitsOnly(phone);
  return `phone.${digits || "unknown"}@noemail.local`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.toLowerCase().endsWith("@noemail.local");
}
