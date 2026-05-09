import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalize UI and user input for client-side "contains" column filters.
 * Maps typographic dashes (e.g. em dash in "MRN — Name" vs typed hyphen) and NBSP.
 */
export function normalizeColumnFilterText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\u00a0/g, " ");
}

/** True when `needle` is empty, or normalized `haystack` contains normalized `needle`. */
export function columnFilterIncludes(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true;
  return normalizeColumnFilterText(haystack).includes(normalizeColumnFilterText(needle));
}
