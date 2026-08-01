import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { isCompanyStage } from "@/lib/stages";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing company id" }, { status: 400 });
  }

  let body: {
    stage?: string;
    next_call_at?: string | null;
    notes?: string | null;
    phone?: string | null;
    name?: string;
    contact_name?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.stage !== undefined) {
    if (!isCompanyStage(body.stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }
    updates.stage = body.stage;
  }

  if (body.next_call_at !== undefined) {
    updates.next_call_at = body.next_call_at
      ? new Date(body.next_call_at).toISOString()
      : null;
  }

  if (body.notes !== undefined) {
    updates.notes = body.notes?.trim() || null;
  }

  if (body.phone !== undefined) {
    updates.phone = body.phone?.trim() || null;
  }

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    updates.name = name;
  }

  if (body.contact_name !== undefined) {
    updates.contact_name = body.contact_name?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json({ company: data });
}
