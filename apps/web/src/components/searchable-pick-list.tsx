import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Label fallback when `value` is set but not present in `items` (e.g. server search lists). */
  selectedItem?: PickListItem | null;
  className?: string;
  /** Show invalid styling (red border) for required-field feedback */
  invalid?: boolean;
}

type PanelRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
};

const PANEL_MAX_HEIGHT = 224;

function prefersCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function measurePanelRect(anchor: HTMLElement): PanelRect {
  const rect = anchor.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewportHeight = vv?.height ?? window.innerHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const spaceBelow = viewportHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const placement = spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow ? "above" : "below";
  const maxHeight = Math.min(
    PANEL_MAX_HEIGHT,
    Math.max(120, placement === "below" ? spaceBelow : spaceAbove),
  );
  const rawTop = placement === "below" ? rect.bottom + 4 : rect.top - maxHeight - 4;
  return {
    top: rawTop + offsetTop,
    left: rect.left + offsetLeft,
    width: rect.width,
    maxHeight,
    placement,
  };
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
  selectedItem,
  className,
  invalid,
}: SearchablePickListProps) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const inputId = `${uid}-input`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listenOutsideRef = useRef(false);
  const pickingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [panelRect, setPanelRect] = useState<PanelRect | null>(null);
  const skipAutofocus = useMemo(() => prefersCoarsePointer(), []);

  const filtered = useMemo(() => {
    const base = !localFilter
      ? selectedItem && value && !items.some((i) => i.value === value)
        ? [selectedItem, ...items]
        : items
      : items;
    if (!localFilter) return base;
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter(
      (i) =>
        i.label.toLowerCase().includes(t) ||
        (i.hint?.toLowerCase().includes(t) ?? false) ||
        i.value.toLowerCase().includes(t),
    );
  }, [items, q, localFilter, selectedItem, value]);

  const selectedLabel =
    items.find((i) => i.value === value)?.label ??
    (selectedItem?.value === value ? selectedItem.label : undefined);
  const displayText = selectedLabel ?? null;
  const meetsMinSearch = q.trim().length >= minSearchLength;

  const pick = useCallback(
    (next: string) => {
      onValueChange(next);
      setQ("");
      onSearchQueryChange?.("");
      setOpen(false);
    },
    [onValueChange, onSearchQueryChange],
  );

  const handlePick = useCallback(
    (next: string) => {
      if (disabled || pickingRef.current) return;
      pickingRef.current = true;
      pick(next);
      window.setTimeout(() => {
        pickingRef.current = false;
      }, 0);
    },
    [disabled, pick],
  );

  const closeWithoutPick = useCallback(() => {
    setOpen(false);
    setQ("");
    onSearchQueryChange?.("");
  }, [onSearchQueryChange]);

  const updatePanelRect = useCallback(() => {
    const anchor = inputRef.current ?? rootRef.current;
    if (!anchor) return;
    setPanelRect(measurePanelRect(anchor));
  }, []);

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      listenOutsideRef.current = false;
      return;
    }
    listenOutsideRef.current = true;
    updatePanelRect();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updatePanelRect);
    vv?.addEventListener("scroll", updatePanelRect);
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener("scroll", updatePanelRect, true);
    return () => {
      listenOutsideRef.current = false;
      vv?.removeEventListener("resize", updatePanelRect);
      vv?.removeEventListener("scroll", updatePanelRect);
      window.removeEventListener("resize", updatePanelRect);
      window.removeEventListener("scroll", updatePanelRect, true);
    };
  }, [open, updatePanelRect]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!listenOutsideRef.current) return;
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
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
    if (!open || skipAutofocus) return;
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      updatePanelRect();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, skipAutofocus, updatePanelRect]);

  const listbox =
    open && panelRect
      ? createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            data-pick-list-panel
            style={{
              position: "fixed",
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
              maxHeight: panelRect.maxHeight,
              zIndex: 10001,
            }}
            className="overflow-auto overscroll-contain rounded-md border border-border bg-background shadow-lg [-webkit-overflow-scrolling:touch] [touch-action:manipulation]"
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
                    "flex w-full min-h-11 cursor-pointer flex-col gap-0.5 border-b border-border px-3 py-2.5 text-start text-sm last:border-b-0 hover:bg-muted/60 active:bg-muted/80 disabled:opacity-50 touch-manipulation [-webkit-tap-highlight-color:transparent]",
                    value === i.value && "bg-muted/80",
                  )}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePick(i.value);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePick(i.value);
                  }}
                >
                  <span className="font-medium">{i.label}</span>
                  {i.hint ? <span className="text-xs text-muted-foreground">{i.hint}</span> : null}
                </button>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} data-pick-list-root className={cn("relative space-y-1", className)}>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={false}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-start text-sm shadow-sm transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]",
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
        <Input
          ref={inputRef}
          id={inputId}
          dir="auto"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          readOnly={skipAutofocus && !q}
          className={cn("h-11 touch-manipulation", invalid && "border-destructive ring-1 ring-destructive")}
          placeholder={searchPlaceholder}
          value={q}
          disabled={disabled}
          onFocus={() => {
            if (skipAutofocus && inputRef.current?.readOnly) {
              inputRef.current.readOnly = false;
            }
            updatePanelRect();
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (inputRef.current?.readOnly) inputRef.current.readOnly = false;
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
      )}
      {listbox}
      {!open ? (
        <p className="text-xs text-muted-foreground">
          {displayText ? (
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
