/** Coarse geostamp (~1 km): lat/lng rounded to 2 decimals. Precise coordinates never enter the visit lifecycle. */
export type Geostamp = { lat: number; lng: number; districtId?: string };

export const GEOSTAMP_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 12 months, then district only (KX-23 / HV retention)

export function coarsen(lat: number, lng: number, districtId?: string): Geostamp {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("INVALID_COORDINATES");
  const r = (n: number) => Math.round(n * 100) / 100;
  return { lat: r(lat), lng: r(lng), ...(districtId ? { districtId } : {}) };
}

/** After 12 months only the district survives. Returns what may still be stored for a geostamp taken at `atMs`. */
export function retainGeostamp(g: Geostamp, atMs: number, nowMs: number): Geostamp | { districtId?: string } {
  if (nowMs - atMs < GEOSTAMP_RETENTION_MS) return g;
  return g.districtId ? { districtId: g.districtId } : {};
}
