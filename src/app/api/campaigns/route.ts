import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

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
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const offerDescription = body.offer_description?.trim() ?? "";
  const targetFilter = body.target_filter === "all" ? "all" : "not_contacted";

  if (!name) {
    return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      owner_id: user.id,
      name,
      offer_description: offerDescription,
      target_filter: targetFilter,
      status: "draft",
    })
    .select("*")
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: campaignError?.message || "Failed to create campaign" },
      { status: 500 }
    );
  }

  let companyQuery = supabase.from("companies").select("id").eq("owner_id", user.id);
  if (targetFilter === "not_contacted") {
    companyQuery = companyQuery.eq("stage", "not_contacted");
  }

  const { data: companies, error: companiesError } = await companyQuery;
  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  if (companies && companies.length > 0) {
    const targets = companies.map((c) => ({
      campaign_id: campaign.id,
      company_id: c.id,
      status: "pending" as const,
    }));

    const { error: targetsError } = await supabase
      .from("campaign_targets")
      .insert(targets);

    if (targetsError) {
      return NextResponse.json({ error: targetsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ campaign, targets: companies?.length ?? 0 });
}
