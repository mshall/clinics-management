import { useCallback, useEffect, useState } from "react";
import type { PickListItem } from "@/components/searchable-pick-list";

/** Resolve a pick-list label when the value may not be in the current search results. */
export function resolvePickListSelectedItem(
  value: string,
  items: PickListItem[],
  ...fallbacks: Array<PickListItem | null | undefined>
): PickListItem | null {
  if (!value.trim()) return null;
  const fromList = items.find((i) => i.value === value);
  if (fromList) return fromList;
  for (const fallback of fallbacks) {
    if (fallback?.value === value) return fallback;
  }
  return null;
}

/** Instant client-side filter for pick-list rows (used even when the list is server-driven). */
export function filterPickListItems(items: PickListItem[], query: string): PickListItem[] {
  const t = query.trim().toLowerCase();
  if (!t) return items;
  return items.filter(
    (i) =>
      i.label.toLowerCase().includes(t) ||
      (i.hint?.toLowerCase().includes(t) ?? false) ||
      i.value.toLowerCase().includes(t),
  );
}

const PICK_LIST_SEARCH_DEBOUNCE_MS = 120;

/** Debounced search state for server-driven SearchablePickList parents. */
export function useDebouncedPickListSearch(initial = "", debounceMs = PICK_LIST_SEARCH_DEBOUNCE_MS) {
  const [search, setSearch] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  useEffect(() => {
    const tid = window.setTimeout(() => setDebounced(search), debounceMs);
    return () => window.clearTimeout(tid);
  }, [search, debounceMs]);

  const resetSearch = useCallback(() => {
    setSearch("");
    setDebounced("");
  }, []);

  const flushDebounced = useCallback(() => {
    setDebounced(search);
  }, [search]);

  return { search, setSearch, debounced, resetSearch, flushDebounced };
}
