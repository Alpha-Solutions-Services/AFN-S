import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { IMPORT_BATCH_SIZE } from "@/lib/import-batch";
import { getTeam } from "@/lib/mailboxes";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let body: {
    name?: string;
    offer_description?: string;
    target_filter?: "not_contacted" | "all";
    company_ids?: string[];
    team?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const offerDescription = body.offer_description?.trim() ?? "";
  const targetFilter = body.target_filter === "all" ? "all" : "not_contacted";
  const companyIds = Array.isArray(body.company_ids)
    ? Array.from(
        new Set(
          body.company_ids.filter((id): id is string => typeof id === "string" && !!id)
        )
      )
    : [];

  if (!name) {
    return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
  }

  // null / empty team = round-robin across the configured 10 Forces
  const team = body.team && getTeam(body.team) ? body.team : null;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      owner_id: user.id,
      name,
      offer_description: offerDescription,
      target_filter: companyIds.length > 0 ? "all" : targetFilter,
      status: "draft",
      team,
    })
    .select("*")
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: campaignError?.message || "Failed to create campaign" },
      { status: 500 }
    );
  }

  let companies: { id: string }[] | null = null;

  if (companyIds.length > 0) {
    const { data, error: companiesError } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", user.id)
      .in("id", companyIds);
    if (companiesError) {
      return NextResponse.json({ error: companiesError.message }, { status: 500 });
    }
    companies = data;
  } else {
    let companyQuery = supabase.from("companies").select("id").eq("owner_id", user.id);
    if (targetFilter === "not_contacted") {
      companyQuery = companyQuery.eq("stage", "not_contacted");
    }
    const { data, error: companiesError } = await companyQuery;
    if (companiesError) {
      return NextResponse.json({ error: companiesError.message }, { status: 500 });
    }
    companies = data;
  }

  let targetCount = 0;
  if (companies && companies.length > 0) {
    const targets = companies.map((c) => ({
      campaign_id: campaign.id,
      company_id: c.id,
      status: "pending" as const,
    }));

    for (let i = 0; i < targets.length; i += IMPORT_BATCH_SIZE) {
      const chunk = targets.slice(i, i + IMPORT_BATCH_SIZE);
      const { error: targetsError } = await supabase
        .from("campaign_targets")
        .insert(chunk);
      if (targetsError) {
        return NextResponse.json({ error: targetsError.message }, { status: 500 });
      }
      targetCount += chunk.length;
    }
  }

  return NextResponse.json({ campaign, targets: targetCount });
}
