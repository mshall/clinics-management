/** Avoid importing theme-store (would cycle with applyThemeDom). */

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
  // Jost + IBM Plex Sans Arabic are bundled (self-hosted via @fontsource); only the optional Material theme loads Roboto.
  ensureFontLink("kiorly-font-material", MATERIAL_FONT_HREF, themeId.startsWith("material"));
}