import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Per-screen browser tab title (WCAG 2.4.2 Page Titled): "<screen> - <product>". The screen name is the page's own `h1` (so it is always translated and never
 * drifts from the visible heading); with no `h1` it falls back to the active navigation entry, then to the product title alone.
 * Mount ONCE in the signed-in layout (inside the router). `base` is the product title in the active language (already localised by the app);
 * pass `undefined` to leave the title alone (for example the Nurse edition of Clinic, which owns its own title).
 * Vendored copy: edit `_brand/pagetitle/use-page-title.ts` and copy it; do not fork.
 */
export function composePageTitle(base: string, heading: string | null | undefined): string {
  const h = (heading ?? "").replace(/\s+/g, " ").trim();
  return h && h !== base ? `${h} - ${base}` : base;
}

export function usePageTitle(base: string | undefined): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!base) return;
    const apply = () => {
      const main = document.querySelector("main, [role='main']");
      const h1 = (main?.querySelector("h1") ?? document.querySelector("h1"))?.textContent;
      const nav = document.querySelector("nav [aria-current='page']")?.textContent;
      document.title = composePageTitle(base, h1 || nav);
    };
    apply();
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    const root = document.querySelector("main, [role='main']") ?? document.body;
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    const late = window.setTimeout(apply, 150); // another module may have set the product title in the same commit
    return () => { mo.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(late); };
  }, [pathname, base]);
}
