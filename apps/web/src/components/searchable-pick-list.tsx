import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PickListItem {
  value: string;
  label: string;
  hint?: string;
}

interface SearchablePickListProps {
  items: PickListItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** When false, parent is responsible for filtering (e.g. server search); all `items` are shown. */
  localFilter?: boolean;
  /** When the search box changes (while open); use with `localFilter={false}` for server-driven lists. */
  onSearchQueryChange?: (query: string) => void;
  /** Minimum typed chars before options are shown while open. */
  minSearchLength?: number;
  /** Message shown while waiting for minimum search length. */
  idleMessage?: string;
  className?: string;
  /** Show invalid styling (red border) for required-field feedback */
  invalid?: boolean;
}

export function SearchablePickList({
  items,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to filter…",
  emptyMessage = "No matches.",
  disabled,
  localFilter = true,
  onSearchQueryChange,
  minSearchLength = 0,
  idleMessage = "Start typing to search.",
  className,
  invalid,
}: SearchablePickListProps) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const inputId = `${uid}-input`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!localFilter) return items;
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(t) ||
        (i.hint?.toLowerCase().includes(t) ?? false) ||
        i.value.toLowerCase().includes(t)
    );
  }, [items, q, localFilter]);

  const selectedLabel = items.find((i) => i.value === value)?.label;
  const displayText = selectedLabel ?? (value ? value.slice(0, 8) : null);
  const meetsMinSearch = q.trim().length >= minSearchLength;

  const pick = useCallback(
    (next: string) => {
      onValueChange(next);
      setQ("");
      onSearchQueryChange?.("");
      setOpen(false);
    },
    [onValueChange, onSearchQueryChange]
  );

  const closeWithoutPick = useCallback(() => {
    setOpen(false);
    setQ("");
    onSearchQueryChange?.("");
  }, [onSearchQueryChange]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      closeWithoutPick();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWithoutPick();
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeWithoutPick]);

  useEffect(() => {
    if (!open) return;
    const t = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(t);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative space-y-1", className)}>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={false}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-start text-sm shadow-sm transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !displayText && "text-muted-foreground",
            disabled && "cursor-not-allowed opacity-50",
            invalid && "border-destructive ring-1 ring-destructive",
          )}
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            setQ("");
            onSearchQueryChange?.("");
          }}
        >
          <span className="min-w-0 flex-1 truncate">{displayText ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      ) : (
        <>
          <Input
            ref={inputRef}
            id={inputId}
            className={cn("ltr-nums", invalid && "border-destructive ring-1 ring-destructive")}
            placeholder={searchPlaceholder}
            value={q}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              onSearchQueryChange?.(v);
            }}
            aria-autocomplete="list"
            aria-controls={listboxId}
            role="combobox"
            aria-expanded
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                closeWithoutPick();
              }
            }}
          />
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-auto rounded-md border border-border bg-background shadow-md"
          >
            {!meetsMinSearch ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{idleMessage}</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{emptyMessage}</p>
            ) : (
              filtered.map((i, idx) => (
                <button
                  key={`${i.value}::${idx}`}
                  type="button"
                  role="option"
                  aria-selected={value === i.value}
                  disabled={disabled}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-start text-sm last:border-b-0 hover:bg-muted/60 disabled:opacity-50",
                    value === i.value && "bg-muted/80"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    if (disabled) return;
                    pick(i.value);
                  }}
                >
                  <span className="font-medium">{i.label}</span>
                  {i.hint ? <span className="text-xs text-muted-foreground ltr-nums">{i.hint}</span> : null}
                </button>
              ))
            )}
          </div>
        </>
      )}
      {!open ? (
        <p className="text-xs text-muted-foreground">
          {value ? (
            <>
              {placeholder}: <span className="font-medium text-foreground">{displayText}</span>
            </>
          ) : (
            placeholder
          )}
        </p>
      ) : null}
    </div>
  );
}
