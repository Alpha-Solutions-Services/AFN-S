import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { TRACKING_PIXEL_GIF } from "@/lib/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public open-tracking pixel. No auth — token is the secret.
 * Note: Gmail image proxy can cause false/early opens.
 */
export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token?.trim();
  const pixel = () =>
    new NextResponse(TRACKING_PIXEL_GIF, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

  if (!token || token.length < 8) return pixel();

  const admin = getServiceRoleClient();
  if (!admin) return pixel();

  const { data: target } = await admin
    .from("campaign_targets")
    .select("id, campaign_id, company_id, open_count, opened_at, campaigns(owner_id)")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!target) return pixel();

  const campaign = Array.isArray(target.campaigns)
    ? target.campaigns[0]
    : target.campaigns;
  const ownerId = (campaign as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return pixel();

  const now = new Date().toISOString();
  const ua = request.headers.get("user-agent") ?? "";

  await admin.from("email_events").insert({
    owner_id: ownerId,
    campaign_id: target.campaign_id,
    campaign_target_id: target.id,
    company_id: target.company_id,
    event_type: "open",
    meta: { ua: ua.slice(0, 240) },
  });

  await admin
    .from("campaign_targets")
    .update({
      opened_at: target.opened_at ?? now,
      open_count: (target.open_count ?? 0) + 1,
      last_event_at: now,
    })
    .eq("id", target.id);

  if (target.company_id) {
    await admin
      .from("companies")
      .update({ stage: "opened" })
      .eq("id", target.company_id)
      .in("stage", ["emailed", "not_contacted", "attempted"]);
  }

  return pixel();
}
