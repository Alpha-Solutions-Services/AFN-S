import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit") ?? DEFAULT_LIMIT))
  );

  const { data, error, count } = await supabase
    .from("companies")
    .select("*", { count: "exact" })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    companies: data ?? [],
    total: count ?? 0,
    offset,
    limit,
  });
}
