export type SortDir = "asc" | "desc";

export function parseSortOrder(raw?: string): SortDir {
  return raw?.toLowerCase() === "asc" ? "asc" : "desc";
}

export function pickSortField<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value && (allowed as readonly string[]).includes(value)) return value as T;
  return fallback;
}
