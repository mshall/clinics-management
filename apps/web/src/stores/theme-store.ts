import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Resolved theme applied to `document.documentElement`. */
export type ThemeId = "default-light" | "default-dark" | "material-light" | "material-dark";

export const THEME_IDS: ThemeId[] = [
  "default-light",
  "default-dark",
  "material-light",
  "material-dark",
];

const SESSION_THEME_KEY = "cms-theme-session";

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as string[]).includes(value);
}

export function isDarkTheme(themeId: ThemeId): boolean {
  return themeId === "default-dark" || themeId === "material-dark";
}

export function isMaterialTheme(themeId: ThemeId): boolean {
  return themeId.startsWith("material");
}

export function applyThemeDom(themeId: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  root.classList.toggle("dark", isDarkTheme(themeId));
  root.classList.toggle("theme-material", isMaterialTheme(themeId));
}

function readSessionTheme(): ThemeId | null {
  try {
    const value = sessionStorage.getItem(SESSION_THEME_KEY);
    return value && isThemeId(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSessionTheme(themeId: ThemeId) {
  try {
    sessionStorage.setItem(SESSION_THEME_KEY, themeId);
  } catch {
    // sessionStorage unavailable
  }
}

function migrateLegacyTheme(state: Record<string, unknown> | undefined): ThemeId {
  if (state && typeof state.themeId === "string" && isThemeId(state.themeId)) {
    return state.themeId;
  }
  if (state?.persistDefault && state.mode === "dark") return "default-dark";
  if (state?.persistDefault && state.mode === "light") return "default-light";
  return "default-light";
}

/** Run before React mounts so the first paint matches persisted preference. */
export function applyThemeFromPersistedStorage() {
  try {
    const sessionTheme = readSessionTheme();
    if (sessionTheme) {
      applyThemeDom(sessionTheme);
      return;
    }
    const raw = localStorage.getItem("cms-theme");
    if (!raw) {
      applyThemeDom("default-light");
      return;
    }
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const st = parsed.state;
    if (!st?.persistDefault) {
      applyThemeDom("default-light");
      return;
    }
    const themeId = migrateLegacyTheme(st);
    applyThemeDom(themeId);
    writeSessionTheme(themeId);
  } catch {
    applyThemeDom("default-light");
  }
}

interface ThemeState {
  themeId: ThemeId;
  /** When true, `themeId` is saved and restored on the next visit (including the login screen). */
  persistDefault: boolean;
  setThemeId: (themeId: ThemeId) => void;
  setPersistDefault: (v: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: "default-light",
      persistDefault: false,
      setThemeId: (themeId) => {
        applyThemeDom(themeId);
        writeSessionTheme(themeId);
        set({ themeId });
      },
      setPersistDefault: (persistDefault) => set({ persistDefault }),
    }),
    {
      name: "cms-theme",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) =>
        s.persistDefault ? { themeId: s.themeId, persistDefault: true } : { persistDefault: false },
      merge: (persisted, current) => {
        const p = persisted as Partial<ThemeState> | undefined;
        const sessionTheme = readSessionTheme();
        if (!p) {
          return sessionTheme ? { ...current, themeId: sessionTheme } : current;
        }
        const themeId =
          sessionTheme ??
          (p.persistDefault && typeof p.themeId === "string" && isThemeId(p.themeId)
            ? p.themeId
            : current.themeId);
        return {
          ...current,
          themeId,
          persistDefault: Boolean(p.persistDefault),
        };
      },
      onRehydrateStorage: () => (state, err) => {
        if (err || !state) return;
        const sessionTheme = readSessionTheme();
        if (sessionTheme) {
          applyThemeDom(sessionTheme);
          return;
        }
        if (state.persistDefault) {
          applyThemeDom(state.themeId ?? "default-light");
        }
      },
      migrate: (persisted: unknown) => {
        const p = persisted as { themeId?: string; mode?: string; persistDefault?: boolean } | undefined;
        if (!p) return { themeId: "default-light" as ThemeId, persistDefault: false };
        return {
          themeId: migrateLegacyTheme(p as Record<string, unknown>),
          persistDefault: Boolean(p.persistDefault),
        };
      },
      version: 2,
    },
  ),
);

/** @deprecated Use ThemeId — kept for gradual migration in imports. */
export type ThemeMode = "light" | "dark";
