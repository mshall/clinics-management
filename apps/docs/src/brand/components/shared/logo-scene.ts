// Shared geometry for the Kiorex logo family. Web (SVG) and native (react-native-svg) both render this scene.
// NEVER redraw the artwork: mark geometry is copied verbatim from _brand/kiorex-mark.svg / kiorex-logo-lockup.svg.
import { WORDS } from "./wordmarks.generated";

export type Variant = "lockup" | "mark" | "wordmark";
export type Product = "kiorex" | "kiorly" | "passport" | "nurse";
export type Tone = "color" | "mono" | "inverse";
export type Role = "indigo" | "ocean" | "coral" | "sub" | "rose";

export type Node =
  | { k: "poly"; points: string; role: Role; sw: number; id?: string }
  | { k: "pulse"; d: string; role: Role; sw: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; role: Role; sw: number }
  | { k: "glyph"; d: string; role: Role; transform: string };

export type Scene = { viewBox: [number, number, number, number]; nodes: Node[] };

const PULSE = "M222 440 H510 L525 428 L540 466 L557 392 L574 460 L588 441 H877";
export const PULSE_LENGTH = 800;

export const PALETTE: Record<Tone, Record<Role, string>> = {
  color: { indigo: "#3730A3", ocean: "#0369A1", coral: "#E8735E", sub: "#5F6888", rose: "#E11D48" },
  inverse: { indigo: "#FFFFFF", ocean: "#7DD3FC", coral: "#F08A75", sub: "#C7CBEA", rose: "#FB7185" },
  mono: { indigo: "currentColor", ocean: "currentColor", coral: "currentColor", sub: "currentColor", rose: "currentColor" },
};

function markNodes(nurse: boolean): Node[] {
  return [
    { k: "poly", points: "373,237 505,440 373,643", role: "indigo", sw: 38 },
    { k: "poly", points: "720,237 588,440 720,643", role: "ocean", sw: 38 },
    { k: "pulse", d: PULSE, role: nurse ? "rose" : "coral", sw: 11 },
  ];
}

function wordNodes(product: Product, x: number, baseline: number): { nodes: Node[]; width: number } {
  const main = product === "kiorex" || product === "passport" ? WORDS.KIOREX : WORDS.KIORLY;
  const sub = product === "passport" ? WORDS.PASSPORT : product === "nurse" ? WORDS.NURSE : product === "kiorly" ? WORDS.BY_KIOREX : null;
  const accent: Role = product === "nurse" ? "rose" : "ocean";
  const nodes: Node[] = main.letters.map((l) => ({ k: "glyph", d: l.d, role: l.role === "secondary" ? accent : "indigo", transform: `translate(${x} ${baseline})` }));
  let width = main.width;
  if (sub) {
    const s = 40 / 135;
    const subRole: Role = product === "nurse" ? "rose" : product === "passport" ? "ocean" : "sub";
    sub.letters.forEach((l) => nodes.push({ k: "glyph", d: l.d, role: subRole, transform: `translate(${x} ${baseline + 80}) scale(${s})` }));
    width = Math.max(width, sub.width * s);
  }
  return { nodes, width };
}

const hasSub = (p: Product) => p !== "kiorex";

export function buildScene(variant: Variant, product: Product = "kiorex"): Scene {
  const nurse = product === "nurse";
  if (variant === "mark") return { viewBox: [206, 206, 688, 468], nodes: markNodes(nurse) };
  const baseline = hasSub(product) ? 467.5 : 440 + 135 / 2;
  if (variant === "wordmark") {
    // Wordmark-only scene: ink at x=0, cap-top at y=0 (no sub-line) or with sub-line below.
    const { nodes, width } = wordNodes(product, 0, 135);
    const h = hasSub(product) ? 135 + 80 : 135;
    return { viewBox: [-2, -2, Math.ceil(width) + 4, h + 4], nodes };
  }
  // lockup: mark | coral rule | wordmark (founder geometry; word x=1149 ink-left offset => ink starts at 1149+98 in founder, we place ink at 1247)
  const x = 1247;
  const { nodes: wn, width } = wordNodes(product, x, baseline);
  const nodes: Node[] = [
    ...markNodes(nurse),
    { k: "line", x1: 1062, y1: 210, x2: 1062, y2: 670, role: nurse ? "rose" : "coral", sw: 4 },
    ...wn,
  ];
  return { viewBox: [190, 190, Math.ceil(x + width - 190 + 100), 500], nodes };
}
