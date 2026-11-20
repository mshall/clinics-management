import type { Page } from "@playwright/test";

export type E2EThemeId =
  | "default-light"
  | "default-dark"
  | "material-light"
  | "material-dark"
  | "clinical-os-light"
  | "clinical-os-dark";

/** The header now has the shared light/dark toggle (one button) instead of a family menu: families are seeded through the per-tab session key the app reads before first paint. */
export async function selectTheme(page: Page, label: RegExp): Promise<void> {
  const id = label.source.includes("material") ? (/dark/.test(label.source) ? "material-dark" : "material-light")
    : label.source.includes("default") ? (/dark/.test(label.source) ? "default-dark" : "default-light")
    : (/dark/.test(label.source) ? "clinical-os-dark" : "clinical-os-light");
  await page.evaluate((v) => sessionStorage.setItem("cms-theme-session", v), id);
  await page.reload();
}

/** Click the shared theme toggle (light <-> dark inside the current family). */
export async function toggleTheme(page: Page): Promise<void> {
  await page.locator("[data-kx-control=theme]:visible").first().click();
}

export async function expectThemeApplied(page: Page, themeId: E2EThemeId): Promise<void> {
  const html = page.locator("html");
  await html.evaluate(
    (el, id) => {
      if (el.dataset.theme !== id) {
        throw new Error(`Expected data-theme="${id}", got "${el.dataset.theme ?? ""}"`);
      }
    },
    themeId,
  );
  if (themeId === "default-dark" || themeId === "material-dark" || themeId === "clinical-os-dark") {
    await html.evaluate((el) => {
      if (!el.classList.contains("dark")) throw new Error("Expected .dark class on html");
    });
  } else {
    await html.evaluate((el) => {
      if (el.classList.contains("dark")) throw new Error("Expected no .dark class on html");
    });
  }
  if (themeId.startsWith("material")) {
    await html.evaluate((el) => {
      if (!el.classList.contains("theme-material")) throw new Error("Expected .theme-material on html");
      if (el.classList.contains("theme-clinical-os")) throw new Error("Unexpected .theme-clinical-os on html");
    });
  }
  if (themeId.startsWith("clinical-os")) {
    await html.evaluate((el) => {
      if (!el.classList.contains("theme-clinical-os")) throw new Error("Expected .theme-clinical-os on html");
      if (el.classList.contains("theme-material")) throw new Error("Unexpected .theme-material on html");
    });
  }
}
