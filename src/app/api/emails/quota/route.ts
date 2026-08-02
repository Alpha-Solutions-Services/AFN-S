import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getSendQuota } from "@/lib/send-quota";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  try {
    const quota = await getSendQuota(supabase, user.id);
    return NextResponse.json(quota);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quota check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
