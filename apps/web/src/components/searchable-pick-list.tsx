import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { focusTextInput } from "@/lib/focus-input";
import { filterPickListItems } from "@/lib/pick-list-utils";
import { PICK_LIST_PANEL_SELECTOR } from "@/lib/pick-list-portal";
import { cn } from "@/lib/utils";

export interface PickListItem {
  value: string;
  label: string;
  hint?: string;
}

interface SearchablePickListProps {
  items: PickListItem[];
  value: string;
  onValueChange: (value: string, item?: PickListItem) => void;
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
  /** Keep a text input visible (editable combobox) instead of a read-only closed button. */
  alwaysEditable?: boolean;
}

const DEFAULT_PREVIEW_COUNT = 4;
const PICK_GUARD_MS = 500;
const PORTAL_LIST_CAP = 50;

function usePortalPanelStyle(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null,
  );

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(224, Math.max(120, openUp ? spaceAbove : spaceBelow));
    setStyle({
      top: openUp ? rect.top - maxHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  return style;
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
  committedLabel: string | null,
): string | null {
  if (!pickValue.trim()) return null;
  const fromList = items.find((i) => i.value === pickValue);
  if (fromList) return fromList.label;
  if (selectedItem?.value === pickValue) return selectedItem.label;
  if (pinnedItem?.value === pickValue) return pinnedItem.label;
  if (committedLabel) return committedLabel;
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
  alwaysEditable = false,
}: SearchablePickListProps) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const inputId = `${uid}-input`;
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);
  const pickingUntilRef = useRef(0);
  const lastPickRef = useRef<{ value: string; at: number } | null>(null);
  const committedLabelRef = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [closedText, setClosedText] = useState("");
  const [pinnedItem, setPinnedItem] = useState<PickListItem | null>(null);

  const markPicking = useCallback(() => {
    pickingRef.current = true;
    pickingUntilRef.current = Date.now() + PICK_GUARD_MS;
    window.setTimeout(() => {
      pickingRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    if (!value.trim()) {
      setPinnedItem(null);
      committedLabelRef.current = null;
      if (!open) setClosedText("");
      return;
    }
    setPinnedItem((prev) => {
      const resolved =
        items.find((i) => i.value === value) ??
        (selectedItem?.value === value ? selectedItem : null) ??
        (prev?.value === value ? prev : null);
      if (resolved) {
        committedLabelRef.current = resolved.label;
        if (!open) setClosedText(resolved.label);
      }
      return resolved ?? prev;
    });
  }, [value, items, selectedItem, open]);

  const filtered = useMemo(() => {
    const base = !localFilter
      ? selectedItem && value && !items.some((i) => i.value === value)
        ? [selectedItem, ...items]
        : items
      : items;
    return localFilter ? filterPickListItems(base, q) : base;
  }, [items, q, localFilter, selectedItem, value]);

  const displayText = resolveItemLabel(value, items, selectedItem, pinnedItem, committedLabelRef.current);
  const trimmedQ = q.trim();
  const isSearching = trimmedQ.length > 0;
  const meetsMinSearch = trimmedQ.length >= minSearchLength;
  const showingPreview = open && (!isSearching || !meetsMinSearch) && previewCount > 0 && filtered.length > 0;

  const panelStyle = usePortalPanelStyle(open, anchorRef);

  const listItems = useMemo(() => {
    if (!open) return [];
    if (localFilter && trimmedQ.length === 0) {
      return filtered.slice(0, PORTAL_LIST_CAP);
    }
    if (isSearching && meetsMinSearch) return filtered.slice(0, PORTAL_LIST_CAP);
    if (previewCount > 0 && filtered.length > 0) return filtered.slice(0, previewCount);
    return [];
  }, [open, localFilter, trimmedQ, isSearching, meetsMinSearch, filtered, previewCount]);

  const syncClosedText = useCallback(
    (next: string) => {
      setClosedText(next);
      onSearchQueryChange?.(next);
    },
    [onSearchQueryChange],
  );

  const pick = useCallback(
    (next: string, item?: PickListItem) => {
      const resolved =
        item ??
        items.find((i) => i.value === next) ??
        (selectedItem?.value === next ? selectedItem : null);
      const label = resolved?.label ?? "";
      if (resolved) {
        committedLabelRef.current = label;
        setPinnedItem(resolved);
      }
      markPicking();
      onValueChange(next, resolved ?? undefined);
      setQ(label);
      syncClosedText(label);
      setOpen(false);
      window.requestAnimationFrame(() => focusTextInput(inputRef.current));
    },
    [items, markPicking, onValueChange, selectedItem, syncClosedText],
  );

  const handlePick = useCallback(
    (next: string, item: PickListItem) => {
      if (disabled) return;
      const now = Date.now();
      if (lastPickRef.current?.value === next && now - lastPickRef.current.at < 600) return;
      if (pickingRef.current || now < pickingUntilRef.current) return;
      lastPickRef.current = { value: next, at: now };
      pick(next, item);
    },
    [disabled, pick],
  );

  const closeWithoutPick = useCallback(() => {
    if (pickingRef.current || Date.now() < pickingUntilRef.current) return;
    setOpen(false);
    if (alwaysEditable) {
      const label = displayText ?? closedText;
      if (label) {
        setQ(label);
        syncClosedText(label);
      } else if (q.trim()) {
        syncClosedText(q);
      }
    } else {
      setQ("");
      onSearchQueryChange?.("");
    }
  }, [alwaysEditable, closedText, displayText, onSearchQueryChange, q, syncClosedText]);

  const openPicker = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    const seed = displayText ?? closedText ?? q;
    setQ(seed);
    onSearchQueryChange?.(seed);
    onOpen?.();
    scheduleMobileFocus(inputRef.current);
  }, [closedText, disabled, displayText, onOpen, onSearchQueryChange, q]);

  const handleInputChange = useCallback(
    (next: string) => {
      setQ(next);
      setOpen(true);
      onSearchQueryChange?.(next);
      if (value && displayText && next.trim() !== displayText.trim()) {
        onValueChange("", undefined);
        committedLabelRef.current = null;
        setPinnedItem(null);
        setClosedText("");
      }
    },
    [displayText, onSearchQueryChange, onValueChange, value],
  );

  const inputValue = open ? q : closedText || displayText || q;

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (pickingRef.current || Date.now() < pickingUntilRef.current) return;
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(PICK_LIST_PANEL_SELECTOR)) return;
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

  const selectOption = useCallback(
    (item: PickListItem) => (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handlePick(item.value, item);
    },
    [handlePick],
  );

  const listPanel = (
    <div
      id={listboxId}
      role="listbox"
      data-pick-list-panel
      className="fixed z-[300] overflow-auto overscroll-contain rounded-md border border-border bg-background shadow-lg [-webkit-overflow-scrolling:touch] [touch-action:manipulation]"
      style={
        panelStyle
          ? {
              top: panelStyle.top,
              left: panelStyle.left,
              width: panelStyle.width,
              maxHeight: panelStyle.maxHeight,
            }
          : undefined
      }
      onPointerDownCapture={() => {
        pickingUntilRef.current = Date.now() + PICK_GUARD_MS;
      }}
    >
      {showingPreview && minSearchLength > 0 && !meetsMinSearch ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{idleMessage}</p>
      ) : null}
      {listItems.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{isSearching ? emptyMessage : idleMessage}</p>
      ) : (
        listItems.map((i, idx) => (
          <button
            key={`${i.value}::${idx}`}
            type="button"
            role="option"
            aria-selected={value === i.value}
            disabled={disabled}
            className={cn(
              "flex w-full min-h-11 cursor-pointer flex-col gap-0.5 border-b border-border px-3 py-2.5 text-start text-sm last:border-b-0 hover:bg-muted/60 active:bg-muted/80 disabled:opacity-50 touch-manipulation select-none [-webkit-tap-highlight-color:transparent]",
              value === i.value && "bg-muted/80",
            )}
            onPointerDown={selectOption(i)}
            onClick={selectOption(i)}
          >
            <span className="font-medium">{i.label}</span>
            {i.hint ? <span className="text-xs text-muted-foreground">{i.hint}</span> : null}
          </button>
        ))
      )}
    </div>
  );

  const editableField = (
    <div ref={anchorRef} className="relative">
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
        inputMode="search"
        className={cn(
          "h-11 touch-manipulation pe-9",
          invalid && "border-destructive ring-1 ring-destructive",
        )}
        placeholder={open ? searchPlaceholder : placeholder}
        value={inputValue}
        disabled={disabled}
        onFocus={() => openPicker()}
        onClick={() => {
          if (!open) openPicker();
        }}
        onChange={(e) => handleInputChange(e.target.value)}
        aria-autocomplete="list"
        aria-controls={listboxId}
        role="combobox"
        aria-expanded={open}
        onKeyDown={(e) => {
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
      {open && panelStyle ? createPortal(listPanel, document.body) : null}
    </div>
  );

  return (
    <div ref={rootRef} data-pick-list-root className={cn("relative", className)}>
      {alwaysEditable ? (
        editableField
      ) : !open ? (
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={false}
          aria-controls={listboxId}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-start text-sm shadow-sm transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !displayText && "text-muted-foreground",
            disabled && "cursor-not-allowed opacity-50",
            invalid && "border-destructive ring-1 ring-destructive",
          )}
          onClick={() => openPicker()}
        >
          <span className="min-w-0 flex-1 truncate">{displayText ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      ) : (
        editableField
      )}
    </div>
  );
}
