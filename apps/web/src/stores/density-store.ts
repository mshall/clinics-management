import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";

function apply(d: Density) {
  if (typeof document !== "undefined") document.documentElement.dataset.density = d;
}

/** Row/card density (comfortable by default; compact for front-desk power users). Persisted per device. */
export const useDensityStore = create<{ density: Density; setDensity: (d: Density) => void; toggle: () => void }>()(
  persist(
    (set, get) => ({
      density: "comfortable",
      setDensity: (density) => { apply(density); set({ density }); },
      toggle: () => get().setDensity(get().density === "compact" ? "comfortable" : "compact"),
    }),
    { name: "cms-density", onRehydrateStorage: () => (s) => { if (s) apply(s.density); } },
  ),
);
