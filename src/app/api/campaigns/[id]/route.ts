import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = params;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: targets, error: targetsError } = await supabase
    .from("campaign_targets")
    .select(
      `
      *,
      companies (
        name,
        email,
        industry,
        contact_name,
        contact_title,
        website,
        notes
      )
    `
    )
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  if (targetsError) {
    return NextResponse.json({ error: targetsError.message }, { status: 500 });
  }

  return NextResponse.json({ campaign, targets: targets ?? [] });
}
