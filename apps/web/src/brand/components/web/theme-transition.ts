
/** Briefly animates colour changes across the page (150-200 ms), skipped for prefers-reduced-motion. Runs `change` synchronously so the new class/data-theme is set before the next paint. */
export function withThemeTransition(change: () => void): void {
  if (typeof document === "undefined") return change();
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return change();
  let style = document.getElementById("kx-theme-transition") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "kx-theme-transition";
    style.textContent =
      "*,*::before,*::after{transition:background-color .18s ease,border-color .18s ease,color .18s ease,fill .18s ease,stroke .18s ease,box-shadow .18s ease !important}";
    document.head.appendChild(style);
  }
  change();
  window.setTimeout(() => style?.remove(), 240);
}
