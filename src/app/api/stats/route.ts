import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { COMPANY_STAGES } from "@/lib/stages";
import type { CompanyStage } from "@/lib/types";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const [
    companiesCountRes,
    campaignsRes,
    sentRes,
    failedRes,
    readyTargetsRes,
    recentLogsRes,
    ...stageCountResults
  ] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("campaigns").select("id, status"),
    supabase
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("success", true),
    supabase
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("success", false),
    supabase
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "failed"])
      .not("generated_subject", "is", null),
    supabase
      .from("email_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),
    ...COMPANY_STAGES.map((stage) =>
      supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("stage", stage)
    ),
  ]);

  if (companiesCountRes.error) {
    return NextResponse.json(
      { error: companiesCountRes.error.message },
      { status: 500 }
    );
  }

  const byStage = COMPANY_STAGES.reduce(
    (acc, stage, index) => {
      acc[stage] = stageCountResults[index]?.count ?? 0;
      return acc;
    },
    {} as Record<CompanyStage, number>
  );

  const campaigns = campaignsRes.data ?? [];

  return NextResponse.json({
    companiesTotal: companiesCountRes.count ?? 0,
    byStage,
    campaignsTotal: campaigns.length,
    campaignsSending: campaigns.filter((c) => c.status === "sending").length,
    campaignsPaused: campaigns.filter((c) => c.status === "paused").length,
    emailsSent: sentRes.count ?? 0,
    emailsFailed: failedRes.count ?? 0,
    draftsReady: readyTargetsRes.count ?? 0,
    recentLogs: recentLogsRes.data ?? [],
  });
}
