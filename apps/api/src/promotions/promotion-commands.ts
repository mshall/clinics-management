import { BadRequestException } from "@nestjs/common";

/** Strict parsing of the signed marketplace commands (contracts 1.12.0, additionalProperties false): an unknown key or a wrong type is a 400, never silently accepted. */
const obj = (b: unknown): Record<string, unknown> => { if (!b || typeof b !== "object" || Array.isArray(b)) throw new BadRequestException({ code: "INVALID_BODY" }); return b as Record<string, unknown>; };
const only = (o: Record<string, unknown>, keys: readonly string[]) => { for (const k of Object.keys(o)) if (!keys.includes(k)) throw new BadRequestException({ code: "INVALID_BODY", message: `unknown field ${k}` }); };
const str = (o: Record<string, unknown>, k: string, min = 1, max = 200) => { const v = o[k]; if (typeof v !== "string" || v.length < min || v.length > max) throw new BadRequestException({ code: "INVALID_BODY", message: `${k} is invalid` }); return v; };
const int = (o: Record<string, unknown>, k: string, min: number, max: number) => { const v = o[k]; if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new BadRequestException({ code: "INVALID_BODY", message: `${k} is invalid` }); return v; };

export function parseReserve(b: unknown) {
  const o = obj(b); only(o, ["version", "bookingRef", "patientRef", "careType", "amountMinor", "currency", "idempotencyKey"]);
  const careType = o.careType; if (careType !== "IN_CLINIC" && careType !== "VIDEO" && careType !== "HOME_VISIT") throw new BadRequestException({ code: "INVALID_BODY", message: "careType is invalid" });
  return { version: int(o, "version", 1, 1_000_000), bookingRef: str(o, "bookingRef"), patientRef: str(o, "patientRef"), careType, amountMinor: int(o, "amountMinor", 1, 2_147_483_647), currency: str(o, "currency", 3, 3), idempotencyKey: str(o, "idempotencyKey", 8, 128) };
}
export function parseRelease(b: unknown) {
  const o = obj(b); only(o, ["reservationRef", "idempotencyKey", "reason"]);
  const reason = o.reason === undefined ? undefined : str(o, "reason", 3, 64); if (reason && !/^[A-Z][A-Z0-9_]{2,63}$/.test(reason)) throw new BadRequestException({ code: "INVALID_BODY", message: "reason is invalid" });
  return { reservationRef: str(o, "reservationRef"), idempotencyKey: str(o, "idempotencyKey", 8, 128), reason };
}
/** Refund or dispute after completion (documented for contracts 1.12.1): the same shape as a release. */
export const parseReverse = parseRelease;
export function parseReviewDecision(b: unknown) {
  const o = obj(b); only(o, ["version", "reviewKind", "decision", "note", "decidedBy", "decidedAt"]);
  const reviewKind = o.reviewKind; if (reviewKind !== "CONTENT" && reviewKind !== "SCOPE" && reviewKind !== "HIGH_VALUE") throw new BadRequestException({ code: "INVALID_BODY", message: "reviewKind is invalid" });
  const decision = o.decision; if (decision !== "APPROVED" && decision !== "REJECTED" && decision !== "NEEDS_CHANGES") throw new BadRequestException({ code: "INVALID_BODY", message: "decision is invalid" });
  const note = o.note === undefined ? undefined : str(o, "note", 0, 300);
  const decidedAt = o.decidedAt === undefined ? undefined : str(o, "decidedAt", 10, 40); if (decidedAt && Number.isNaN(Date.parse(decidedAt))) throw new BadRequestException({ code: "INVALID_BODY", message: "decidedAt is invalid" });
  return { version: int(o, "version", 1, 1_000_000), reviewKind, decision, note, decidedBy: str(o, "decidedBy", 3, 100), decidedAt } as const;
}
export function parseSponsoredDiscountBlock(b: unknown): { promotionId: string; promotionVersion: number; reservationRef: string; amountMinor: number; currency: string } | null {
  if (b === undefined || b === null) return null;
  const o = obj(b); only(o, ["promotionId", "promotionVersion", "reservationRef", "amountMinor", "currency"]);
  return { promotionId: str(o, "promotionId"), promotionVersion: int(o, "promotionVersion", 1, 1_000_000), reservationRef: str(o, "reservationRef"), amountMinor: int(o, "amountMinor", 1, 2_147_483_647), currency: str(o, "currency", 3, 3) };
}
