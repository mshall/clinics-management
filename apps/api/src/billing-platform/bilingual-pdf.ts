import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import * as QRCode from "qrcode";

/**
 * Dependency-free bilingual (EN + AR) PDF builder.
 * Latin text uses the built-in Helvetica (WinAnsi); Arabic is shaped to presentation forms,
 * reordered for RTL display and drawn with an embedded TrueType font (Identity-H).
 */

const ARABIC_FONT_FILE = "NotoNaskhArabic-Regular.ttf";
const ARABIC_FONT_NAME = "NotoNaskhArabic-Regular";

export type PdfDirection = "ltr" | "rtl";

export type PdfRow =
  | { kind: "text"; text: string; size?: number; bold?: boolean }
  | { kind: "pair"; label: string; value: string; size?: number; bold?: boolean }
  | { kind: "columns"; cells: string[]; widths: number[]; size?: number; bold?: boolean }
  | { kind: "rule" }
  | { kind: "gap"; height?: number }
  | { kind: "qr"; text: string; size?: number };

export type PdfSection = { direction: PdfDirection; rows: PdfRow[] };

type ArabicFont = {
  data: Buffer;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
  cmap: Map<number, number>;
  advances: number[];
};

let cachedFont: ArabicFont | null | undefined;

function fontCandidates(): string[] {
  return [
    join(process.cwd(), "assets", "fonts", ARABIC_FONT_FILE),
    join(process.cwd(), "apps", "api", "assets", "fonts", ARABIC_FONT_FILE),
    join(__dirname, "..", "..", "assets", "fonts", ARABIC_FONT_FILE),
    join(__dirname, "..", "..", "..", "assets", "fonts", ARABIC_FONT_FILE),
  ];
}

export function loadArabicFont(): ArabicFont | null {
  if (cachedFont !== undefined) return cachedFont;
  const path = fontCandidates().find((p) => existsSync(p));
  cachedFont = path ? parseTrueType(readFileSync(path)) : null;
  return cachedFont;
}

function parseTrueType(buf: Buffer): ArabicFont {
  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, number>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.set(buf.toString("ascii", o, o + 4), buf.readUInt32BE(o + 8));
  }
  const table = (tag: string): number => {
    const off = tables.get(tag);
    if (off == null) throw new Error(`TrueType table missing: ${tag}`);
    return off;
  };

  const head = table("head");
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const bbox: [number, number, number, number] = [
    buf.readInt16BE(head + 36),
    buf.readInt16BE(head + 38),
    buf.readInt16BE(head + 40),
    buf.readInt16BE(head + 42),
  ];

  const hhea = table("hhea");
  const ascent = buf.readInt16BE(hhea + 4);
  const descent = buf.readInt16BE(hhea + 6);
  const numberOfHMetrics = buf.readUInt16BE(hhea + 34);

  const hmtx = table("hmtx");
  const advances: number[] = [];
  for (let i = 0; i < numberOfHMetrics; i++) advances.push(buf.readUInt16BE(hmtx + i * 4));

  const cmapOff = table("cmap");
  const cmap = new Map<number, number>();
  const subtables = buf.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < subtables; i++) {
    const platformId = buf.readUInt16BE(cmapOff + 4 + i * 8);
    const encodingId = buf.readUInt16BE(cmapOff + 6 + i * 8);
    if (platformId !== 3 || encodingId !== 1) continue;
    const sub = cmapOff + buf.readUInt32BE(cmapOff + 8 + i * 8);
    if (buf.readUInt16BE(sub) !== 4) continue;
    const segX2 = buf.readUInt16BE(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = buf.readUInt16BE(ends + s * 2);
      const start = buf.readUInt16BE(starts + s * 2);
      const delta = buf.readInt16BE(deltas + s * 2);
      const ro = buf.readUInt16BE(rangeOffsets + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph: number;
        if (ro === 0) {
          glyph = (c + delta) & 0xffff;
        } else {
          glyph = buf.readUInt16BE(rangeOffsets + s * 2 + ro + (c - start) * 2);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) cmap.set(c, glyph);
      }
    }
  }

  return { data: buf, unitsPerEm, ascent, descent, bbox, cmap, advances };
}

function glyphAdvance1000(font: ArabicFont, glyph: number): number {
  const adv = font.advances[Math.min(glyph, font.advances.length - 1)] ?? font.unitsPerEm / 2;
  return Math.round((adv * 1000) / font.unitsPerEm);
}

// --- Arabic shaping (presentation forms B) --------------------------------------------------

type JoinType = "U" | "R" | "D";

/** base letter → [isolated presentation form, joining type]; final = +1, initial = +2, medial = +3. */
const ARABIC_FORMS: Record<number, [number, JoinType]> = {
  0x0621: [0xfe80, "U"], 0x0622: [0xfe81, "R"], 0x0623: [0xfe83, "R"], 0x0624: [0xfe85, "R"],
  0x0625: [0xfe87, "R"], 0x0626: [0xfe89, "D"], 0x0627: [0xfe8d, "R"], 0x0628: [0xfe8f, "D"],
  0x0629: [0xfe93, "R"], 0x062a: [0xfe95, "D"], 0x062b: [0xfe99, "D"], 0x062c: [0xfe9d, "D"],
  0x062d: [0xfea1, "D"], 0x062e: [0xfea5, "D"], 0x062f: [0xfea9, "R"], 0x0630: [0xfeab, "R"],
  0x0631: [0xfead, "R"], 0x0632: [0xfeaf, "R"], 0x0633: [0xfeb1, "D"], 0x0634: [0xfeb5, "D"],
  0x0635: [0xfeb9, "D"], 0x0636: [0xfebd, "D"], 0x0637: [0xfec1, "D"], 0x0638: [0xfec5, "D"],
  0x0639: [0xfec9, "D"], 0x063a: [0xfecd, "D"], 0x0641: [0xfed1, "D"], 0x0642: [0xfed5, "D"],
  0x0643: [0xfed9, "D"], 0x0644: [0xfedd, "D"], 0x0645: [0xfee1, "D"], 0x0646: [0xfee5, "D"],
  0x0647: [0xfee9, "D"], 0x0648: [0xfeed, "R"], 0x0649: [0xfeef, "R"], 0x064a: [0xfef1, "D"],
};

/** lam + alef variant → isolated lam-alef ligature (final = +1). */
const LAM_ALEF: Record<number, number> = { 0x0622: 0xfef5, 0x0623: 0xfef7, 0x0625: 0xfef9, 0x0627: 0xfefb };

const TATWEEL = 0x0640;

function isTransparent(cp: number): boolean {
  return (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670;
}

function joinType(cp: number | undefined): JoinType | "C" | null {
  if (cp == null) return null;
  if (cp === TATWEEL) return "C";
  return ARABIC_FORMS[cp]?.[1] ?? null;
}

function canJoinNext(cp: number | undefined): boolean {
  const t = joinType(cp);
  return t === "D" || t === "C";
}

function canJoinPrev(cp: number | undefined): boolean {
  const t = joinType(cp);
  return t === "D" || t === "R" || t === "C";
}

/** Shape a logical-order Arabic string into presentation forms (still logical order). */
export function shapeArabic(text: string): string {
  const cps = Array.from(text, (ch) => ch.codePointAt(0)!);
  const out: number[] = [];
  const neighbour = (from: number, step: 1 | -1): number | undefined => {
    for (let j = from + step; j >= 0 && j < cps.length; j += step) {
      if (!isTransparent(cps[j]!)) return cps[j];
    }
    return undefined;
  };

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]!;
    const forms = ARABIC_FORMS[cp];
    if (!forms) {
      out.push(cp);
      continue;
    }
    const prev = neighbour(i, -1);
    const joinsPrev = canJoinNext(prev);

    if (cp === 0x0644) {
      const nextIdx = cps.findIndex((c, j) => j > i && !isTransparent(c));
      const next = nextIdx >= 0 ? cps[nextIdx] : undefined;
      if (next != null && LAM_ALEF[next] != null) {
        out.push(LAM_ALEF[next]! + (joinsPrev ? 1 : 0));
        for (let j = i + 1; j < nextIdx; j++) out.push(cps[j]!);
        i = nextIdx;
        continue;
      }
    }

    const [iso, type] = forms;
    const joinsNext = type === "D" && canJoinPrev(neighbour(i, 1));
    const prevOk = type !== "U" && joinsPrev;
    if (prevOk && joinsNext) out.push(iso + 3);
    else if (prevOk) out.push(iso + 1);
    else if (joinsNext) out.push(iso + 2);
    else out.push(iso);
  }
  return String.fromCodePoint(...out);
}

// --- Bidi (simplified, sufficient for labels + numbers) -------------------------------------

function isArabicScript(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

function isStrongLtr(cp: number): boolean {
  return (cp >= 0x30 && cp <= 0x39) || (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f);
}

const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "<": ">", ">": "<" };

/** Logical → visual order for one line. */
export function toVisualOrder(text: string, direction: PdfDirection): string {
  const chars = Array.from(shapeArabic(text));
  const n = chars.length;
  const strong: ("L" | "R" | null)[] = chars.map((ch) => {
    const cp = ch.codePointAt(0)!;
    if (isArabicScript(cp)) return "R";
    if (isStrongLtr(cp)) return "L";
    return null;
  });
  const isDigit = (i: number) => i >= 0 && i < n && /[0-9]/.test(chars[i]!);
  for (let i = 0; i < n; i++) {
    const ch = chars[i]!;
    if (ch === "%" && isDigit(i - 1)) strong[i] = "L";
    else if (/[.,:/]/.test(ch) && isDigit(i - 1) && isDigit(i + 1)) strong[i] = "L";
    else if (ch === "-" && isDigit(i + 1) && !isDigit(i - 1)) strong[i] = "L";
  }
  const base: "L" | "R" = direction === "rtl" ? "R" : "L";
  const resolved: ("L" | "R")[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (strong[i]) {
      resolved[i] = strong[i]!;
      continue;
    }
    let before: "L" | "R" = base;
    for (let j = i - 1; j >= 0; j--) if (strong[j]) { before = strong[j]!; break; }
    let after: "L" | "R" = base;
    for (let j = i + 1; j < n; j++) if (strong[j]) { after = strong[j]!; break; }
    resolved[i] = before === after ? before : base;
  }

  type Run = { dir: "L" | "R"; chars: string[] };
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const last = runs[runs.length - 1];
    if (last && last.dir === resolved[i]) last.chars.push(chars[i]!);
    else runs.push({ dir: resolved[i]!, chars: [chars[i]!] });
  }
  const renderRun = (run: Run): string =>
    run.dir === "R" ? run.chars.slice().reverse().map((c) => MIRROR[c] ?? c).join("") : run.chars.join("");

  if (base === "R") return runs.slice().reverse().map(renderRun).join("");
  return runs.map(renderRun).join("");
}

// --- Text measurement + encoding ------------------------------------------------------------

/* Helvetica advance widths (1/1000 em) for ASCII 32..126. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];

function helveticaWidth(cp: number, bold: boolean): number {
  const w = cp >= 32 && cp <= 126 ? HELVETICA_WIDTHS[cp - 32]! : 556;
  return bold ? Math.round(w * 1.06) : w;
}

const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96,
  0x2014: 0x97,
};

function winAnsiByte(cp: number): number {
  if ((cp >= 32 && cp <= 126) || (cp >= 0xa0 && cp <= 0xff)) return cp;
  return WIN_ANSI_EXTRA[cp] ?? 0x3f;
}

function pdfLiteral(cps: number[]): string {
  let s = "(";
  for (const cp of cps) {
    const b = winAnsiByte(cp);
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) s += `\\${b.toString(8).padStart(3, "0")}`;
    else s += String.fromCharCode(b);
  }
  return `${s})`;
}

type Segment = { font: "latin" | "arabic"; cps: number[]; width: number };

class TextShaper {
  readonly usedGlyphs = new Set<number>();

  constructor(private readonly font: ArabicFont | null) {}

  private usesArabicFont(cp: number): boolean {
    return this.font != null && isArabicScript(cp) && this.font.cmap.has(cp);
  }

  /** Visual-order segments for one line. */
  segments(text: string, direction: PdfDirection, size: number, bold: boolean): Segment[] {
    const visual = Array.from(toVisualOrder(text, direction), (c) => c.codePointAt(0)!);
    const segs: Segment[] = [];
    for (const cp of visual) {
      const kind: Segment["font"] = this.usesArabicFont(cp) ? "arabic" : "latin";
      if (kind === "latin" && isArabicScript(cp)) continue;
      const w =
        kind === "arabic" ? glyphAdvance1000(this.font!, this.font!.cmap.get(cp)!) : helveticaWidth(cp, bold);
      const last = segs[segs.length - 1];
      const width = (w * size) / 1000;
      if (last && last.font === kind) {
        last.cps.push(cp);
        last.width += width;
      } else {
        segs.push({ font: kind, cps: [cp], width });
      }
    }
    return segs;
  }

  measure(text: string, size: number, bold: boolean): number {
    return this.segments(text, "ltr", size, bold).reduce((s, seg) => s + seg.width, 0);
  }

  draw(segs: Segment[], x: number, y: number, size: number, bold: boolean): string {
    const ops: string[] = [];
    let cursor = x;
    for (const seg of segs) {
      if (seg.font === "arabic") {
        const hex = seg.cps
          .map((cp) => {
            const glyph = this.font!.cmap.get(cp)!;
            this.usedGlyphs.add(glyph);
            return glyph.toString(16).padStart(4, "0");
          })
          .join("");
        ops.push(`BT /F2 ${size} Tf ${cursor.toFixed(2)} ${y.toFixed(2)} Td <${hex}> Tj ET`);
      } else {
        ops.push(`BT /${bold ? "F3" : "F1"} ${size} Tf ${cursor.toFixed(2)} ${y.toFixed(2)} Td ${pdfLiteral(seg.cps)} Tj ET`);
      }
      cursor += seg.width;
    }
    return ops.join("\n");
  }

  wrap(text: string, maxWidth: number, size: number, bold: boolean): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && this.measure(candidate, size, bold) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }
}

/** QR code as filled squares (bottom-left at x,y). */
function qrOps(text: string, x: number, y: number, side: number): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const cell = side / n;
  const rects: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modules.get(r, c)) continue;
      rects.push(`${(x + c * cell).toFixed(2)} ${(y + (n - 1 - r) * cell).toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re`);
    }
  }
  return `q 0 g ${rects.join(" ")} f Q`;
}

// --- Document assembly ----------------------------------------------------------------------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function buildBilingualPdf(sections: PdfSection[]): Buffer {
  const font = loadArabicFont();
  const shaper = new TextShaper(font);
  const pages: string[] = [];

  for (const section of sections) {
    const rtl = section.direction === "rtl";
    let ops: string[] = [];
    let y = PAGE_H - MARGIN;
    const newPage = () => {
      pages.push(ops.join("\n"));
      ops = [];
      y = PAGE_H - MARGIN;
    };
    const ensure = (h: number) => {
      if (y - h < MARGIN) newPage();
    };
    const drawAt = (text: string, xStart: number, width: number, align: "start" | "end", size: number, bold: boolean) => {
      const segs = shaper.segments(text, section.direction, size, bold);
      const w = segs.reduce((s, seg) => s + seg.width, 0);
      const alignRight = rtl ? align === "start" : align === "end";
      const x = alignRight ? xStart + width - w : xStart;
      ops.push(shaper.draw(segs, x, y, size, bold));
    };

    for (const row of section.rows) {
      if (row.kind === "gap") {
        y -= row.height ?? 8;
        continue;
      }
      if (row.kind === "rule") {
        ensure(10);
        ops.push(`0.6 w ${MARGIN} ${(y + 4).toFixed(2)} m ${PAGE_W - MARGIN} ${(y + 4).toFixed(2)} l S`);
        y -= 8;
        continue;
      }
      if (row.kind === "qr") {
        const side = row.size ?? 100;
        ensure(side + 6);
        const x0 = rtl ? PAGE_W - MARGIN - side : MARGIN;
        ops.push(qrOps(row.text, x0, y - side, side));
        y -= side + 6;
        continue;
      }
      const size = row.size ?? 10;
      const bold = row.bold ?? false;
      const lineH = size * 1.55;
      if (row.kind === "text") {
        for (const line of shaper.wrap(row.text, CONTENT_W, size, bold)) {
          ensure(lineH);
          drawAt(line, MARGIN, CONTENT_W, "start", size, bold);
          y -= lineH;
        }
        continue;
      }
      if (row.kind === "pair") {
        ensure(lineH);
        drawAt(row.label, MARGIN, CONTENT_W, "start", size, bold);
        drawAt(row.value, MARGIN, CONTENT_W, "end", size, bold);
        y -= lineH;
        continue;
      }
      ensure(lineH);
      const total = row.widths.reduce((s, w) => s + w, 0);
      let offset = 0;
      row.cells.forEach((cell, idx) => {
        const w = (row.widths[idx]! / total) * CONTENT_W;
        const colStart = rtl ? PAGE_W - MARGIN - offset - w : MARGIN + offset;
        drawAt(cell, colStart, w - 4, idx === row.cells.length - 1 ? "end" : "start", size, bold);
        offset += w;
      });
      y -= lineH;
    }
    pages.push(ops.join("\n"));
  }

  return assemblePdf(pages, font, shaper.usedGlyphs);
}

function assemblePdf(pageStreams: string[], font: ArabicFont | null, usedGlyphs: Set<number>): Buffer {
  const objects: Buffer[] = [];
  const add = (body: Buffer | string): number => {
    objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
    return objects.length;
  };
  const reserve = (): number => add("");
  const set = (id: number, body: Buffer | string) => {
    objects[id - 1] = typeof body === "string" ? Buffer.from(body, "latin1") : body;
  };

  const catalogId = reserve();
  const pagesId = reserve();
  const helveticaId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const helveticaBoldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  let arabicFontRef = "";
  if (font && usedGlyphs.size > 0) {
    const compressed = deflateSync(font.data);
    const fileId = add(
      Buffer.concat([
        Buffer.from(`<< /Length ${compressed.length} /Length1 ${font.data.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
        compressed,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );
    const scale = (v: number) => Math.round((v * 1000) / font.unitsPerEm);
    const descriptorId = add(
      `<< /Type /FontDescriptor /FontName /${ARABIC_FONT_NAME} /Flags 4 /FontBBox [${font.bbox.map(scale).join(" ")}] ` +
        `/ItalicAngle 0 /Ascent ${scale(font.ascent)} /Descent ${scale(font.descent)} /CapHeight ${scale(font.ascent)} ` +
        `/StemV 80 /FontFile2 ${fileId} 0 R >>`,
    );
    const widths = [...usedGlyphs]
      .sort((a, b) => a - b)
      .map((g) => `${g} [${glyphAdvance1000(font, g)}]`)
      .join(" ");
    const cidId = add(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${ARABIC_FONT_NAME} ` +
        `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
        `/FontDescriptor ${descriptorId} 0 R /CIDToGIDMap /Identity /DW 500 /W [${widths}] >>`,
    );
    const type0Id = add(
      `<< /Type /Font /Subtype /Type0 /BaseFont /${ARABIC_FONT_NAME} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] >>`,
    );
    arabicFontRef = ` /F2 ${type0Id} 0 R`;
  }

  const resources = `<< /Font << /F1 ${helveticaId} 0 R /F3 ${helveticaBoldId} 0 R${arabicFontRef} >> >>`;
  const pageIds: number[] = [];
  for (const stream of pageStreams) {
    const content = Buffer.from(stream, "latin1");
    const contentId = add(
      Buffer.concat([
        Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
        content,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources ${resources} >>`,
      ),
    );
  }
  set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  let length = chunks[0]!.length;
  const offsets: number[] = [];
  objects.forEach((body, idx) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${idx + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
    chunks.push(chunk);
    length += chunk.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${length}\n%%EOF`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
