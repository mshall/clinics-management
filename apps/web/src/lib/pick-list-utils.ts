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
