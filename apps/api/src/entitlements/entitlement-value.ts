export type EntitlementValue = boolean | number | Record<string, unknown>;

export function parseEntitlementValue(raw: unknown): EntitlementValue {
  if (typeof raw === "boolean" || typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return Boolean(raw);
}

export function entitlementTruthy(value: EntitlementValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return true;
}

export function entitlementLimit(value: EntitlementValue | undefined): number | null {
  if (value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? null : 0;
  return null;
}