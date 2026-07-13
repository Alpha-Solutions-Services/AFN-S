import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getConfiguredAiProvider } from "@/lib/ai-email";
import { getGoogleTokens } from "@/lib/google-tokens";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const tokens = await getGoogleTokens(user.id);
  const aiProvider = getConfiguredAiProvider();

  return NextResponse.json({
    email: user.email ?? null,
    gmailConnected: Boolean(tokens?.refresh_token),
    gmailAddress: tokens?.gmail_address ?? null,
    gmailUpdatedAt: tokens?.updated_at ?? null,
    aiProvider,
  });
}
