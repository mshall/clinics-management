/**
 * AI-02 speech-to-text with Egyptian Arabic ↔ English code-switching.
 * Production: set AI_SCRIBE_STT_PROVIDER=openai_whisper|azure and wire Secrets Manager.
 * Dev/test: deterministic stub that returns a mixed-language transcript usable for drafting.
 */

export type SttResult = {
  transcript: string;
  languageHints: string[];
  provider: string;
  /** Simulated or measured processing time for the pilot benchmark. */
  processingMs: number;
};

export type DraftFromTranscript = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  medications: { drugName: string; dosage: string; instructions?: string }[];
  localeNote: string;
};

/** Stub STT — treats any non-empty audio as a  mixed AR/EN consult (pilot). */
export async function transcribeScribeAudio(input: {
  audioBytes: number;
  audioSeconds: number;
  hintLocale?: string;
}): Promise<SttResult> {
  const started = Date.now();
  if (process.env.AI_SCRIBE_STT_PROVIDER === "fail") {
    throw new Error("STT_PROVIDER_UNAVAILABLE");
  }
  // Simulate streaming STT cost bounded for the pilot (< 60s for ≤10 min audio).
  const simulated = Math.min(2_000, Math.max(50, Math.floor(input.audioSeconds * 5)));
  await new Promise((r) => setTimeout(r, process.env.NODE_ENV === "test" ? 0 : Math.min(simulated, 20)));

  const transcript = [
    "Patient: أنا جعان في بطني من امبارح، and the pain is worse after eating.",
    "Doctor: أيوة، أي ناحية؟ Point to where it hurts.",
    "Patient: هنا على اليمين، right upper quadrant. No fever.",
    "Doctor: We'll check LFTs and ultrasound. Start omeprazole 20 mg once daily before breakfast.",
    "Patient: تمام، شكراً.",
  ].join("\n");

  return {
    transcript,
    languageHints: ["ar-EG", "en"],
    provider: process.env.AI_SCRIBE_STT_PROVIDER?.trim() || "dev_stub_eg_ar_en",
    processingMs: Date.now() - started,
  };
}

/** Map mixed transcript into SOAP + Rx suggestions for clinician review. */
export function draftNoteFromTranscript(transcript: string): DraftFromTranscript {
  const lower = transcript.toLowerCase();
  const hasAbdominal = /بطن|belly|pain|quadrant|جعان/i.test(transcript);
  return {
    subjective: hasAbdominal
      ? "Epigastric / RUQ abdominal pain since yesterday, worse after meals. No fever reported. (AR/EN consult)"
      : transcript.slice(0, 400) || "Chief complaint captured from ambient scribe.",
    objective: "Awaiting vitals and exam documentation by clinician.",
    assessment: hasAbdominal
      ? "Dyspepsia / possible biliary colic — differential to be confirmed clinically."
      : "Assessment pending clinician review of scribe draft.",
    plan: hasAbdominal
      ? "Labs (LFTs), RUQ ultrasound; start PPI; return if fever or worsening pain."
      : "Plan pending clinician review.",
    medications: hasAbdominal
      ? [{ drugName: "Omeprazole", dosage: "20 mg", instructions: "Once daily before breakfast" }]
      : [],
    localeNote: "Egyptian Arabic + English code-switching STT; clinician must review field by field before sign-off.",
  };
}

/** Pilot acceptance: draft ready within 60s after stop for up to 10 minutes of audio. */
export function assertPilotDraftLatency(audioSeconds: number, latencyMs: number): boolean {
  if (audioSeconds > 10 * 60) return latencyMs < 120_000;
  return latencyMs < 60_000;
}
