/**
 * HVBK03 — the visit address carried on a Kiorex hold and stored (encrypted) on HomeVisit.
 * Shape is the contract's `VisitAddress` (kiorex-contracts 1.5.0): {district, line1, building, floor, flat, landmark, lat, lng}.
 * Only `district` is required by the schema; HOME visit types additionally need line1 (a clinician cannot arrive at a district).
 */
export type VisitAddress = {
  district: string;
  line1?: string;
  building?: string;
  floor?: string;
  flat?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
};

export class VisitAddressError extends Error {
  constructor(
    readonly code: "VISIT_ADDRESS_REQUIRED" | "VISIT_ADDRESS_INVALID",
    message: string,
  ) {
    super(message);
  }
}

const TEXT_MAX = 200;
const FIELDS = ["line1", "building", "floor", "flat", "landmark"] as const;

function text(v: unknown, name: string): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v !== "string") throw new VisitAddressError("VISIT_ADDRESS_INVALID", `${name} must be a string`);
  const t = v.trim();
  if (t.length > TEXT_MAX) throw new VisitAddressError("VISIT_ADDRESS_INVALID", `${name} is too long`);
  return t || undefined;
}

/** Normalises a district code the same way @kiorly/field-visit does (lower-case slug), without importing it into pure DTO code. */
export function districtSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseVisitAddress(raw: unknown, opts: { requireLine1: boolean }): VisitAddress {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VisitAddressError("VISIT_ADDRESS_REQUIRED", "visitAddress is required for HOME visit types");
  }
  const r = raw as Record<string, unknown>;
  const district = typeof r.district === "string" ? districtSlug(r.district) : "";
  if (!district) throw new VisitAddressError("VISIT_ADDRESS_REQUIRED", "visitAddress.district is required");
  const out: VisitAddress = { district };
  for (const f of FIELDS) {
    const v = text(r[f], f);
    if (v) out[f] = v;
  }
  if (opts.requireLine1 && !out.line1) throw new VisitAddressError("VISIT_ADDRESS_REQUIRED", "visitAddress.line1 is required for HOME visit types");
  for (const f of ["lat", "lng"] as const) {
    if (r[f] == null) continue;
    if (typeof r[f] !== "number" || !Number.isFinite(r[f] as number)) throw new VisitAddressError("VISIT_ADDRESS_INVALID", `${f} must be a number`);
  }
  if ((r.lat == null) !== (r.lng == null)) throw new VisitAddressError("VISIT_ADDRESS_INVALID", "lat and lng go together");
  if (r.lat != null) {
    const lat = r.lat as number;
    const lng = r.lng as number;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new VisitAddressError("VISIT_ADDRESS_INVALID", "coordinates out of range");
    out.lat = lat;
    out.lng = lng;
  }
  return out;
}

/** What may be shown when the address is masked or the viewer is not entitled: district only (BR52). */
export function maskVisitAddress(a: Pick<VisitAddress, "district">): { district: string; masked: true } {
  return { district: a.district, masked: true };
}
