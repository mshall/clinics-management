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
  className?: string;
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
  className,
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

  const pick = useCallback(
    (next: string) => {
      onValueChange(next);
      setQ("");
      setOpen(false);
    },
    [onValueChange]
  );

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(t);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("space-y-1", className)}>
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
            disabled && "cursor-not-allowed opacity-50"
          )}
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            setQ("");
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
            className="ltr-nums"
            placeholder={searchPlaceholder}
            value={q}
            disabled={disabled}
            onChange={(e) => setQ(e.target.value)}
            aria-autocomplete="list"
            aria-controls={listboxId}
            role="combobox"
            aria-expanded
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          />
          <div
            id={listboxId}
            role="listbox"
            className="max-h-44 overflow-auto rounded-md border border-border bg-background shadow-sm"
          >
            {filtered.length === 0 ? (
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
