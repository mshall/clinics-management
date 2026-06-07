import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultMonthRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

/** Wider default for encounter ledger (last 12 calendar months). */
export function defaultEncounterListRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

interface DateRangeState {
  from: string;
  to: string;
  setRange: (from: string, to: string) => void;
  resetToCurrentMonth: () => void;
}

const RANGE_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const useDateRangeStore = create<DateRangeState>()(
  persist(
    (set) => ({
      ...defaultMonthRange(),
      setRange: (from, to) => set({ from, to }),
      resetToCurrentMonth: () => set(defaultMonthRange()),
    }),
    {
      name: "cms-reporting-range",
      version: 2,
      migrate: (persisted, version) => {
        const fresh = defaultMonthRange();
        if (version < 2) return fresh;
        const p = persisted as { from?: unknown; to?: unknown };
        const from = typeof p.from === "string" ? p.from.trim() : "";
        const to = typeof p.to === "string" ? p.to.trim() : "";
        if (RANGE_DAY.test(from) && RANGE_DAY.test(to)) return { from, to };
        return fresh;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ from: s.from, to: s.to }),
    }
  )
);
