// Shared geometry for the Kiorex logo family. Web (SVG) and native (react-native-svg) both render this scene.
// NEVER redraw the artwork: mark geometry is copied verbatim from _brand/kiorex-mark.svg / kiorex-logo-lockup.svg.
import { WORDS } from "./wordmarks.generated";

export type Variant = "lockup" | "mark" | "wordmark";
/** "kiorly" is a deprecated alias of "clinic" (the Kiorly product lockup is always "Kiorly <Product> by Kiorex"). Nurse is an edition of Clinic and keeps its Nurse Rose look. */
export type Product = "kiorex" | "kiorly" | "clinic" | "lab" | "pharmacy" | "passport" | "nurse";
export type ProductAccent = "clinic" | "lab" | "pharmacy";
export type Tone = "color" | "mono" | "inverse";
export type Role = "indigo" | "ocean" | "coral" | "sub" | "rose" | ProductAccent;

export type Node =
  | { k: "poly"; points: string; role: Role; sw: number; id?: string }
  | { k: "pulse"; d: string; role: Role; sw: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; role: Role; sw: number }
  | { k: "glyph"; d: string; role: Role; transform: string };

export type Scene = { viewBox: [number, number, number, number]; nodes: Node[] };

const PULSE = "M222 440 H510 L525 428 L540 466 L557 392 L574 460 L588 441 H877";
export const PULSE_LENGTH = 800;

export const PALETTE: Record<Tone, Record<Role, string>> = {
  color: { indigo: "#3730A3", ocean: "#0369A1", coral: "#E8735E", sub: "#5F6888", rose: "#E11D48", clinic: "#0D9488", lab: "#7C3AED", pharmacy: "#16A34A" },
  inverse: { indigo: "#FFFFFF", ocean: "#7DD3FC", coral: "#F08A75", sub: "#C7CBEA", rose: "#FB7185", clinic: "#2DD4BF", lab: "#A78BFA", pharmacy: "#4ADE80" },
  mono: { indigo: "currentColor", ocean: "currentColor", coral: "currentColor", sub: "currentColor", rose: "currentColor", clinic: "currentColor", lab: "currentColor", pharmacy: "currentColor" },
};

/** Normalises the deprecated "kiorly" alias. */
export const canonicalProduct = (p: Product): Product => (p === "kiorly" ? "clinic" : p);
/** Accent role of a product: Ocean for Kiorex/Passport, Nurse Rose for Nurse, else the per-product accent. */
export const accentRole = (p: Product): Role => { const c = canonicalProduct(p); return c === "nurse" ? "rose" : c === "clinic" || c === "lab" || c === "pharmacy" ? c : "ocean"; };
/** English product name used in aria-labels/titles, e.g. "Kiorly Clinic by Kiorex". */
export const PRODUCT_NAMES: Record<Product, string> = {
  kiorex: "Kiorex", kiorly: "Kiorly Clinic by Kiorex", clinic: "Kiorly Clinic by Kiorex", lab: "Kiorly Lab by Kiorex", pharmacy: "Kiorly Pharmacy by Kiorex",
  passport: "Kiorex Passport", nurse: "Kiorly Nurse by Kiorex",
};

function markNodes(product: Product): Node[] {
  const c = canonicalProduct(product);
  return [
    { k: "poly", points: "373,237 505,440 373,643", role: "indigo", sw: 38 },
    // right-hand chevron: Ocean for Kiorex/Passport/Nurse, the product accent for Clinic/Lab/Pharmacy
    { k: "poly", points: "720,237 588,440 720,643", role: c === "clinic" || c === "lab" || c === "pharmacy" ? c : "ocean", sw: 38 },
    { k: "pulse", d: PULSE, role: c === "nurse" ? "rose" : "coral", sw: 11 },
  ];
}

const SUB_SCALE = 0.25; // sub-line cap height ~ 34; PHARMACY BY KIOREX then spans about the width of KIORLY
const SUB_GAP = 330; // raw units (pre-scale) between the product word and "BY KIOREX"
const PRODUCT_WORD = { clinic: "CLINIC", lab: "LAB", pharmacy: "PHARMACY" } as const;

function wordNodes(product: Product, x: number, baseline: number): { nodes: Node[]; width: number } {
  const c = canonicalProduct(product);
  const main = c === "kiorex" || c === "passport" ? WORDS.KIOREX : WORDS.KIORLY;
  const accent = accentRole(c);
  const nodes: Node[] = main.letters.map((l) => ({ k: "glyph", d: l.d, role: l.role === "secondary" ? accent : "indigo", transform: `translate(${x} ${baseline})` }));
  let width = main.width;
  const y = baseline + 80;
  if (c === "clinic" || c === "lab" || c === "pharmacy") {
    // line 2: "<PRODUCT> BY KIOREX" — the WHOLE product word in the product accent (with the Y of KIORLY), "BY KIOREX" in the muted sub colour
    const s = SUB_SCALE;
    const pw = WORDS[PRODUCT_WORD[c]];
    pw.letters.forEach((l) => nodes.push({ k: "glyph", d: l.d, role: accent, transform: `translate(${x} ${y}) scale(${s})` }));
    const bx = x + (pw.width + SUB_GAP) * s;
    WORDS.BY_KIOREX.letters.forEach((l) => nodes.push({ k: "glyph", d: l.d, role: "sub", transform: `translate(${bx} ${y}) scale(${s})` }));
    width = Math.max(width, (pw.width + SUB_GAP + WORDS.BY_KIOREX.width) * s);
  } else if (c === "passport" || c === "nurse") {
    const s = 40 / 135;
    const sub = c === "passport" ? WORDS.PASSPORT : WORDS.NURSE;
    sub.letters.forEach((l) => nodes.push({ k: "glyph", d: l.d, role: c === "nurse" ? "rose" : "ocean", transform: `translate(${x} ${y}) scale(${s})` }));
    width = Math.max(width, sub.width * s);
  }
  return { nodes, width };
}

const hasSub = (p: Product) => p !== "kiorex";

export function buildScene(variant: Variant, product: Product = "kiorex"): Scene {
    if (variant === "mark") return { viewBox: [206, 206, 688, 468], nodes: markNodes(product) };
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
    ...markNodes(product),
    { k: "line", x1: 1062, y1: 210, x2: 1062, y2: 670, role: canonicalProduct(product) === "nurse" ? "rose" : "coral", sw: 4 },
    ...wn,
  ];
  return { viewBox: [190, 190, Math.ceil(x + width - 190 + 100), 500], nodes };
}
