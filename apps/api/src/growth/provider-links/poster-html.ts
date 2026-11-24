/**
 * Printable sheets for provider links (A4/A5 poster, reception desk card, doctor business-card sheet), Arabic and English with RTL, in the Kiorly Clinic
 * by Kiorex lockup (Kiorex mark: indigo ">" and teal "<" for the Clinic product accent, coral pulse). Plain HTML + print CSS: the browser prints it or saves
 * it as PDF ("Save as PDF"); there is no server-side PDF engine. Pure function, escaped output, no scripts except `window.print()` on request.
 */
export type PosterLang = "ar" | "en";
export type PosterSize = "A4" | "A5";
export type PosterKind = "POSTER" | "DESK" | "DOCTOR_CARD";

export interface PosterInput {
  kind: PosterKind;
  lang: PosterLang;
  size: PosterSize;
  /** Clinic or doctor name in both languages. */
  nameEn: string;
  nameAr: string;
  /** Doctor title or desk label, optional. */
  subtitleEn?: string | null;
  subtitleAr?: string | null;
  /** Short URL printed under the code (what the QR encodes). */
  shortUrl: string;
  /** Inline SVG markup of the QR code (from qrSvg). */
  qrSvg: string;
  autoPrint?: boolean;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STR = {
  en: {
    brand: "Kiorly Clinic by Kiorex",
    poster: "Scan to book your visit online",
    desk: "Book your next visit",
    doctor: "Book with me online",
    note: "Free to book",
    scan: "Scan with your phone camera",
  },
  ar: {
    brand: "كيورلي كلينك من كيوريكس",
    poster: "امسح الرمز لحجز زيارتك عبر الإنترنت",
    desk: "احجز زيارتك القادمة",
    doctor: "احجز معي عبر الإنترنت",
    note: "الحجز مجاني",
    scan: "امسح الرمز بكاميرا هاتفك",
  },
} as const;

/** Kiorex mark, Clinic accent (right chevron teal). Static, no user input. */
const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="206 206 688 468" width="46" height="31" aria-hidden="true">' +
  '<polyline points="373,237 505,440 373,643" fill="none" stroke="#3730A3" stroke-width="38"/>' +
  '<polyline points="720,237 588,440 720,643" fill="none" stroke="#0F766E" stroke-width="38"/>' +
  '<path d="M222 440 H510 L525 428 L540 466 L557 392 L574 460 L588 441 H877" fill="none" stroke="#E8735E" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/></svg>';

function brandRow(lang: PosterLang): string {
  return `<div class="brand">${MARK_SVG}<span>${escapeHtml(STR[lang].brand)}</span></div>`;
}

function sheetCss(size: PosterSize, kind: PosterKind): string {
  const big = size === "A4";
  const qr = kind === "DOCTOR_CARD" ? 26 : big ? 118 : 84;
  return `
@page { size: ${kind === "DOCTOR_CARD" ? "A4" : size}; margin: ${kind === "DOCTOR_CARD" ? "10mm" : "14mm"}; }
:root { --ink:#3730A3; --ocean:#0369A1; --coral:#E8735E; --ground:#F4F6FC; --text:#111827; --muted:#4B5563; }
* { box-sizing: border-box; }
body { margin:0; font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", "Noto Kufi Arabic", system-ui, sans-serif; color: var(--text); background:#fff; text-align:center; }
.sheet { border: 2px solid var(--ink); border-radius: 6mm; padding: ${big ? 12 : 8}mm; background: var(--ground); }
.brand { display:inline-flex; align-items:center; gap:8px; font-weight:600; color:var(--ink); font-size:${big ? 15 : 12}px; letter-spacing:.02em; }
h1 { font-size:${big ? 34 : 24}px; margin:${big ? 10 : 6}mm 0 2mm; color:var(--ink); line-height:1.25; }
h2 { font-size:${big ? 20 : 15}px; margin:0 0 4mm; color:var(--ocean); font-weight:500; }
p.cta { font-size:${big ? 26 : 18}px; margin:0 0 5mm; font-weight:600; }
.qr { display:inline-block; background:#fff; padding:3mm; border-radius:4mm; }
.qr svg { width:${qr}mm; height:${qr}mm; display:block; }
p.url { font-family: ui-monospace, Menlo, monospace; direction:ltr; unicode-bidi:isolate; font-size:${big ? 16 : 12}px; margin:5mm 0 2mm; color:var(--ink); }
p.note { font-size:${big ? 14 : 11}px; color:var(--muted); margin:0; }
.cards { display:grid; grid-template-columns: repeat(2, 90mm); gap: 6mm 8mm; justify-content:center; }
.card { width:90mm; height:55mm; border:1px dashed #9CA3AF; border-radius:3mm; padding:4mm; display:flex; flex-direction:row; align-items:center; gap:4mm; background:#fff; text-align:start; }
.card .qr { padding:1.5mm; flex:none; }
.card .meta { flex:1; min-width:0; }
.card .brand { font-size:9px; }
.card .nm { font-size:14px; font-weight:700; color:var(--ink); margin:2mm 0 0; }
.card .st { font-size:11px; color:var(--ocean); margin:0 0 2mm; }
.card .cta { font-size:11px; font-weight:600; margin:0 0 1mm; }
.card .url { font-size:8px; margin:1mm 0 0; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .noprint { display:none; } }
`;
}

export function renderPosterHtml(input: PosterInput): string {
  const s = STR[input.lang];
  const rtl = input.lang === "ar";
  const name = escapeHtml(rtl ? input.nameAr || input.nameEn : input.nameEn);
  const sub = (rtl ? input.subtitleAr || input.subtitleEn : input.subtitleEn) ?? "";
  const subHtml = sub ? escapeHtml(sub) : "";
  const cta = input.kind === "DESK" ? s.desk : input.kind === "DOCTOR_CARD" ? s.doctor : s.poster;
  const url = escapeHtml(input.shortUrl.replace(/^https?:\/\//, ""));
  let body: string;
  if (input.kind === "DOCTOR_CARD") {
    const card = `<div class="card">${`<div class="qr" role="img" aria-label="QR">${input.qrSvg}</div>`}<div class="meta">${brandRow(input.lang)}<p class="nm">${name}</p><p class="st">${subHtml}</p><p class="cta">${escapeHtml(cta)}</p><p class="url">${url}</p></div></div>`;
    body = `<div class="cards">${Array.from({ length: 10 }, () => card).join("")}</div>`;
  } else {
    body = `<div class="sheet">${brandRow(input.lang)}<h1>${name}</h1>${subHtml ? `<h2>${subHtml}</h2>` : ""}<p class="cta">${escapeHtml(cta)}</p><div class="qr" role="img" aria-label="QR">${input.qrSvg}</div><p class="url">${url}</p><p class="note">${escapeHtml(s.scan)} · ${escapeHtml(s.note)}</p></div>`;
  }
  const print = input.autoPrint ? "<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)})</script>" : "";
  return `<!doctype html><html lang="${input.lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${name}</title><style>${sheetCss(input.size, input.kind)}</style></head><body>${body}${print}</body></html>`;
}
