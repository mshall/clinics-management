import type { TravelMatrix } from "./ports";

/** A district from the market pack's district list (HVCFG02). Polygons come later; districts are the unit today. */
export type District = { id: string; nameEn: string; nameAr: string };

export type Address = { districtId: string };

export type CoverageZone = {
  districtIds: string[];
  /** Optional maximum travel time from `startDistrictId` (HVCFG02). */
  maxTravelMinutes?: number | null;
  startDistrictId?: string | null;
};

export type CoverageResult =
  | { inZone: true }
  | { inZone: false; reason: "DISTRICT_NOT_COVERED" | "TRAVEL_TOO_LONG" | "TRAVEL_UNKNOWN" | "NO_DISTRICT" };

/** Stable district id: lower-case ASCII slug ("Nasr City" -> "nasr-city"). Arabic names keep their letters. */
export function normalizeDistrictId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Validate a market pack district list (ids unique and normalised, AR + EN names present). Throws with all problems. */
export function parseDistrictList(raw: unknown): District[] {
  const errors: string[] = [];
  if (!Array.isArray(raw)) throw new Error("districts must be an array");
  const seen = new Set<string>();
  const out: District[] = [];
  raw.forEach((d, i) => {
    const r = (d ?? {}) as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!id || normalizeDistrictId(id) !== id) errors.push(`districts[${i}].id must be a normalised slug`);
    if (seen.has(id)) errors.push(`districts[${i}].id duplicate: ${id}`);
    seen.add(id);
    if (typeof r.nameEn !== "string" || !r.nameEn.trim()) errors.push(`districts[${i}].nameEn required`);
    if (typeof r.nameAr !== "string" || !r.nameAr.trim()) errors.push(`districts[${i}].nameAr required`);
    out.push({ id, nameEn: String(r.nameEn ?? ""), nameAr: String(r.nameAr ?? "") });
  });
  if (errors.length) throw new Error(`Invalid district list: ${errors.join("; ")}`);
  return out;
}

/** HVBK01 — a home slot is offered only for addresses inside the clinician's coverage zone. */
export function isInCoverage(zone: CoverageZone, address: Address | null | undefined, matrix?: TravelMatrix): CoverageResult {
  const district = address?.districtId ? normalizeDistrictId(address.districtId) : "";
  if (!district) return { inZone: false, reason: "NO_DISTRICT" };
  if (!zone.districtIds.map(normalizeDistrictId).includes(district)) return { inZone: false, reason: "DISTRICT_NOT_COVERED" };
  if (zone.maxTravelMinutes != null && zone.startDistrictId) {
    const m = matrix?.minutes(normalizeDistrictId(zone.startDistrictId), district);
    if (m == null) return { inZone: false, reason: "TRAVEL_UNKNOWN" };
    if (m > zone.maxTravelMinutes) return { inZone: false, reason: "TRAVEL_TOO_LONG" };
  }
  return { inZone: true };
}

/** Matrix from a nested record `{ from: { to: minutes } }`; symmetric fallback; same district = 0; unknown = `fallbackMinutes` or null. */
export function buildTravelMatrix(entries: Record<string, Record<string, number>>, fallbackMinutes: number | null = null): TravelMatrix {
  return {
    minutes(from, to) {
      if (from === to) return 0;
      const direct = entries[from]?.[to] ?? entries[to]?.[from];
      return direct ?? fallbackMinutes;
    },
  };
}
