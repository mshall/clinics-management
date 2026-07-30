import type { Page } from "@playwright/test";

export type E2EThemeId = "default-light" | "default-dark" | "material-light" | "material-dark";

/** Open theme menu and pick a theme by English label (matches en locale). */
export async function selectTheme(page: Page, label: RegExp): Promise<void> {
  await page.getByRole("button", { name: /theme/i }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
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
  if (themeId === "default-dark" || themeId === "material-dark") {
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
    });
  }
}
