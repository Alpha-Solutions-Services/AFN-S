import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";

/** Recent notifications + unread count for the signed-in user. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .is("read_at", null);

  return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 });
}

/** Mark notifications read (all, or a specific id). */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: { id?: string; all?: boolean } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const nowIso = new Date().toISOString();
  let query = supabase
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("owner_id", user.id)
    .is("read_at", null);
  if (body.id && !body.all) {
    query = query.eq("id", body.id);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
