/**
 * Clinic's own copy of the small pieces of @kiorex/contracts 1.10.0 (growth) that the Clinic needs. Clinic does not vendor the package (its Docker build
 * context cannot reach the sibling repo), exactly like the 1.9.0 intake helpers in marketplace/kiorex-connect.service.ts. Equality with the contract is
 * proven by acquisition-contract.node.test.ts against fixtures copied from kiorex-contracts/fixtures/growth-v1.10 (and against the sibling build when present).
 * Pure: no I/O, no Prisma.
 */
import { createHash } from "node:crypto";

export const ACQUISITION_ORIGINS = ["PROVIDER_LED", "MARKETPLACE", "UNATTRIBUTED"] as const;
export type AcquisitionOriginName = (typeof ACQUISITION_ORIGINS)[number];

/** Reason codes Kiorex emits today; receivers tolerate codes added later (the pattern is what is validated). */
export const ATTRIBUTION_REASON_CODES = [
  "EXPLICIT_PROVIDER_CHANNEL", "PRIOR_PROVIDER_TOUCH", "PATIENT_REFERRAL", "MARKETPLACE_TOUCH", "NO_PROVIDER_EVIDENCE",
] as const;

/** Link code alphabet: Crockford base32 without I, L, O, U (ARCH 4.2); length 8. */
export const LINK_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export const WIDGET_MAX_ORIGINS = 10;
export const WIDGET_ORIGIN_PATTERN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/;
export function isValidWidgetOrigin(origin: unknown): origin is string {
  return typeof origin === "string" && origin.length <= 255 && WIDGET_ORIGIN_PATTERN.test(origin);
}

export interface AcquisitionBlock {
  origin: AcquisitionOriginName;
  decisionId: string;
  policyVersion: string;
  reason: string;
  evidenceHash: string;
  touch?: { kind: string; ref: string; at: string };
}

export type AcquisitionBlockError = "ACQUISITION_BLOCK_INVALID" | "ACQUISITION_EVIDENCE_HASH_INVALID";
export type AcquisitionParse =
  | { ok: true; block: AcquisitionBlock }
  | { ok: false; code: AcquisitionBlockError; message: string };

const REASON_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const KIND_PATTERN = /^[A-Z][A-Z0-9_]{2,32}$/;
const isStr = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max;

/**
 * Validates the optional `acquisition` block of POST /marketplace/v1/bookings (same rules as the contract schema `AcquisitionBlock`).
 * `undefined` or `null` is NOT an error: the caller treats it as UNATTRIBUTED. Unknown extra fields and unknown reason codes are accepted.
 */
export function parseAcquisitionBlock(input: unknown): AcquisitionParse {
  const bad = (code: AcquisitionBlockError, message: string): AcquisitionParse => ({ ok: false, code, message });
  if (input === undefined || input === null) return bad("ACQUISITION_BLOCK_INVALID", "absent");
  if (typeof input !== "object" || Array.isArray(input)) return bad("ACQUISITION_BLOCK_INVALID", "acquisition must be an object");
  const b = input as Record<string, unknown>;
  if (!(ACQUISITION_ORIGINS as readonly unknown[]).includes(b.origin)) return bad("ACQUISITION_BLOCK_INVALID", "origin");
  if (!isStr(b.decisionId, 1, 64)) return bad("ACQUISITION_BLOCK_INVALID", "decisionId");
  if (!isStr(b.policyVersion, 1, 64)) return bad("ACQUISITION_BLOCK_INVALID", "policyVersion");
  if (typeof b.reason !== "string" || !REASON_PATTERN.test(b.reason)) return bad("ACQUISITION_BLOCK_INVALID", "reason");
  if (typeof b.evidenceHash !== "string" || !HASH_PATTERN.test(b.evidenceHash)) return bad("ACQUISITION_EVIDENCE_HASH_INVALID", "evidenceHash must be 64 lowercase hex characters");
  if (b.touch !== undefined) {
    const t = b.touch as Record<string, unknown> | null;
    if (!t || typeof t !== "object" || typeof t.kind !== "string" || !KIND_PATTERN.test(t.kind) || !isStr(t.ref, 1, 64) || typeof t.at !== "string" || Number.isNaN(Date.parse(t.at))) {
      return bad("ACQUISITION_BLOCK_INVALID", "touch");
    }
  }
  return { ok: true, block: input as AcquisitionBlock };
}

/** Origin of a received block; absent or malformed reads as UNATTRIBUTED so today's rules apply unchanged. */
export function acquisitionOriginOf(input: unknown): AcquisitionOriginName {
  const r = parseAcquisitionBlock(input);
  return r.ok ? r.block.origin : "UNATTRIBUTED";
}

/** Deterministic JSON: sorted keys, no whitespace, `undefined` properties omitted, arrays keep order (identical to contracts `growthCanonicalJson`). */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string": return JSON.stringify(value);
    case "boolean": return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
    }
    default: throw new TypeError(`canonicalJson: unsupported ${typeof value}`);
  }
}

export interface DecisionInputs {
  booking: Record<string, unknown>;
  touches: Array<{ id: string; occurredAt: string }>;
  policyVersion: string;
  precedence?: string;
}

/** sha256 hex over the canonical decision inputs, format `v1` (identical to contracts `computeAttributionInputsHash`; the Clinic uses it for its own CommissionDecision inputsHash). */
export function computeInputsHash(inputs: DecisionInputs): string {
  const touches = [...inputs.touches].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const payload = { v: 1, booking: inputs.booking, touches: touches.map((t) => ({ id: t.id, at: t.occurredAt })), policyVersion: inputs.policyVersion, precedence: inputs.precedence ?? null };
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}
