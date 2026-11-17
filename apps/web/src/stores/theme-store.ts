import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { syncThemeFonts } from "../lib/theme-fonts";

/** Resolved theme applied to `document.documentElement`. */
export type ThemeId =
  | "default-light"
  | "default-dark"
  | "material-light"
  | "material-dark"
  | "clinical-os-light"
  | "clinical-os-dark";

/** Product default (Clinical OS light) for new sessions and devices without a saved preference. */
export const DEFAULT_THEME_ID = "clinical-os-light" as const satisfies ThemeId;

export const THEME_IDS: ThemeId[] = [
  "default-light",
  "default-dark",
  "material-light",
  "material-dark",
  "clinical-os-light",
  "clinical-os-dark",
];

const SESSION_THEME_KEY = "cms-theme-session";

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as string[]).includes(value);
}

export function isDarkTheme(themeId: ThemeId): boolean {
  return (
    themeId === "default-dark" ||
    themeId === "material-dark" ||
    themeId === "clinical-os-dark"
  );
}

export function isMaterialTheme(themeId: ThemeId): boolean {
  return themeId.startsWith("material");
}

export function isClinicalOsTheme(themeId: ThemeId): boolean {
  return themeId.startsWith("clinical-os");
}

export function applyThemeDom(themeId: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  root.classList.toggle("dark", isDarkTheme(themeId));
  root.classList.toggle("theme-material", isMaterialTheme(themeId));
  root.classList.toggle("theme-clinical-os", isClinicalOsTheme(themeId));
  syncThemeFonts(themeId);
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
  return DEFAULT_THEME_ID;
}

function userPersistedThemeChoice(): boolean {
  try {
    const raw = localStorage.getItem("cms-theme");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { persistDefault?: boolean } };
    return Boolean(parsed.state?.persistDefault);
  } catch {
    return false;
  }
}

/** Run before React mounts so the first paint matches persisted preference. */
export function applyThemeFromPersistedStorage() {
  try {
    const sessionTheme = readSessionTheme();
    const persistedChoice = userPersistedThemeChoice();
    if (sessionTheme) {
      const theme =
        !persistedChoice && sessionTheme === "material-light" ? DEFAULT_THEME_ID : sessionTheme;
      applyThemeDom(theme);
      if (theme !== sessionTheme) writeSessionTheme(theme);
      return;
    }
    const raw = localStorage.getItem("cms-theme");
    if (!raw) {
      applyThemeDom(DEFAULT_THEME_ID);
      return;
    }
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const st = parsed.state;
    if (!st?.persistDefault) {
      applyThemeDom(DEFAULT_THEME_ID);
      return;
    }
    const themeId = migrateLegacyTheme(st);
    applyThemeDom(themeId);
    writeSessionTheme(themeId);
  } catch {
    applyThemeDom(DEFAULT_THEME_ID);
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
      themeId: DEFAULT_THEME_ID,
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
          applyThemeDom(state.themeId ?? DEFAULT_THEME_ID);
        }
      },
      migrate: (persisted: unknown) => {
        const p = persisted as { themeId?: string; mode?: string; persistDefault?: boolean } | undefined;
        if (!p) return { themeId: DEFAULT_THEME_ID, persistDefault: false };
        const themeId = migrateLegacyTheme(p as Record<string, unknown>);
        const upgraded =
          !p.persistDefault && themeId === "material-light" ? DEFAULT_THEME_ID : themeId;
        return {
          themeId: upgraded,
          persistDefault: Boolean(p.persistDefault),
        };
      },
      version: 5,
    },
  ),
);

/** @deprecated Use ThemeId — kept for gradual migration in imports. */
export type ThemeMode = "light" | "dark";
