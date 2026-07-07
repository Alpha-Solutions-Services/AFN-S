import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function storeGoogleTokens(
  ownerId: string,
  refreshToken: string,
  gmailAddress: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Service role client not configured" };
  }

  const { error } = await admin.from("google_tokens").upsert(
    {
      owner_id: ownerId,
      refresh_token: refreshToken,
      gmail_address: gmailAddress.toLowerCase(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getGoogleTokens(ownerId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("google_tokens")
    .select("owner_id, refresh_token, gmail_address, updated_at")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
