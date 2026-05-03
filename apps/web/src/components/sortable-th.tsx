import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SortOrder = "asc" | "desc";

export function toggleSort(currentBy: string, currentDir: SortOrder, column: string): { sortBy: string; sortOrder: SortOrder } {
  if (currentBy === column) return { sortBy: column, sortOrder: currentDir === "asc" ? "desc" : "asc" };
  return { sortBy: column, sortOrder: "asc" };
}

interface SortableThProps {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (column: string) => void;
  className?: string;
  /** Center header label and sort control (e.g. narrow columns). */
  align?: "start" | "center";
  /** Optional “contains” filter under the sort control (client-side tables). */
  filterValue?: string;
  onFilterChange?: (value: string) => void;
}

/** Native `<button>` avoids shadcn `Button`’s `[&_svg]:pointer-events-none`, which broke header-sort clicks on icons. */
export function SortableTh({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
  className,
  align = "start",
  filterValue,
  onFilterChange,
}: SortableThProps) {
  const active = sortBy === column;
  const centered = align === "center";
  const hasFilter = onFilterChange != null;

  const sortButton = (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        centered ? "mx-auto w-full max-w-full justify-center" : "-ms-2 justify-start",
        hasFilter && "w-full min-w-0 justify-start -ms-0"
      )}
      onClick={() => onSort(column)}
    >
      <span className="min-w-0 truncate">{label}</span>
      {active ? (
        sortOrder === "asc" ? (
          <ArrowUp className="size-3.5 shrink-0 opacity-80" aria-hidden />
        ) : (
          <ArrowDown className="size-3.5 shrink-0 opacity-80" aria-hidden />
        )
      ) : (
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden />
      )}
    </button>
  );

  if (!hasFilter) {
    return (
      <th className={cn("px-3 py-2 font-medium", centered ? "text-center" : "text-start", className)}>
        {sortButton}
      </th>
    );
  }

  return (
    <th className={cn("align-top px-3 py-2 font-medium", centered ? "text-center" : "text-start", className)}>
      <div className={cn("space-y-1", centered && "flex flex-col items-stretch")}>
        {sortButton}
        <Input
          className={cn("h-8 text-xs", centered && "text-center")}
          value={filterValue}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="…"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </th>
  );
}

/** Label row aligned with {@link SortableTh} (h-8, text-sm); invisible icon reserves the same width as sort chevrons. */
function filterColumnLabelRow(label: string, centered: boolean) {
  return (
    <div
      className={cn(
        "inline-flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground",
        centered ? "mx-auto justify-center" : "justify-start"
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <ChevronsUpDown className="pointer-events-none size-3.5 shrink-0 invisible" aria-hidden />
    </div>
  );
}

/** Non-sortable column header with a contains filter. */
export function FilterTh({
  label,
  value,
  onChange,
  className,
  align = "start",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  align?: "start" | "center";
}) {
  const centered = align === "center";
  return (
    <th className={cn("align-top px-3 py-2 font-medium", centered ? "text-center" : "text-start", className)}>
      <div className={cn("space-y-1", centered && "flex flex-col items-stretch")}>
        {filterColumnLabelRow(label, centered)}
        <Input
          className={cn("h-8 text-xs", centered && "text-center")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="…"
        />
      </div>
    </th>
  );
}
