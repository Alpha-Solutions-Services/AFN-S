import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { parseExcelBuffer, type ParsedCompanyRow } from "@/lib/excel-import";
import { IMPORT_BATCH_SIZE, type ImportRowPayload } from "@/lib/import-batch";

export const runtime = "nodejs";
export const maxDuration = 60;

function toPayload(rows: ParsedCompanyRow[], ownerId: string): ImportRowPayload[] {
  return rows.map((row) => ({
    owner_id: ownerId,
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
}

async function upsertBatches(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  payload: ImportRowPayload[]
) {
  if (!supabase) throw new Error("Database not configured");

  let imported = 0;
  for (let i = 0; i < payload.length; i += IMPORT_BATCH_SIZE) {
    const chunk = payload.slice(i, i + IMPORT_BATCH_SIZE);
    const { data, error } = await supabase
      .from("companies")
      .upsert(chunk, { onConflict: "owner_id,email", ignoreDuplicates: false })
      .select("id");

    if (error) throw new Error(error.message);
    imported += data?.length ?? chunk.length;
  }
  return imported;
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    let rows: ParsedCompanyRow[] = [];

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { rows?: ParsedCompanyRow[] };
      rows = body.rows ?? [];
    } else {
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

      const buffer = await file.arrayBuffer();
      rows = parseExcelBuffer(buffer);
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows with email addresses found" },
        { status: 400 }
      );
    }

    const payload = toPayload(rows, user.id);
    const imported = await upsertBatches(supabase, payload);

    return NextResponse.json({
      imported,
      skipped: 0,
      totalRows: rows.length,
      batches: Math.ceil(rows.length / IMPORT_BATCH_SIZE),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
