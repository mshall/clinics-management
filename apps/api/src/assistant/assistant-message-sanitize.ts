/** Redact likely PHI / identifiers before sending text to an external LLM. */
export function sanitizeAssistantMessageForLlm(message: string): string {
  let out = message;
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]");
  out = out.replace(/\b(?:\+?20|0)?1[0125]\d{8}\b/g, "[phone]");
  out = out.replace(/\b\d{14}\b/g, "[national-id]");
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id]");
  return out.trim();
}