/** Avoid importing theme-store (would cycle with applyThemeDom). */

const CLINICAL_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Tajawal:wght@600;700&display=swap";
const MATERIAL_FONT_HREF = "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap";

function ensureFontLink(id: string, href: string, enabled: boolean) {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (enabled) {
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    } else if (link.href !== href) {
      link.href = href;
    }
  } else if (link) {
    link.remove();
  }
}

/** Load Google Fonts only for the active theme family (smaller first paint on mobile). */
export function syncThemeFonts(themeId: string) {
  if (typeof document === "undefined") return;
  ensureFontLink("kiorly-font-clinical", CLINICAL_FONT_HREF, themeId.startsWith("clinical-os"));
  ensureFontLink("kiorly-font-material", MATERIAL_FONT_HREF, themeId.startsWith("material"));
}