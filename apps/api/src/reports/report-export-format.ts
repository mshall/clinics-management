/** RP-02 — dependency-free xlsx (SpreadsheetML) + minimal PDF for report exports. */

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

export const REPORT_EXPORT_KEYS = [
  "profit-loss",
  "performance",
  "operations",
  "payments",
  "clinic-breakdown",
  "monthly-series",
  "patient-acquisition",
  "operation-acquisition",
  "encounter-acquisition",
] as const;

export type ReportExportKey = (typeof REPORT_EXPORT_KEYS)[number];

export function isReportExportKey(key: string): key is ReportExportKey {
  return (REPORT_EXPORT_KEYS as readonly string[]).includes(key);
}

/** Money-bearing report keys — require money visibility. */
export const MONEY_REPORT_KEYS: ReadonlySet<ReportExportKey> = new Set([
  "profit-loss",
  "performance",
  "payments",
  "clinic-breakdown",
  "monthly-series",
  "operations",
  "operation-acquisition",
  "encounter-acquisition",
]);

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function cellValue(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/** SpreadsheetML 2003 XML — Excel and LibreOffice open as a workbook. */
export function buildSpreadsheetMl(sheetName: string, rows: ExportRow[]): Buffer {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : ["empty"];
  const headerCells = headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("");
  const body = rows
    .map((row) => {
      const cells = headers
        .map((h) => {
          const raw = row[h];
          if (typeof raw === "number" && Number.isFinite(raw)) {
            return `<Cell><Data ss:Type="Number">${raw}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${escapeXml(cellValue(raw))}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${escapeXml(sheetName.slice(0, 31))}">
  <Table>
   <Row>${headerCells}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
  return Buffer.from(xml, "utf8");
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Minimal single-page PDF listing rows (title + key: value lines). */
export function buildReportPdf(title: string, rows: ExportRow[], maxLines = 40): Buffer {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const lines: string[] = [title];
  for (const row of rows.slice(0, maxLines)) {
    const line = headers.map((h) => `${h}=${cellValue(row[h])}`).join(" | ");
    lines.push(line.slice(0, 110));
  }
  if (rows.length > maxLines) lines.push(`… ${rows.length - maxLines} more rows`);

  const contentParts = ["BT", "/F1 9 Tf", "40 770 Td"];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) contentParts.push("0 -12 Td");
    contentParts.push(`(${escapePdfText(lines[i]!)}) Tj`);
  }
  contentParts.push("ET");
  const stream = contentParts.join("\n");
  const streamLen = Buffer.byteLength(stream, "utf8");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function flattenObjectRows(prefix: string, data: unknown): ExportRow[] {
  if (data == null) return [{ section: prefix, value: "" }];
  if (Array.isArray(data)) {
    if (data.length === 0) return [{ section: prefix, value: "(empty)" }];
    if (typeof data[0] === "object" && data[0] != null) {
      return data.map((item, i) => {
        const row: ExportRow = { section: prefix, index: i + 1 };
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          row[k] = v == null || typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean);
        }
        return row;
      });
    }
    return data.map((v, i) => ({ section: prefix, index: i + 1, value: cellValue(v as string | number) }));
  }
  if (typeof data === "object") {
    const row: ExportRow = { section: prefix };
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (v != null && typeof v === "object") {
        row[k] = JSON.stringify(v);
      } else {
        row[k] = v as string | number | boolean | null;
      }
    }
    return [row];
  }
  return [{ section: prefix, value: cellValue(data as string | number) }];
}
