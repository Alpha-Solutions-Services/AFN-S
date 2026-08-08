"use client";

import { useEffect, useRef, useState } from "react";

type SRAlternative = { transcript: string };
type SRResult = { isFinal: boolean; 0: SRAlternative; length: number };
type SREvent = {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
};
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRConstructor = new () => SpeechRecognitionLike;

type Suggestion = { suggestion: string; coaching: string; stage: string };

function getRecognitionCtor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function LiveCallAssist({ companyName }: { companyName: string }) {
  const [supported, setSupported] = useState(true);
  const [consent, setConsent] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const transcriptRef = useRef("");
  const companyRef = useRef(companyName);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  // Reset when the current carrier changes
  useEffect(() => {
    companyRef.current = companyName;
    stopListening();
    setTranscript("");
    setInterim("");
    setSuggestion(null);
    transcriptRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recognitionRef.current?.stop();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function requestSuggestion() {
    if (loadingRef.current) return;
    const text = transcriptRef.current.trim();
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calls/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, company: companyRef.current }),
      });
      const data = (await res.json()) as Suggestion & { error?: string };
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setSuggestion({
        suggestion: data.suggestion,
        coaching: data.coaching,
        stage: data.stage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function scheduleSuggestion() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void requestSuggestion();
    }, 1100);
  }

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !consent) return;
    setError(null);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: SREvent) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalChunk += t + " ";
        else interimChunk += t;
      }
      if (finalChunk) {
        transcriptRef.current = (transcriptRef.current + finalChunk).slice(-4000);
        setTranscript(transcriptRef.current);
        setInterim("");
        scheduleSuggestion();
      } else {
        setInterim(interimChunk);
      }
    };

    rec.onerror = (ev: { error?: string }) => {
      const code = ev?.error ?? "";
      if (code === "no-speech" || code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setError("Microphone permission denied. Allow mic access and try again.");
        stopListening();
      }
    };

    rec.onend = () => {
      // Chrome ends recognition on silence — restart while still listening
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          // ignore double-start
        }
      }
    };

    recognitionRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    try {
      rec.start();
    } catch {
      // ignore
    }
  }

  function stopListening() {
    listeningRef.current = false;
    setListening(false);
    recognitionRef.current?.stop();
  }

  if (!supported) {
    return (
      <div className="panel p-4">
        <p className="data-label">Live call assist</p>
        <p className="mt-2 text-sm text-muted">
          Live transcription needs Chrome or Edge on desktop. Open this page in
          Chrome to use it.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="data-label">Live call assist (beta)</p>
          <p className="mt-0.5 text-xs text-muted">
            Put the call on speakerphone / headset so your mic hears both sides.
            AI suggests your next line as you talk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {listening ? (
            <span className="flex items-center gap-1.5 font-mono text-xs text-danger">
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
              LISTENING
            </span>
          ) : null}
          <button
            type="button"
            className={listening ? "btn-secondary" : "btn-primary"}
            disabled={!consent && !listening}
            onClick={() => (listening ? stopListening() : startListening())}
          >
            {listening ? "Stop" : "Start listening"}
          </button>
        </div>
      </div>

      {!listening ? (
        <label className="mt-3 flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I confirm the carrier has been told this call may be recorded /
            assisted (required in two-party-consent states).
          </span>
        </label>
      ) : null}

      {suggestion ? (
        <div className="mt-3 rounded-lg border border-accent/50 bg-accent/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              Say this {suggestion.stage ? `· ${suggestion.stage}` : ""}
            </span>
            <button
              type="button"
              className="text-[11px] text-muted hover:text-text"
              disabled={loading}
              onClick={() => void requestSuggestion()}
            >
              {loading ? "…" : "Suggest again"}
            </button>
          </div>
          <p className="mt-1 text-base font-medium leading-snug text-text">
            “{suggestion.suggestion}”
          </p>
          {suggestion.coaching ? (
            <p className="mt-1 text-xs text-muted">Tip: {suggestion.coaching}</p>
          ) : null}
        </div>
      ) : listening ? (
        <p className="mt-3 text-xs text-muted">
          {loading ? "Thinking…" : "Listening — a suggestion appears as you talk."}
        </p>
      ) : null}

      {transcript || interim ? (
        <div className="mt-3">
          <p className="data-label mb-1">Transcript</p>
          <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-bg/40 p-2 text-xs leading-relaxed text-muted">
            {transcript}
            {interim ? <span className="opacity-50">{interim}</span> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 font-mono text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
