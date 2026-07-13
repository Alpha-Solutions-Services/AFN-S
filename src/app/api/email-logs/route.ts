import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 25)));

  const { data, error } = await supabase
    .from("email_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
