import type { Company, EmailDraft } from "@/lib/types";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_MODEL = "gemini-2.0-flash";

const OPENER_STYLES = [
  "Start with a specific observation about their company or industry.",
  "Open with a short question about their current dispatch situation.",
  "Lead with a concrete rate or benefit number from the offer.",
  "Reference their location or fleet type if known from the data.",
  "Use a direct, peer-to-peer tone — like one operator talking to another.",
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

function validateDraft(draft: EmailDraft): EmailDraft {
  if (!draft.subject?.trim() || !draft.body?.trim()) {
    throw new Error("AI response missing subject or body");
  }
  return draft;
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

  return `Write a unique cold outreach email for this freight carrier prospect.

Company: ${company.name}
Industry: ${company.industry || "Unknown"}
Contact: ${contactLine || "Unknown"}
Website: ${company.website || "N/A"}
Phone: ${company.phone || "N/A"}
Notes: ${company.notes || "None"}
Additional data:
${formatExtra(company.extra)}

What we are offering:
${offerDescription}

Requirements:
- Under 120 words in the body
- Personalized to THIS company — mention something specific from their data
- One clear call to action (reply or quick call)
- ${styleHint}
- Vary subject line structure — do NOT reuse the same subject pattern as other emails
- No corporate buzzwords, no "I hope this email finds you well"
- Sound human, not like a mass blast
- Each email must read differently from others in the same campaign

Respond with ONLY raw JSON, no markdown fences:
{"subject": "...", "body": "..."}`;
}

async function generateWithGroq(prompt: string, variationIndex: number): Promise<EmailDraft> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1024,
      temperature: 0.85 + (variationIndex % 3) * 0.05,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message || "Groq API request failed");
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return validateDraft(extractJson(text));
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
          temperature: 0.9,
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
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  return null;
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

  if (provider === "groq") return generateWithGroq(prompt, variationIndex);
  if (provider === "gemini") return generateWithGemini(prompt);

  throw new Error(
    "No AI key configured. Add GROQ_API_KEY (free at console.groq.com) or GEMINI_API_KEY."
  );
}

export function isRateLimitError(message: string): boolean {
  return /quota|rate limit|too many requests|429|capacity/i.test(message);
}

export function parseRetrySeconds(message: string): number | null {
  const match = message.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return match ? Math.min(120, Math.ceil(parseFloat(match[1]))) : null;
}

export const GENERATION_DELAY_MS = 2000;
