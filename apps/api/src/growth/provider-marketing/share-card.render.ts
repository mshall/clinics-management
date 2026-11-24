import sharp from "sharp";
import QRCode from "qrcode";

/**
 * GRW-P2-C share cards: pure SVG composition (testable as text) and PNG via `sharp`. The card carries only text the server composed (clinic and doctor
 * names, approved wording, free slot times, the tracked link and its QR). It never carries a patient name, a phone number or a price comparison.
 */
export type CardLayout = "post" | "story" | "flyer" | "slots";
export const CARD_SIZE: Record<CardLayout, { w: number; h: number }> = {
  post: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
  flyer: { w: 1240, h: 1754 },
  slots: { w: 1080, h: 1350 },
};

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Greedy wrap by estimated glyph width (Arabic glyphs are slightly narrower on average). */
export function wrapText(text: string, fontSize: number, maxWidth: number, rtl: boolean): string[] {
  const avg = fontSize * (rtl ? 0.5 : 0.56);
  const perLine = Math.max(8, Math.floor(maxWidth / avg));
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = word.length > perLine ? word.slice(0, perLine) : word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface CardInput {
  layout: CardLayout;
  locale: "ar" | "en";
  title: string;
  /** Body lines already filled and guarded (no link inside: the link is shown as its own line and as a QR). */
  body: string;
  /** Extra short lines, e.g. the free slot times, one per line. */
  lines?: string[];
  clinicName: string;
  doctorName?: string | null;
  link: string;
  footer: string;
  /** Data URI of a PNG QR (from `qrDataUri`). */
  qr: string;
}

export async function qrDataUri(url: string): Promise<string> {
  const buf = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width: 360, type: "png", color: { dark: "#1e1b4b", light: "#ffffff" } });
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export function composeCardSvg(i: CardInput): string {
  const { w, h } = CARD_SIZE[i.layout];
  const rtl = i.locale === "ar";
  const pad = Math.round(w * 0.075);
  const anchor = rtl ? "end" : "start";
  const x = rtl ? w - pad : pad;
  const family = rtl ? "'Noto Naskh Arabic','Geeza Pro','Arial',sans-serif" : "'Plus Jakarta Sans','Helvetica Neue','Arial',sans-serif";
  const textW = w - pad * 2;
  const parts: string[] = [];
  const text = (t: string, y: number, size: number, weight: number, fill: string) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" direction="${rtl ? "rtl" : "ltr"}" unicode-bidi="plaintext">${esc(t)}</text>`;
  let y = pad + 40;
  parts.push(`<rect width="${w}" height="${h}" fill="#f8fafc"/>`);
  parts.push(`<rect width="${w}" height="${Math.round(h * 0.035)}" fill="#0d9488"/>`);
  y = Math.round(h * 0.035) + pad;
  // clinic (and doctor) name
  const nameSize = Math.round(w * 0.045);
  for (const l of wrapText(i.clinicName, nameSize, textW, rtl)) {
    y += nameSize * 1.3;
    parts.push(text(l, Math.round(y), nameSize, 700, "#1e1b4b"));
  }
  if (i.doctorName) {
    const s = Math.round(w * 0.036);
    y += s * 1.5;
    parts.push(text(i.doctorName, Math.round(y), s, 600, "#0f766e"));
  }
  // title
  y += w * 0.07;
  const titleSize = Math.round(w * 0.06);
  for (const l of wrapText(i.title, titleSize, textW, rtl)) {
    y += titleSize * 1.25;
    parts.push(text(l, Math.round(y), titleSize, 800, "#0f172a"));
  }
  // body
  y += w * 0.03;
  const bodySize = Math.round(w * 0.034);
  for (const l of wrapText(i.body, bodySize, textW, rtl)) {
    y += bodySize * 1.5;
    parts.push(text(l, Math.round(y), bodySize, 400, "#334155"));
  }
  // extra lines (slots)
  if (i.lines?.length) {
    y += w * 0.03;
    const s = Math.round(w * 0.042);
    for (const l of i.lines) {
      y += s * 1.9;
      const bw = textW;
      const bx = pad;
      parts.push(`<rect x="${bx}" y="${Math.round(y - s * 1.25)}" width="${bw}" height="${Math.round(s * 1.7)}" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>`);
      parts.push(text(l, Math.round(y), s, 700, "#1e1b4b"));
    }
  }
  // QR + link + footer pinned to the bottom
  const qr = Math.round(w * 0.24);
  const qrY = h - pad - qr - Math.round(h * 0.07);
  const qrX = rtl ? pad : w - pad - qr;
  parts.push(`<image x="${qrX}" y="${qrY}" width="${qr}" height="${qr}" href="${i.qr}"/>`);
  const linkSize = Math.round(w * 0.03);
  parts.push(`<text x="${x}" y="${qrY + Math.round(qr / 2)}" font-size="${linkSize}" font-weight="600" fill="#0f766e" text-anchor="${anchor}" direction="ltr" unicode-bidi="plaintext">${esc(i.link.replace(/^https?:\/\//, ""))}</text>`);
  const footSize = Math.round(w * 0.022);
  let fy = h - pad * 0.9 - footSize;
  const footLines = wrapText(i.footer, footSize, textW, rtl);
  fy -= (footLines.length - 1) * footSize * 1.3;
  for (const l of footLines) {
    parts.push(text(l, Math.round(fy), footSize, 400, "#64748b"));
    fy += footSize * 1.3;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(i.title)}">${parts.join("")}</svg>`;
}

export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
