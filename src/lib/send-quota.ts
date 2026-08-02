import type { SupabaseClient } from "@supabase/supabase-js";

/** Warm-up schedule: day index 0 = first day of sending. */
const WARMUP_CAPS = [
  10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 120, 150,
];

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetweenUtc(startIsoDate: string, now = new Date()): number {
  const start = new Date(`${startIsoDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return 0;
  const ms = startOfUtcDay(now).getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** Effective daily send limit (warm-up or hard DAILY_SEND_CAP). */
export function getDailySendCap(now = new Date()): number {
  const hard = Number(process.env.DAILY_SEND_CAP ?? "");
  if (Number.isFinite(hard) && hard > 0) return Math.floor(hard);

  const warmupStart = process.env.SEND_WARMUP_START?.trim(); // YYYY-MM-DD
  if (warmupStart) {
    const day = daysBetweenUtc(warmupStart, now);
    return WARMUP_CAPS[Math.min(day, WARMUP_CAPS.length - 1)];
  }

  // Safer default until warm-up start is configured
  return 20;
}

export function getWarmupDayIndex(now = new Date()): number | null {
  const warmupStart = process.env.SEND_WARMUP_START?.trim();
  if (!warmupStart) return null;
  return daysBetweenUtc(warmupStart, now) + 1; // 1-based for display
}

export function utcDayBounds(now = new Date()): { startIso: string; endIso: string } {
  const start = startOfUtcDay(now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export type SendQuota = {
  cap: number;
  sentToday: number;
  remaining: number;
  warmupDay: number | null;
};

export async function getSendQuota(
  supabase: SupabaseClient,
  ownerId: string
): Promise<SendQuota> {
  const cap = getDailySendCap();
  const { startIso, endIso } = utcDayBounds();

  const { count, error } = await supabase
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("success", true)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) {
    throw new Error(error.message);
  }

  const sentToday = count ?? 0;
  return {
    cap,
    sentToday,
    remaining: Math.max(0, cap - sentToday),
    warmupDay: getWarmupDayIndex(),
  };
}
