import { useCallback, useEffect, useMemo, useState } from "react";
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

  /** Call from SearchablePickList `onOpen` so server lists load immediately. */
  const handleOpen = useCallback(() => {
    resetSearch();
  }, [resetSearch]);

  return { search, setSearch, debounced, resetSearch, flushDebounced, handleOpen };
}

/** Stable handler that keeps a pinned row for server-driven pick lists. */
export function bindPickListValueChange(
  setValue: (value: string) => void,
  setPinned: (item: PickListItem | null) => void,
  items: PickListItem[],
): (value: string, item?: PickListItem) => void {
  return (next, item) => {
    setValue(next);
    if (item) {
      setPinned(item);
      return;
    }
    const fromList = items.find((row) => row.value === next);
    if (fromList) setPinned(fromList);
  };
}

/** Hook for server-driven SearchablePickList value + selectedItem wiring. */
export function usePickListValueBinding(
  value: string,
  setValue: (next: string) => void,
  items: PickListItem[],
  pinned: PickListItem | null,
  setPinned: (item: PickListItem | null) => void,
  ...extraSelected: Array<PickListItem | null | undefined>
) {
  const onValueChange = useCallback(
    (next: string, item?: PickListItem) => {
      setValue(next);
      if (item) {
        setPinned(item);
        return;
      }
      const fromList = items.find((row) => row.value === next);
      if (fromList) setPinned(fromList);
    },
    [items, setPinned, setValue],
  );

  const selectedItem = useMemo(
    () => resolvePickListSelectedItem(value, items, pinned, ...extraSelected),
    [value, items, pinned, ...extraSelected],
  );

  return { onValueChange, selectedItem };
}
