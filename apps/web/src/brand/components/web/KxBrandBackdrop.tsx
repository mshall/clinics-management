// Shared brand-panel surface for the sign-in pages (Clinic, Lab, Pharmacy; Kiorly Home draws the same recipe in CSS). Vendored by _brand/scripts/vendor.cjs; edit HERE.
// Replaces the old indigo-to-ocean gradient: a calm SOLID indigo (deep indigo in dark mode) with a hairline grid that fades out, and the founder's chevrons as a very faint watermark (geometry from the shared logo scene, never redrawn).
import * as React from "react";
import { buildScene } from "../shared/logo-scene";

/** Drop as the FIRST child of a `relative overflow-hidden` panel; put content in a sibling with `relative`. */
export function KxBrandBackdrop({ className }: { className?: string }) {
  const uid = React.useId().replace(/:/g, "");
  const mark = React.useMemo(() => buildScene("mark", "kiorex"), []);
  const [x, y, w, h] = mark.viewBox;
  return (
    <div aria-hidden data-kx-backdrop className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`} style={{ background: "light-dark(#3730A3, #1B1A4E)" }}>
      <svg className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <pattern id={`g${uid}`} width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="1" /></pattern>
          <linearGradient id={`f${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="0.7" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <mask id={`m${uid}`}><rect width="100%" height="100%" fill={`url(#f${uid})`} /></mask>
        </defs>
        <rect width="100%" height="100%" fill={`url(#g${uid})`} mask={`url(#m${uid})`} />
      </svg>
      <svg className="absolute bottom-0 w-[44rem] max-w-none" style={{ insetInlineEnd: "-9rem", bottom: "-5rem" }} viewBox={`${x} ${y} ${w} ${h}`} focusable="false">
        {mark.nodes.map((n, i) => n.k === "poly" ? <polyline key={i} points={n.points} fill="none" stroke="#fff" strokeOpacity="0.06" strokeWidth={n.sw} /> : null)}
      </svg>
    </div>
  );
}
