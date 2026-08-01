import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getConfiguredAiProvider } from "@/lib/ai-email";
import { getSalesMailFrom, isSalesMailConfigured } from "@/lib/mail";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const ai = getConfiguredAiProvider();
  const admin = getServiceRoleClient();
  const mailReady = isSalesMailConfigured();

  return NextResponse.json({
    ai: ai ?? "none",
    gmail: mailReady,
    mailFrom: getSalesMailFrom(),
    serviceRole: Boolean(admin),
    ready: Boolean(ai && mailReady && admin),
  });
}
