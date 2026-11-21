
export function toggleSort(currentBy: string, currentDir: SortOrder, column: string): { sortBy: string; sortOrder: SortOrder } {
  if (currentBy === column) return { sortBy: column, sortOrder: currentDir === "asc" ? "desc" : "asc" };
  return { sortBy: column, sortOrder: "asc" };
}

export type SortOrder = "asc" | "desc";
