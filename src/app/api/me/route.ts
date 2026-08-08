import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { ensureProfile } from "@/lib/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Current user's profile (role/team). Self-heals a missing profile row. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getServiceRoleClient();
  if (!admin) {
    // Fail-open: org tables may not be migrated yet
    return NextResponse.json({ profile: null, configured: false });
  }

  try {
    const profile = await ensureProfile(admin, { id: user.id, email: user.email });
    return NextResponse.json({ profile, configured: true });
  } catch {
    return NextResponse.json({ profile: null, configured: false });
  }
}
