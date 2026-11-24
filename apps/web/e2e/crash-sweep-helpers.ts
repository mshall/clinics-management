import type { Page } from "@playwright/test";

/**
 * Collects everything that means "this screen is broken": React render-loop and hook errors, other console errors, React warnings and
 * uncaught exceptions. Plain 4xx "Failed to load resource" lines are not counted (role-gated endpoints answer 403 on purpose); 5xx are.
 */
export type CrashFinding = { kind: "console" | "pageerror" | "http5xx"; text: string; url: string };

const IGNORED = [/Failed to load resource/i, /favicon/i, /ResizeObserver loop/i, /\[vite\]/i, /Download the React DevTools/i];
/** Always fatal, even when logged as a warning. */
export const FATAL = /Maximum update depth|Too many re-renders|Rendered (more|fewer) hooks|Invalid hook call|Cannot update a component|Hooks can only be called|getSnapshot should be cached|Objects are not valid as a React child|The above error occurred|React Router caught/i;

export function watchPage(page: Page): { findings: CrashFinding[]; reset: () => void } {
  const findings: CrashFinding[] = [];
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() !== "error" && m.type() !== "warning") return;
    if (m.type() === "warning" && !FATAL.test(text) && !/Warning:|React will try|validateDOMNesting|unique "key"|act\(/i.test(text)) return;
    if (IGNORED.some((re) => re.test(text)) && !FATAL.test(text)) return;
    findings.push({ kind: "console", text: text.slice(0, 600), url: page.url() });
  });
  page.on("pageerror", (e) => findings.push({ kind: "pageerror", text: `${e.message}`.slice(0, 600), url: page.url() }));
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().includes("/api/")) findings.push({ kind: "http5xx", text: `${r.status()} ${r.request().method()} ${r.url()}`, url: page.url() });
  });
  return { findings, reset: () => void (findings.length = 0) };
}

/** Pin language and theme before the app boots (cookie + localStorage for the locale, session key for the theme). */
export async function pinLocaleAndTheme(page: Page, locale: "en" | "ar", theme: "light" | "dark"): Promise<void> {
  await page.addInitScript(
    ([l, t]) => {
      try {
        localStorage.setItem("cms_locale", l);
        document.cookie = `cms_locale=${l}; Path=/`;
        sessionStorage.setItem("cms-theme-session", t === "dark" ? "clinical-os-dark" : "clinical-os-light");
        localStorage.setItem("cms-theme", JSON.stringify({ state: { themeId: t === "dark" ? "clinical-os-dark" : "clinical-os-light", persistDefault: true }, version: 0 }));
      } catch {
        /* ignore */
      }
    },
    [locale, theme] as const,
  );
}
