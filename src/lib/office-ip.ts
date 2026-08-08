import type { SupabaseClient } from "@supabase/supabase-js";

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

function envOfficeIps(): string[] {
  return (process.env.OFFICE_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matches(ip: string, rule: string): boolean {
  if (!ip || !rule) return false;
  if (rule === ip) return true;
  // simple prefix rule, e.g. "203.0.113." matches 203.0.113.x
  if (rule.endsWith(".") && ip.startsWith(rule)) return true;
  return false;
}

/**
 * Is this IP allowed to sign in? Sources: OFFICE_IPS env + allowed_ips table.
 * Fail-OPEN when nothing is configured (so the app isn't locked before setup).
 */
export async function isIpAllowed(
  admin: SupabaseClient,
  ip: string | null
): Promise<{ allowed: boolean; configured: boolean }> {
  const envRules = envOfficeIps();

  let dbRules: string[] = [];
  try {
    const { data } = await admin.from("allowed_ips").select("ip");
    dbRules = (data ?? []).map((r: { ip: string }) => r.ip);
  } catch {
    dbRules = [];
  }

  const rules = [...envRules, ...dbRules];
  if (rules.length === 0) return { allowed: true, configured: false };
  if (!ip) return { allowed: false, configured: true };

  const allowed = rules.some((r) => matches(ip, r));
  return { allowed, configured: true };
}
