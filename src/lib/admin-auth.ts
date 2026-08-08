import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api-auth";
import { getProfile, type Profile } from "@/lib/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

type Ok = { admin: SupabaseClient; user: User; profile: Profile };
type Err = { error: NextResponse };

async function base(): Promise<
  | { admin: SupabaseClient; user: User; profile: Profile | null }
  | Err
> {
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error } as Err;
  const admin = getServiceRoleClient();
  if (!admin) {
    return { error: NextResponse.json({ error: "Service role not configured" }, { status: 503 }) };
  }
  const profile = await getProfile(admin, auth.user.id);
  return { admin, user: auth.user, profile };
}

export async function requireManager(): Promise<Ok | Err> {
  const b = await base();
  if ("error" in b) return b;
  if (!b.profile || b.profile.role !== "manager") {
    return { error: NextResponse.json({ error: "Managers only" }, { status: 403 }) };
  }
  return { admin: b.admin, user: b.user, profile: b.profile };
}

export async function requireLeadOrManager(): Promise<Ok | Err> {
  const b = await base();
  if ("error" in b) return b;
  if (!b.profile || (b.profile.role !== "manager" && b.profile.role !== "team_lead")) {
    return { error: NextResponse.json({ error: "Managers or team leads only" }, { status: 403 }) };
  }
  return { admin: b.admin, user: b.user, profile: b.profile };
}
