import * as React from "react";
import { buildScene, PALETTE, PULSE_LENGTH, type Product, type Tone, type Variant } from "../shared/logo-scene";

export interface KiorexLogoProps extends Omit<React.SVGProps<SVGSVGElement>, "ref" | "height"> {
  variant?: Variant;
  tone?: Tone;
  /** "kiorex" (default) | "kiorly" (adds "by Kiorex") | "passport" (adds PASSPORT) | "nurse" (Nurse Rose accent) */
  product?: Product;
  /** Height in px (or any CSS length); width follows the aspect ratio. Default 32. */
  height?: number | string;
  /** Draws the coral pulse in on mount (honours prefers-reduced-motion via tokens.css). */
  animated?: boolean;
  /** Accessible name. Pass "" to mark decorative (when adjacent text names it). */
  title?: string;
}

const NAMES: Record<Product, string> = { kiorex: "Kiorex", kiorly: "Kiorly by Kiorex", passport: "Kiorex Passport", nurse: "Kiorly Nurse by Kiorex" };

/** The Kiorex brand logo family — built from the founder's artwork geometry; never redrawn. */
export function KiorexLogo({ variant = "lockup", tone = "color", product = "kiorex", height = 32, animated = false, title, ...rest }: KiorexLogoProps) {
  const scene = React.useMemo(() => buildScene(variant, product), [variant, product]);
  const pal = PALETTE[tone];
  const [x, y, w, h] = scene.viewBox;
  const label = title ?? (variant === "mark" ? "Kiorex mark" : NAMES[product]);
  const px = typeof height === "number" ? height : undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${x} ${y} ${w} ${h}`}
      height={height}
      width={px ? (px * w) / h : undefined}
      style={{ ...(px ? null : { aspectRatio: `${w} / ${h}` }), ...(rest.style || {}) }}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {scene.nodes.map((n, i) => {
        if (n.k === "poly") return <polyline key={i} points={n.points} fill="none" stroke={pal[n.role]} strokeWidth={n.sw} strokeLinejoin="miter" />;
        if (n.k === "pulse") return (
          <path key={i} d={n.d} fill="none" stroke={pal[n.role]} strokeWidth={n.sw} strokeLinejoin="round" strokeLinecap="round"
            className={animated ? "kx-pulse-draw" : undefined} style={animated ? ({ ["--kx-pulse-len" as string]: PULSE_LENGTH } as React.CSSProperties) : undefined} />
        );
        if (n.k === "line") return <line key={i} x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} stroke={pal[n.role]} strokeWidth={n.sw} />;
        return <path key={i} d={n.d} fill={pal[n.role]} transform={n.transform} />;
      })}
    </svg>
  );
}

/** Animated pulse line for loading / success moments (the brand motif). */
export function PulseLine({ size = 48, tone = "color", loop = false, label = "Loading" }: { size?: number; tone?: Tone; loop?: boolean; label?: string }) {
  return (
    <svg viewBox="206 380 688 120" width={size * 5.73} height={size} role="img" aria-label={label} focusable="false">
      <path d="M222 440 H510 L525 428 L540 466 L557 392 L574 460 L588 441 H877" fill="none" stroke={PALETTE[tone].coral} strokeWidth={11}
        strokeLinecap="round" strokeLinejoin="round" className={loop ? "kx-pulse-loop" : "kx-pulse-draw"} style={{ ["--kx-pulse-len" as string]: PULSE_LENGTH } as React.CSSProperties} />
    </svg>
  );
}
export default KiorexLogo;
