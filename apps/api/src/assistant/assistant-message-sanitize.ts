import type { MarketAiRedaction } from "../providers/ai/market-ai-redaction";

const DEFAULT_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/** Redact likely PHI / identifiers before sending text to an external LLM. */
export function sanitizeAssistantMessageForLlm(message: string, redaction?: MarketAiRedaction | null): string {
  let out = message;
  const emailRe = redaction?.emailPattern ? new RegExp(redaction.emailPattern, "gi") : DEFAULT_EMAIL;
  out = out.replace(emailRe, "[email]");
  if (redaction?.phonePattern) {
    out = out.replace(new RegExp(redaction.phonePattern, "g"), "[phone]");
  }
  if (redaction?.nationalIdPattern) {
    out = out.replace(new RegExp(redaction.nationalIdPattern, "g"), "[national-id]");
  }
  if (redaction?.namePattern) {
    out = out.replace(new RegExp(redaction.namePattern, "g"), "[name]");
  }
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id]");
  return out.trim();
}