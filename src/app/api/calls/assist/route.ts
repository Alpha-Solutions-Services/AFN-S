import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GROQ_MODEL = "llama-3.3-70b-versatile";

function groqKeys(): string[] {
  return Array.from(
    new Set(
      [process.env.GROQ_API_KEY?.trim(), process.env.GROQ_API_KEY_2?.trim()].filter(
        (k): k is string => Boolean(k)
      )
    )
  );
}

type Suggestion = { suggestion: string; coaching: string; stage: string };

function buildPrompt(transcript: string, company: string): string {
  return `You are a LIVE call whisper-assistant for Alpha Freight Network (AFN), a dispatch/back-office service for US trucking owner-operators and small fleets.

An AFN sales agent is on a phone call (Google Voice) with a carrier at "${company}". Below is a live, imperfect microphone transcript of the conversation (both people mixed together, may have errors). Your job: tell the agent the SINGLE best next thing to SAY right now.

Rules:
- Output ONE short spoken line (max ~30 words), natural American English, ready to say out loud.
- Stay in the AFN dispatch pitch: discovery (own MC/DOT authority, truck/trailer type, trailer length, number of trucks, home ZIP + preferred lanes, confirm best email for the onboarding form), the offer (dispatch fee is a percentage of gross: 8% standard, 6% for a longer-term agreement, no sign-up fee), and the close (send onboarding form + set a callback).
- If the carrier raised an objection, answer it directly and confidently.
- NEVER invent rates, dollar amounts, load counts, or promises beyond the pitch above.
- If the transcript is empty or unclear, suggest a good opener discovery question.

Conversation transcript (most recent last):
"""
${transcript.slice(-1800)}
"""

Respond with ONLY raw JSON, no markdown:
{"suggestion":"<the line to say>","coaching":"<max 8-word tip for the agent>","stage":"opening|discovery|offer|objection|close"}`;
}

async function callGroq(apiKey: string, prompt: string): Promise<Suggestion> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 220,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    const err = new Error(data.error?.message || "Groq request failed") as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  const text = data.choices?.[0]?.message?.content ?? "";
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("AI response was not valid JSON");
  const parsed = JSON.parse(json[0]) as Partial<Suggestion>;
  return {
    suggestion: String(parsed.suggestion ?? "").trim(),
    coaching: String(parsed.coaching ?? "").trim(),
    stage: String(parsed.stage ?? "discovery").trim(),
  };
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: { transcript?: string; company?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const transcript = (body.transcript ?? "").toString();
  const company = (body.company ?? "the carrier").toString().slice(0, 120);

  const keys = groqKeys();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: "AI not configured (set GROQ_API_KEY)." },
      { status: 503 }
    );
  }

  const prompt = buildPrompt(transcript, company);
  let lastError: Error | null = null;
  for (let i = 0; i < keys.length; i++) {
    try {
      const result = await callGroq(keys[i], prompt);
      return NextResponse.json(result);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (err as { status?: number }).status;
      const retry =
        i < keys.length - 1 && (status === 429 || status === 401 || status === 403);
      if (!retry) break;
    }
  }
  return NextResponse.json(
    { error: lastError?.message || "AI request failed" },
    { status: 500 }
  );
}
