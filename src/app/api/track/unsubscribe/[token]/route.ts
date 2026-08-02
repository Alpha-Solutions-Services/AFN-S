import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function okPage() {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px;color:#202124;">
      <h1 style="font-size:20px;">You're unsubscribed</h1>
      <p>We won't email this address from Alpha Freight Network outreach again.</p>
    </body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

async function unsubscribeByToken(token: string) {
  const admin = getServiceRoleClient();
  if (!admin || !token || token.length < 8) return;

  const { data: target } = await admin
    .from("campaign_targets")
    .select("id, campaign_id, company_id, campaigns(owner_id)")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!target?.company_id) return;

  const campaign = Array.isArray(target.campaigns)
    ? target.campaigns[0]
    : target.campaigns;
  const ownerId = (campaign as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return;

  const now = new Date().toISOString();
  await admin
    .from("companies")
    .update({
      do_not_email: true,
      unsubscribed_at: now,
      stage: "lost",
    })
    .eq("id", target.company_id);

  await admin.from("email_events").insert({
    owner_id: ownerId,
    campaign_id: target.campaign_id,
    campaign_target_id: target.id,
    company_id: target.company_id,
    event_type: "unsubscribe",
    meta: {},
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  await unsubscribeByToken(params.token?.trim() ?? "");
  return okPage();
}

/** One-click List-Unsubscribe=One-Click */
export async function POST(
  _request: Request,
  { params }: { params: { token: string } }
) {
  await unsubscribeByToken(params.token?.trim() ?? "");
  return new NextResponse(null, { status: 204 });
}
