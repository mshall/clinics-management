/** Normalize optional clinic allowlist from admin / integration client create payloads. */
export function normalizeAllowedClinicIds(ids: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids ?? []) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Returns clinic ids in `requested` that are not in `validTenantClinicIds`. */
export function findInvalidClinicAllowlistIds(requested: string[], validTenantClinicIds: Set<string>): string[] {
  return requested.filter((id) => !validTenantClinicIds.has(id));
}
