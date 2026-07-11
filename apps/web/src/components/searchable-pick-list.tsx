import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { focusTextInput } from "@/lib/focus-input";
import { filterPickListItems } from "@/lib/pick-list-utils";
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
  /** Called when the dropdown opens — use to prefetch server lists without waiting for debounce. */
  onOpen?: () => void;
  /** Minimum typed chars before the full result list is shown while open. */
  minSearchLength?: number;
  /** Message shown while waiting for minimum search length and no preview rows exist. */
  idleMessage?: string;
  /** How many options to show immediately on open before `minSearchLength` is met (0 disables). */
  previewCount?: number;
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
const DEFAULT_PREVIEW_COUNT = 4;
const OUTSIDE_LISTEN_DELAY_MS = 80;

function measurePanelRect(anchor: HTMLElement): PanelRect {
  const rect = anchor.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewportHeight = vv?.height ?? window.innerHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const spaceBelow = viewportHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const keyboardLikely = viewportHeight < window.innerHeight * 0.75;
  const placement =
    keyboardLikely || (spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow) ? "above" : "below";
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

function scheduleMobileFocus(el: HTMLInputElement | null | undefined): void {
  window.requestAnimationFrame(() => {
    focusTextInput(el);
    window.requestAnimationFrame(() => focusTextInput(el));
  });
}

function resolveItemLabel(
  pickValue: string,
  items: PickListItem[],
  selectedItem: PickListItem | null | undefined,
  pinnedItem: PickListItem | null,
): string | null {
  if (!pickValue.trim()) return null;
  const fromList = items.find((i) => i.value === pickValue);
  if (fromList) return fromList.label;
  if (selectedItem?.value === pickValue) return selectedItem.label;
  if (pinnedItem?.value === pickValue) return pinnedItem.label;
  return null;
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
  onOpen,
  minSearchLength = 0,
  idleMessage = "Start typing to search.",
  previewCount = DEFAULT_PREVIEW_COUNT,
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
  const [pinnedItem, setPinnedItem] = useState<PickListItem | null>(null);

  useEffect(() => {
    if (!value.trim()) {
      setPinnedItem(null);
      return;
    }
    setPinnedItem((prev) => {
      const resolved =
        items.find((i) => i.value === value) ??
        (selectedItem?.value === value ? selectedItem : null) ??
        (prev?.value === value ? prev : null);
      return resolved ?? prev;
    });
  }, [value, items, selectedItem]);

  const filtered = useMemo(() => {
    const base = !localFilter
      ? selectedItem && value && !items.some((i) => i.value === value)
        ? [selectedItem, ...items]
        : items
      : items;
    return filterPickListItems(base, q);
  }, [items, q, localFilter, selectedItem, value]);

  const displayText = resolveItemLabel(value, items, selectedItem, pinnedItem);
  const trimmedQ = q.trim();
  const isSearching = trimmedQ.length > 0;
  const meetsMinSearch = trimmedQ.length >= minSearchLength;
  const showingPreview = open && (!isSearching || !meetsMinSearch) && previewCount > 0 && filtered.length > 0;

  const listItems = useMemo(() => {
    if (!open) return [];
    if (isSearching && meetsMinSearch) return filtered;
    if (previewCount > 0 && filtered.length > 0) return filtered.slice(0, previewCount);
    return [];
  }, [open, isSearching, meetsMinSearch, filtered, previewCount]);

  const pick = useCallback(
    (next: string, item?: PickListItem) => {
      const resolved =
        item ??
        items.find((i) => i.value === next) ??
        (selectedItem?.value === next ? selectedItem : null);
      if (resolved) setPinnedItem(resolved);
      onValueChange(next);
      setQ("");
      onSearchQueryChange?.("");
      setOpen(false);
    },
    [items, onValueChange, onSearchQueryChange, selectedItem],
  );

  const handlePick = useCallback(
    (next: string, item: PickListItem) => {
      if (disabled || pickingRef.current) return;
      pickingRef.current = true;
      pick(next, item);
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

  const openForSearch = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQ("");
    onSearchQueryChange?.("");
    onOpen?.();
    scheduleMobileFocus(inputRef.current);
    updatePanelRect();
  }, [disabled, onOpen, onSearchQueryChange, updatePanelRect]);

  useEffect(() => {
    if (!open) {
      setPanelRect(null);
      listenOutsideRef.current = false;
      return;
    }
    listenOutsideRef.current = false;
    updatePanelRect();
    const enableOutsideTimer = window.setTimeout(() => {
      listenOutsideRef.current = true;
    }, OUTSIDE_LISTEN_DELAY_MS);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updatePanelRect);
    vv?.addEventListener("scroll", updatePanelRect);
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener("scroll", updatePanelRect, true);
    const focusTimer = window.setTimeout(() => scheduleMobileFocus(inputRef.current), 0);
    return () => {
      listenOutsideRef.current = false;
      window.clearTimeout(enableOutsideTimer);
      window.clearTimeout(focusTimer);
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

  const hasSelection = Boolean(displayText);

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
            {showingPreview && (minSearchLength > 0 || !isSearching) ? (
              <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{idleMessage}</p>
            ) : null}
            {listItems.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{showingPreview ? emptyMessage : idleMessage}</p>
            ) : (
              listItems.map((i, idx) => (
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
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePick(i.value, i);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePick(i.value, i);
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
    <div ref={rootRef} data-pick-list-root className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          dir="auto"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          inputMode="text"
          className={cn(
            "h-11 touch-manipulation pe-9",
            invalid && "border-destructive ring-1 ring-destructive",
          )}
          placeholder={open ? searchPlaceholder : placeholder}
          value={open ? q : (displayText ?? "")}
          disabled={disabled}
          onFocus={() => {
            if (!open) openForSearch();
            else updatePanelRect();
          }}
          onClick={() => {
            if (!open) openForSearch();
            else scheduleMobileFocus(inputRef.current);
          }}
          onChange={(e) => {
            if (!open) {
              setOpen(true);
              onOpen?.();
            }
            const v = e.target.value;
            setQ(v);
            onSearchQueryChange?.(v);
          }}
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
          role="combobox"
          aria-expanded={open}
          onKeyDown={(e) => {
            if (!open && hasSelection && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              openForSearch();
              setQ(e.key);
              onSearchQueryChange?.(e.key);
              e.preventDefault();
              return;
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              closeWithoutPick();
            }
          }}
        />
        <ChevronDown
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 shrink-0 opacity-50"
          aria-hidden
        />
      </div>
      {listbox}
    </div>
  );
}
