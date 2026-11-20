/** Shared classes for native form controls — 44px min touch targets on mobile. */
export const nativeSelectClassName =
  "flex h-11 min-h-11 w-full min-w-0 touch-manipulation rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

/** Page root stack — prevents flex children from blowing past the viewport. */
export const pageStackClassName = "min-w-0 space-y-6";

/** Responsive filter row: stacked full-width fields on phones, 2-col grid, wrapped row on large screens. */
export const filterToolbarClassName =
  "grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:flex xl:flex-wrap xl:items-end";

/** Single filter field inside {@link filterToolbarClassName}. */
export const filterFieldClassName = "min-w-0 w-full space-y-1.5 xl:min-w-36 xl:max-w-[16rem] xl:flex-1";

/** Tighter filter row (admin chips, small toolbars). */
export const filterToolbarCompactClassName =
  "grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-end";

/** Action buttons below or beside filters. */
export const filterActionsClassName =
  "col-span-full flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap xl:w-auto";

/** Mobile-friendly stacked layout for ledger/search filter cards. */
export const searchLedgerLayoutClassName =
  "grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,11rem)] lg:items-end";

export const searchLedgerActionsClassName = "col-span-full flex flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap lg:col-span-3";
