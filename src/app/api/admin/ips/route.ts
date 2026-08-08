import { NextResponse } from "next/server";
import { requireManager } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  const { data, error } = await admin
    .from("allowed_ips")
    .select("id, ip, label, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ips: data ?? [], envConfigured: Boolean(process.env.OFFICE_IPS) });
}

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { admin, user } = gate;

  let body: { ip?: string; label?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }
  const ip = (body.ip ?? "").trim();
  if (!ip) return NextResponse.json({ error: "IP is required" }, { status: 400 });

  const { data, error } = await admin
    .from("allowed_ips")
    .upsert({ ip, label: body.label ?? null, created_by: user.id }, { onConflict: "ip" })
    .select("id, ip, label, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ip: data });
}

export async function DELETE(request: Request) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await admin.from("allowed_ips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
