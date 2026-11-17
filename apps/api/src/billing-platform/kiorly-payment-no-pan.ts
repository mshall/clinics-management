const FORBIDDEN_KEYS = new Set(
  [
    "pan",
    "cardNumber",
    "card_number",
    "cvv",
    "cvc",
    "card_cvv",
    "cardCvv",
    "expiry",
    "card_expiry",
  ].map((k) => k.toLowerCase()),
);

/** Rejects payloads that attempt to send card secrets to Kiorly (hosted fields / redirect only). */
export function assertNoPanOrCvvInBody(body: unknown): void {
  if (!body || typeof body !== "object") return;
  walk(body as Record<string, unknown>, "");
}

function walk(obj: Record<string, unknown>, path: string): void {
  for (const [key, value] of Object.entries(obj)) {
    const full = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`Card data must not be sent to Kiorly API (rejected field: ${full})`);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      walk(value as Record<string, unknown>, full);
    }
  }
}