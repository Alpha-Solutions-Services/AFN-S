import * as XLSX from "xlsx";
import type { CompanyStage } from "@/lib/types";

export interface ParsedCompanyRow {
  name: string;
  email: string;
  industry: string | null;
  contact_name: string | null;
  contact_title: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  extra: Record<string, unknown>;
  stage: CompanyStage;
}

const FIELD_ALIASES: Record<string, keyof Omit<ParsedCompanyRow, "extra" | "stage">> = {
  name: "name",
  company: "name",
  company_name: "name",
  legal_name: "name",
  dba_name: "name",
  legalname: "name",
  dbaname: "name",

  email: "email",
  email_address: "email",
  e_mail: "email",

  industry: "industry",
  mc_type: "industry",
  operating_classification: "industry",
  carrier_operation: "industry",

  contact_name: "contact_name",
  contact: "contact_name",
  contactname: "contact_name",

  contact_title: "contact_title",
  title: "contact_title",
  contacttitle: "contact_title",

  website: "website",
  url: "website",
  web: "website",

  phone: "phone",
  phone_number: "phone",
  tel: "phone",
  telephone: "phone",

  notes: "notes",
  note: "notes",
  comments: "notes",
  description: "notes",
};

function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function pickString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParsedCompanyRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const results: ParsedCompanyRow[] = [];

  for (const row of rows) {
    const mapped: Partial<Record<keyof ParsedCompanyRow, string | null>> = {};
    const extra: Record<string, unknown> = {};

    for (const [rawKey, rawValue] of Object.entries(row)) {
      const norm = normalizeHeader(rawKey);
      const field = FIELD_ALIASES[norm];
      const value = pickString(rawValue);

      if (!value) continue;

      if (field) {
        if (!mapped[field]) mapped[field] = value;
        else extra[rawKey] = value;
      } else {
        extra[rawKey] = value;
      }
    }

    const email = (mapped.email || "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) continue;

    const name =
      mapped.name ||
      pickString(extra.dba_name) ||
      pickString(extra.legal_name) ||
      email.split("@")[0] ||
      "Unknown";

    results.push({
      name,
      email,
      industry: mapped.industry ?? null,
      contact_name: mapped.contact_name ?? null,
      contact_title: mapped.contact_title ?? null,
      website: mapped.website ?? null,
      phone: mapped.phone ?? null,
      notes: mapped.notes ?? null,
      extra,
      stage: "not_contacted",
    });
  }

  return results;
}
