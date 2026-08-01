import type { Company, EmailDraft } from "@/lib/types";
import { ensureSalesSignature } from "@/lib/email-signature";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_MODEL = "gemini-2.0-flash";

const OPENER_STYLES = [
  "Open with one specific, factual detail about their company (fleet, lanes, MC notes, or industry) — never a generic compliment.",
  "Ask one short, natural question about how they handle dispatch or empty miles today.",
  "Lead with a concrete, believable benefit from the offer (rates, lanes, or time saved) without hype.",
  "If location or fleet type is in the data, reference it once in plain language.",
  "Write like a dispatch manager emailing another operator — peer to peer, calm and direct.",
];

function extractJson(text: string): EmailDraft {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as EmailDraft;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response was not valid JSON");
    return JSON.parse(match[0]) as EmailDraft;
  }
}

function stripAiSignature(body: string): string {
  const cutMarkers = [
    /\n[-–—]\s*\nMuhammad Mikran[\s\S]*$/i,
    /\nBest regards,[\s\S]*$/i,
    /\nRegards,[\s\S]*$/i,
    /\nThanks,[\s\S]*$/i,
    /\nThank you,[\s\S]*$/i,
    /\nSincerely,[\s\S]*$/i,
  ];
  let cleaned = body.trim();
  for (const re of cutMarkers) {
    cleaned = cleaned.replace(re, "").trim();
  }
  return cleaned;
}

function withSignature(draft: EmailDraft): EmailDraft {
  const subject = draft.subject.trim().replace(/\s+/g, " ");
  return {
    subject,
    body: ensureSalesSignature(stripAiSignature(draft.body)),
  };
}

function validateDraft(draft: EmailDraft): EmailDraft {
  if (!draft.subject?.trim() || !draft.body?.trim()) {
    throw new Error("AI response missing subject or body");
  }
  return withSignature(draft);
}

function formatExtra(extra: Record<string, unknown> | undefined): string {
  if (!extra || Object.keys(extra).length === 0) return "None";
  const lines = Object.entries(extra)
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("\n");
  return lines || "None";
}

function buildPrompt(opts: {
  company: Pick<
    Company,
    | "name"
    | "industry"
    | "contact_name"
    | "contact_title"
    | "website"
    | "notes"
    | "phone"
  > & { extra?: Record<string, unknown> };
  offerDescription: string;
  variationIndex?: number;
}): string {
  const { company, offerDescription, variationIndex = 0 } = opts;
  const contactLine = [company.contact_name, company.contact_title]
    .filter(Boolean)
    .join(", ");
  const styleHint = OPENER_STYLES[variationIndex % OPENER_STYLES.length];

  return `You write deliverable cold emails for US freight carriers / owner-operators.
Goal: helpful, human outreach that inbox filters accept — NOT spammy sales blasts.

Company: ${company.name}
Industry: ${company.industry || "Unknown"}
Contact: ${contactLine || "Unknown"}
Website: ${company.website || "N/A"}
Phone: ${company.phone || "N/A"}
Notes: ${company.notes || "None"}
Additional data:
${formatExtra(company.extra)}

What we are offering (use only facts from this; do not invent rates or guarantees):
${offerDescription}

Subject line rules (critical for deliverability):
- 4–8 words, Title Case or sentence case — never ALL CAPS
- No exclamation marks, no emoji, no "$", no "FREE", "guaranteed", "urgent", "act now", "limited time"
- Sound like a normal business email subject (example vibe: "Quick question about ${company.name}" or "Dispatch help for your trucks" — invent a unique one)
- Do not start with "Re:" or "Fwd:"

Body rules (critical for deliverability):
- 60–100 words of body only
- Signature, phone numbers, and CTA are added by the system — do NOT write any phone number, do NOT write "call us at …", do NOT invent contact info
- NEVER invent phone numbers, emails, websites, or rates not in the offer
- Plain text only — no HTML, no markdown, no bullet symbols
- ${styleHint}
- Personalize with one real detail from the company data above
- Soft close in one sentence: invite them to reply to this email (system adds Google Voice CTA)
- One idea per email; short paragraphs (1–2 sentences each)
- Avoid spam triggers: "make money", "act now", "100%", "risk-free", "click here", "congratulations", excessive punctuation, ALL CAPS words
- Do not claim you already work with them or that you called previously unless notes say so
- No "I hope this email finds you well", no "synergy", no "touching base", no "circle back"
- Sound like Muhammad Mikran (dispatch manager) writing one careful email — not a mass campaign
- The company Phone field above is THEIR number (prospect), not ours — never put it in the email as a call-to-action

Respond with ONLY raw JSON, no markdown fences:
{"subject": "...", "body": "..."}`;
}

function getGroqApiKeys(): string[] {
  const keys = [
    process.env.GROQ_API_KEY?.trim(),
    process.env.GROQ_API_KEY_2?.trim(),
  ].filter((k): k is string => Boolean(k));
  return Array.from(new Set(keys));
}

async function callGroq(
  apiKey: string,
  prompt: string,
  variationIndex: number
): Promise<EmailDraft> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1024,
      temperature: 0.75 + (variationIndex % 3) * 0.05,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const message = data.error?.message || "Groq API request failed";
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return validateDraft(extractJson(text));
}

export function isRateLimitError(message: string): boolean {
  return /quota|rate limit|too many requests|429|capacity|tpm|rpm/i.test(message);
}

async function generateWithGroq(
  prompt: string,
  variationIndex: number
): Promise<EmailDraft> {
  const keys = getGroqApiKeys();
  if (keys.length === 0) throw new Error("GROQ_API_KEY not configured");

  let lastError: Error | null = null;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await callGroq(keys[i], prompt, variationIndex);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (err as { status?: number })?.status;
      const msg = lastError.message;
      const shouldFailover =
        i < keys.length - 1 &&
        (status === 429 ||
          status === 401 ||
          status === 403 ||
          isRateLimitError(msg));
      if (!shouldFailover) throw lastError;
    }
  }
  throw lastError ?? new Error("Groq API request failed");
}

async function generateWithGemini(prompt: string): Promise<EmailDraft> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
          temperature: 0.8,
        },
      }),
    }
  );

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message || "Gemini API request failed");
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return validateDraft(extractJson(text));
}

export function getConfiguredAiProvider(): "groq" | "gemini" | null {
  if (getGroqApiKeys().length > 0) return "groq";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  return null;
}

export function getGroqKeyCount(): number {
  return getGroqApiKeys().length;
}

export async function generateEmailDraft(opts: {
  company: Pick<
    Company,
    "name" | "industry" | "contact_name" | "contact_title" | "website" | "notes" | "phone"
  > & { extra?: Record<string, unknown> };
  offerDescription: string;
  variationIndex?: number;
}): Promise<EmailDraft> {
  const variationIndex = opts.variationIndex ?? 0;
  const prompt = buildPrompt(opts);
  const provider = getConfiguredAiProvider();

  if (provider === "groq") {
    try {
      return await generateWithGroq(prompt, variationIndex);
    } catch (err) {
      if (process.env.GEMINI_API_KEY?.trim()) {
        return generateWithGemini(prompt);
      }
      throw err;
    }
  }
  if (provider === "gemini") return generateWithGemini(prompt);

  throw new Error(
    "No AI key configured. Add GROQ_API_KEY (and optional GROQ_API_KEY_2) or GEMINI_API_KEY."
  );
}

export function parseRetrySeconds(message: string): number | null {
  const match = message.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return match ? Math.min(120, Math.ceil(parseFloat(match[1]))) : null;
}

export const GENERATION_DELAY_MS = 2000;
