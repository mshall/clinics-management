/** Shared classes for native form controls — 44px min touch targets on mobile. */
export const nativeSelectClassName =
  "flex h-11 min-h-11 w-full touch-manipulation rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

/** Mobile-friendly stacked layout for ledger/search filter cards. */
export const searchLedgerLayoutClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,11rem)] lg:items-end";

export const searchLedgerActionsClassName = "flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3";
