import { strFromU8, unzipSync } from "fflate";

export type SheetRows = string[][];

const ARABIC_INDIC = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** Arabic-Indic / Persian digits → ASCII so dates, phones and IDs typed on Arabic keyboards validate. */
export function toAsciiDigits(value: string): string {
  return value.replace(ARABIC_INDIC, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** RFC 4180 CSV (quoted fields, CRLF/LF, optional UTF-8 BOM); auto-detects `;` when no comma appears in the header. */
export function parseCsv(text: string): SheetRows {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";
  const rows: SheetRows = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function textRuns(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1]);
  return out;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** First worksheet of an .xlsx workbook as a string grid (shared + inline strings, numbers as written). */
export function parseXlsx(buf: Buffer): SheetRows {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch {
    throw new Error("INVALID_XLSX");
  }
  const shared: string[] = [];
  const sst = files["xl/sharedStrings.xml"];
  if (sst) {
    for (const m of strFromU8(sst).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(m[1]));
  }
  const sheetName =
    Object.keys(files)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]))[0] ?? null;
  if (!sheetName) throw new Error("INVALID_XLSX");
  const xml = strFromU8(files[sheetName]);
  const rows: SheetRows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textRuns(body);
      else if (v !== undefined) value = decodeXml(v);
      const idx = ref ? columnIndex(ref) : row.length;
      while (row.length < idx) row.push("");
      row[idx] = value;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
}

export function parseSpreadsheet(fileName: string, buf: Buffer): SheetRows {
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(fileName)) return parseXlsx(buf);
  return parseCsv(buf.toString("utf8"));
}

/** `dd/mm/yyyy` (also `-` or `.` separators, Arabic digits, or an Excel date serial) → UTC midnight. */
export function parseDayMonthYear(raw: string): Date | null {
  const s = toAsciiDigits(raw.trim());
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** `HH:mm` (24h, Arabic digits ok) → minutes after midnight. */
export function parseTimeOfDay(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(toAsciiDigits(raw.trim()));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function csvEscape(value: string): string {
  return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** UTF-8 BOM so Excel opens Arabic headers correctly. */
export function toCsv(rows: string[][]): Buffer {
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  return Buffer.from(`\uFEFF${body}\r\n`, "utf8");
}
