import { useSyncExternalStore } from "react";

export function useNurseEditionDom(): boolean {
  return useSyncExternalStore(subscribeEditionAttr, readNurseEdition, () => false);
}

/** Reactive: true while the Nurse edition is applied (`html[data-edition="nurse"]`, set by EditionBoot). */
export function subscribeEditionAttr(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-edition"] });
  return () => mo.disconnect();
}

export function readNurseEdition(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.edition === "nurse";
}
