/** Shared selectors so modal layers (Dialog/Sheet) do not swallow pick-list taps. */
export const PICK_LIST_PANEL_SELECTOR = "[data-pick-list-panel]";
export const PICK_LIST_ROOT_SELECTOR = "[data-pick-list-root]";

export function isPickListPortalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(PICK_LIST_PANEL_SELECTOR) !== null || target.closest(PICK_LIST_ROOT_SELECTOR) !== null
  );
}
