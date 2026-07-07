import type { Company, EmailDraft } from "@/lib/types";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_MODEL = "gemini-2.0-flash";

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

function buildPrompt(opts: {
  company: Pick<
    Company,
    "name" | "industry" | "contact_name" | "contact_title" | "website" | "notes"
  >;
  offerDescription: string;
}): string {
  const { company, offerDescription } = opts;
  const contactLine = [company.contact_name, company.contact_title]
    .filter(Boolean)
    .join(", ");

  return `Write a cold outreach email for this prospect.

Company: ${company.name}
Industry: ${company.industry || "Unknown"}
Contact: ${contactLine || "Unknown"}
Website: ${company.website || "N/A"}
Notes: ${company.notes || "None"}

What we are offering:
${offerDescription}

Requirements:
- Under 120 words
- Personalized to this company's specifics
- One clear call to action
- No corporate buzzwords
- Do NOT use "I hope this email finds you well" or similar filler

Respond with ONLY raw JSON, no markdown fences:
{"subject": "...", "body": "..."}`;
}

async function generateWithGroq(prompt: string): Promise<EmailDraft> {
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
      temperature: 0.7,
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
    "name" | "industry" | "contact_name" | "contact_title" | "website" | "notes"
  >;
  offerDescription: string;
}): Promise<EmailDraft> {
  const prompt = buildPrompt(opts);
  const provider = getConfiguredAiProvider();

  if (provider === "groq") return generateWithGroq(prompt);
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

/** Delay between draft generations to stay within free-tier limits. */
export const GENERATION_DELAY_MS = 2500;
