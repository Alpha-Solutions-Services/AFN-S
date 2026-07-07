import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { parseExcelBuffer } from "@/lib/excel-import";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const rows = parseExcelBuffer(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows with email addresses found" },
        { status: 400 }
      );
    }

    const payload = rows.map((row) => ({
      owner_id: user.id,
      name: row.name,
      email: row.email,
      industry: row.industry,
      contact_name: row.contact_name,
      contact_title: row.contact_title,
      website: row.website,
      phone: row.phone,
      notes: row.notes,
      extra: row.extra,
      stage: row.stage,
    }));

    const { data, error } = await supabase
      .from("companies")
      .upsert(payload, { onConflict: "owner_id,email", ignoreDuplicates: false })
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      imported: data?.length ?? rows.length,
      skipped: 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
