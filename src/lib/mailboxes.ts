import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailySendCap, utcDayBounds } from "@/lib/send-quota";

/**
 * AFN "10 Forces" sending mailboxes. Each team sends its OWN automated email.
 * The hub (sales.afn.alpha) never auto-sends — it is CC'd on every email and
 * receives open/reply/bounce alerts.
 *
 * App passwords are per-mailbox Gmail App Passwords set in env:
 *   SALES_MAIL_PATRIOT_APP_PASSWORD, SALES_MAIL_LIBERTY_APP_PASSWORD, ...
 */

export const HUB_EMAIL = "sales.afn.alpha@gmail.com";

export type TeamKey =
  | "patriot"
  | "liberty"
  | "ranger"
  | "eagle"
  | "hawk"
  | "titan"
  | "frontier"
  | "sentinel"
  | "valor"
  | "vanguard";

export type TeamDef = {
  key: TeamKey;
  name: string;
  emoji: string;
  quality: string;
  email: string;
  appPasswordEnv: string;
};

export const SALES_TEAMS: TeamDef[] = [
  {
    key: "patriot",
    name: "Patriot",
    emoji: "🇺🇸",
    quality: "American pride, loyalty, and commitment to the customer.",
    email: "sales.afn.patriot@gmail.com",
    appPasswordEnv: "SALES_MAIL_PATRIOT_APP_PASSWORD",
  },
  {
    key: "liberty",
    name: "Liberty",
    emoji: "🗽",
    quality: "The independence that drives American owner-operators.",
    email: "sales.afn.liberty@gmail.com",
    appPasswordEnv: "SALES_MAIL_LIBERTY_APP_PASSWORD",
  },
  {
    key: "ranger",
    name: "Ranger",
    emoji: "🛣️",
    quality: "The people who go out and find opportunities.",
    email: "sales.afn.ranger@gmail.com",
    appPasswordEnv: "SALES_MAIL_RANGER_APP_PASSWORD",
  },
  {
    key: "eagle",
    name: "Eagle",
    emoji: "🦅",
    quality: "Vision — seeing opportunities from above and thinking bigger.",
    email: "sales.afn.eagle@gmail.com",
    appPasswordEnv: "SALES_MAIL_EAGLE_APP_PASSWORD",
  },
  {
    key: "hawk",
    name: "Hawk",
    emoji: "🦅",
    quality: "Focus and precision — the right load and the right customer.",
    email: "sales.afn.hawk@gmail.com",
    appPasswordEnv: "SALES_MAIL_HAWK_APP_PASSWORD",
  },
  {
    key: "titan",
    name: "Titan",
    emoji: "⚔️",
    quality: "Strength, scale, and handling large opportunities.",
    email: "sales.afn.titan@gmail.com",
    appPasswordEnv: "SALES_MAIL_TITAN_APP_PASSWORD",
  },
  {
    key: "frontier",
    name: "Frontier",
    emoji: "🏔️",
    quality: "Expansion — new markets and territories.",
    email: "sales.afn.frontier@gmail.com",
    appPasswordEnv: "SALES_MAIL_FRONTIER_APP_PASSWORD",
  },
  {
    key: "sentinel",
    name: "Sentinel",
    emoji: "🛡️",
    quality: "Protection, reliability, watching over relationships.",
    email: "sales.afn.sentinel@gmail.com",
    appPasswordEnv: "SALES_MAIL_SENTINEL_APP_PASSWORD",
  },
  {
    key: "valor",
    name: "Valor",
    emoji: "🎖️",
    quality: "Courage, confidence, taking on difficult opportunities.",
    email: "sales.afn.valor@gmail.com",
    appPasswordEnv: "SALES_MAIL_VALOR_APP_PASSWORD",
  },
  {
    key: "vanguard",
    name: "Vanguard",
    emoji: "🚩",
    quality: "Leadership — being first and setting the standard.",
    email: "sales.afn.vanguard@gmail.com",
    appPasswordEnv: "SALES_MAIL_VANGUARD_APP_PASSWORD",
  },
];

export function getTeam(key: string | null | undefined): TeamDef | null {
  if (!key) return null;
  return SALES_TEAMS.find((t) => t.key === key) ?? null;
}

export type ResolvedMailbox = {
  team: TeamKey;
  name: string;
  email: string;
  appPassword: string;
};

function appPasswordFor(team: TeamDef): string | null {
  const pass = process.env[team.appPasswordEnv]?.trim();
  return pass || null;
}

export function isTeamConfigured(team: TeamDef): boolean {
  return Boolean(appPasswordFor(team));
}

export function getConfiguredTeams(): TeamDef[] {
  return SALES_TEAMS.filter(isTeamConfigured);
}

export function resolveMailboxByEmail(
  email: string | null | undefined
): ResolvedMailbox | null {
  if (!email) return null;
  const lower = email.trim().toLowerCase();
  const team = SALES_TEAMS.find((t) => t.email === lower);
  if (!team) return null;
  return resolveMailboxByTeam(team.key);
}

export function resolveMailboxByTeam(key: string): ResolvedMailbox | null {
  const team = getTeam(key);
  if (!team) return null;
  const pass = appPasswordFor(team);
  if (!pass) return null;
  return { team: team.key, name: team.name, email: team.email, appPassword: pass };
}

export type TeamQuota = {
  key: TeamKey;
  name: string;
  emoji: string;
  email: string;
  configured: boolean;
  cap: number;
  sentToday: number;
  remaining: number;
};

async function sentTodayForMailbox(
  supabase: SupabaseClient,
  mailboxEmail: string
): Promise<number> {
  const { startIso, endIso } = utcDayBounds();
  const { count } = await supabase
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("mailbox", mailboxEmail)
    .eq("success", true)
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  return count ?? 0;
}

export async function getTeamQuotas(
  supabase: SupabaseClient
): Promise<TeamQuota[]> {
  const cap = getDailySendCap();
  const out: TeamQuota[] = [];
  for (const team of SALES_TEAMS) {
    const configured = isTeamConfigured(team);
    const sentToday = configured
      ? await sentTodayForMailbox(supabase, team.email)
      : 0;
    out.push({
      key: team.key,
      name: team.name,
      emoji: team.emoji,
      email: team.email,
      configured,
      cap,
      sentToday,
      remaining: configured ? Math.max(0, cap - sentToday) : 0,
    });
  }
  return out;
}

export async function getMailboxQuota(
  supabase: SupabaseClient,
  mailboxEmail: string
): Promise<{ cap: number; sentToday: number; remaining: number }> {
  const cap = getDailySendCap();
  const sentToday = await sentTodayForMailbox(supabase, mailboxEmail);
  return { cap, sentToday, remaining: Math.max(0, cap - sentToday) };
}

/** Pick the configured mailbox with the most remaining quota today. */
export async function pickRoundRobinMailbox(
  supabase: SupabaseClient
): Promise<ResolvedMailbox | null> {
  const cap = getDailySendCap();
  const configured = getConfiguredTeams();
  if (configured.length === 0) return null;

  let best: { team: TeamDef; remaining: number } | null = null;
  for (const team of configured) {
    const sentToday = await sentTodayForMailbox(supabase, team.email);
    const remaining = cap - sentToday;
    if (remaining > 0 && (!best || remaining > best.remaining)) {
      best = { team, remaining };
    }
  }
  if (!best) return null;
  const pass = appPasswordFor(best.team);
  if (!pass) return null;
  return {
    team: best.team.key,
    name: best.team.name,
    email: best.team.email,
    appPassword: pass,
  };
}
