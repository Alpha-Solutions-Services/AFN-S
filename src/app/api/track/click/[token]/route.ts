import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { isAllowedClickDestination } from "@/lib/tracking";
import { SALES_FREIGHT_URL } from "@/lib/email-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token?.trim();
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("to")?.trim() || SALES_FREIGHT_URL;
  const destination = isAllowedClickDestination(requested)
    ? requested
    : SALES_FREIGHT_URL;

  const redirect = NextResponse.redirect(destination, 302);

  if (!token || token.length < 8) return redirect;

  const admin = getServiceRoleClient();
  if (!admin) return redirect;

  const { data: target } = await admin
    .from("campaign_targets")
    .select("id, campaign_id, company_id, click_count, campaigns(owner_id)")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!target) return redirect;

  const campaign = Array.isArray(target.campaigns)
    ? target.campaigns[0]
    : target.campaigns;
  const ownerId = (campaign as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return redirect;

  const now = new Date().toISOString();
  await admin.from("email_events").insert({
    owner_id: ownerId,
    campaign_id: target.campaign_id,
    campaign_target_id: target.id,
    company_id: target.company_id,
    event_type: "click",
    meta: { to: destination },
  });

  await admin
    .from("campaign_targets")
    .update({
      last_event_at: now,
      click_count: (target.click_count ?? 0) + 1,
    })
    .eq("id", target.id);

  if (target.company_id) {
    const { data: company } = await admin
      .from("companies")
      .select("notes")
      .eq("id", target.company_id)
      .maybeSingle();

    const stamp = now.slice(0, 16).replace("T", " ");
    const line = `[${stamp} UTC] Clicked freight link`;
    const prev = company?.notes?.trim() || "";
    if (!prev.includes(line)) {
      const notes = prev ? `${prev}\n${line}` : line;
      await admin.from("companies").update({ notes }).eq("id", target.company_id);
    }
  }

  return redirect;
}
