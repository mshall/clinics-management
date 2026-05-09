import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark";

export function applyThemeDom(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

/** Run before React mounts so the first paint matches persisted preference. */
export function applyThemeFromPersistedStorage() {
  try {
    const raw = localStorage.getItem("cms-theme");
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: { mode?: ThemeMode; persistDefault?: boolean } };
    const st = parsed.state;
    if (!st?.persistDefault) {
      applyThemeDom("light");
      return;
    }
    applyThemeDom(st.mode === "dark" ? "dark" : "light");
  } catch {
    applyThemeDom("light");
  }
}

interface ThemeState {
  mode: ThemeMode;
  /** When true, `mode` is saved and restored on the next visit (including the login screen). */
  persistDefault: boolean;
  setMode: (mode: ThemeMode) => void;
  setPersistDefault: (v: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "light",
      persistDefault: false,
      setMode: (mode) => {
        applyThemeDom(mode);
        set({ mode });
      },
      setPersistDefault: (persistDefault) => set({ persistDefault }),
    }),
    {
      name: "cms-theme",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) =>
        s.persistDefault ? { mode: s.mode, persistDefault: true } : { persistDefault: false },
      onRehydrateStorage: () => (state, err) => {
        if (err || !state) return;
        const effective: ThemeMode = state.persistDefault ? state.mode : "light";
        applyThemeDom(effective);
      },
    }
  )
);
