import type { SupabaseClient, User } from "@supabase/supabase-js";

export const MANAGER_EMAILS = [
  "sales.afn.alpha@gmail.com",
  "mikran.dispatch@gmail.com",
];

export const FORCES = [
  "patriot",
  "liberty",
  "ranger",
  "eagle",
  "hawk",
  "titan",
  "frontier",
  "sentinel",
  "valor",
  "vanguard",
] as const;

export type AppRole = "manager" | "team_lead" | "agent";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  team: string | null;
  agent_number: number | null;
  active: boolean;
};

export function isManagerRole(role: AppRole | null | undefined): boolean {
  return role === "manager";
}

/** Mirror of the SQL classify_profile() so the API can self-heal missing rows. */
export function classifyEmail(email: string): {
  role: AppRole;
  team: string | null;
  agent_number: number | null;
} {
  const e = (email || "").trim().toLowerCase();
  if (MANAGER_EMAILS.includes(e)) {
    return { role: "manager", team: null, agent_number: null };
  }
  const local = e.split("@")[0] ?? "";
  const [base, plus = ""] = local.split("+");
  let team: string | null = null;
  if (base.startsWith("sales.afn.")) {
    const parts = base.split(".");
    team = parts[2] ?? null;
  }
  if (team && (FORCES as readonly string[]).includes(team)) {
    if (plus && /^[0-9]+$/.test(plus)) {
      return { role: "agent", team, agent_number: Number(plus) };
    }
    return { role: "team_lead", team, agent_number: null };
  }
  return { role: "agent", team: null, agent_number: null };
}

/** Read a profile by user id (service-role client). */
export async function getProfile(
  admin: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, email, full_name, role, team, agent_number, active")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile) ?? null;
}

/** Read the profile, creating it from the email classification if missing. */
export async function ensureProfile(
  admin: SupabaseClient,
  user: Pick<User, "id" | "email">
): Promise<Profile | null> {
  const existing = await getProfile(admin, user.id);
  if (existing) return existing;
  if (!user.email) return null;

  const c = classifyEmail(user.email);
  const { data } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email.toLowerCase(),
        role: c.role,
        team: c.team,
        agent_number: c.agent_number,
      },
      { onConflict: "id" }
    )
    .select("id, email, full_name, role, team, agent_number, active")
    .maybeSingle();
  return (data as Profile) ?? null;
}
