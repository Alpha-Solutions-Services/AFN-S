import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; targetId: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let body: { subject?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subject = body.subject?.trim();
  const emailBody = body.body?.trim();

  if (!subject || !emailBody) {
    return NextResponse.json(
      { error: "Subject and body are required" },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("campaign_targets")
    .select("id, status")
    .eq("id", params.targetId)
    .eq("campaign_id", params.id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  if (existing.status === "sent") {
    return NextResponse.json(
      { error: "Cannot edit a draft that was already sent" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("campaign_targets")
    .update({
      generated_subject: subject,
      generated_body: emailBody,
      error_message: null,
      // Edited drafts that failed before become sendable again
      status: "pending",
    })
    .eq("id", params.targetId)
    .eq("campaign_id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ target: data });
}
