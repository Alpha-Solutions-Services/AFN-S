import type { Company, EmailDraft } from "@/lib/types";

const MODEL = "gemini-2.0-flash";

function extractJson(text: string): EmailDraft {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as EmailDraft;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini response was not valid JSON");
    return JSON.parse(match[0]) as EmailDraft;
  }
}

export async function generateEmailDraft(opts: {
  company: Pick<
    Company,
    "name" | "industry" | "contact_name" | "contact_title" | "website" | "notes"
  >;
  offerDescription: string;
}): Promise<EmailDraft> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const { company, offerDescription } = opts;
  const contactLine = [company.contact_name, company.contact_title]
    .filter(Boolean)
    .join(", ");

  const userPrompt = `Write a cold outreach email for this prospect.

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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
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

  const draft = extractJson(text);
  if (!draft.subject?.trim() || !draft.body?.trim()) {
    throw new Error("Gemini response missing subject or body");
  }
  return draft;
}
