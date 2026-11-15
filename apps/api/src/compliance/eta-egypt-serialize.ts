import { createHash } from "crypto";

/** ETA document serialization for SHA256 receipt UUID (see sdk.invoicing.eta.gov.eg document-serialization-approach). */
export function etaSerializeValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "boolean") return `"${value ? "true" : "false"}"`;
  if (typeof value === "number") return `"${value}"`;
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) {
    let s = "";
    for (const el of value) {
      s += etaSerializeValue(el);
    }
    return s;
  }
  if (typeof value === "object") {
    let s = "";
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const upper = key.toUpperCase();
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const el of val) {
          s += `"${upper}"` + etaSerializeValue(el);
        }
      } else {
        s += `"${upper}"` + etaSerializeValue(val);
      }
    }
    return s;
  }
  return `"${String(value)}"`;
}

/** 64-char hex UUID from receipt content with `uuid` set to empty string and previousUUID included. */
export function computeEtaReceiptUuid(receiptForHash: Record<string, unknown>): string {
  const normalized = etaSerializeValue(receiptForHash);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}