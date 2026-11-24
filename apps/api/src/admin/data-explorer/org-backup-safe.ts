import { Unzip, UnzipInflate } from "fflate";

/**
 * Safe organization-backup restore primitives (pentest 2026-11, finding KX-PT-01, Critical).
 *
 * The old restore ran every `INSERT INTO "<allow-listed table>" ...` line of an uploaded .sql with `$executeRawUnsafe`. A group admin of ANY
 * tenant could therefore upload `INSERT INTO "User" ... ON CONFLICT (id) DO UPDATE SET "passwordHash" = ...` and take over any account of any
 * tenant (or the platform), plant rows in other tenants, read other tenants' tables through `INSERT ... SELECT`, and write the global feature flags.
 *
 * Now the SQL is never executed as text. `parseExportInserts` accepts ONLY the exact grammar our own exporter writes
 *   INSERT INTO "Table" ("col", ...) VALUES (literal, ...);     literal = NULL | TRUE | FALSE | number | 'string' | 'json'::jsonb
 * and `buildInsert` re-serialises the validated tokens itself, so nothing the uploader typed reaches the database as SQL: no ON CONFLICT, no
 * sub-selects, no functions, no second statement. Tenant ownership of the row and of every foreign key is enforced by the caller (`RESTORE_*`).
 */

export const RESTORABLE_TABLES = [
  "Clinic", "ClinicAdminScope", "UserNavTabGrant", "User", "Patient", "PatientDocument", "Employee", "Appointment", "Encounter", "Diagnosis", "EncounterMedication",
  "EncounterDocument", "Operation", "OperationDocument", "OperationMedication", "Expense", "RevenueEntry", "Attendance", "LeaveRequest",
] as const; // AuditLog is deliberately NOT restorable: an audit trail must not be writable by the people it audits
export type RestorableTable = (typeof RESTORABLE_TABLES)[number];
/** Never restorable from a tenant upload: the Tenant row itself (plan / status / billing fields) and platform-wide FeatureFlag rows. */
export const NEVER_RESTORE = new Set(["Tenant", "FeatureFlag"]);

/** Tenant-scoped parent of a foreign-key column (the parent row must belong to the restoring tenant). Columns not listed here and ending in `Id` are rejected. */
export const TENANT_FK: Record<string, Record<string, string>> = {
  Clinic: { parentClinicId: "Clinic" },
  ClinicAdminScope: { clinicId: "Clinic", userId: "User" },
  UserNavTabGrant: { userId: "User", updatedByUserId: "User" },
  User: { supervisorUserId: "User" },
  Patient: { homeBranchId: "Clinic" },
  PatientDocument: { patientId: "Patient" },
  Employee: { clinicId: "Clinic", userId: "User" },
  Appointment: { appointmentTypeId: "AppointmentType", clinicId: "Clinic", clinicianId: "User", integrationClientId: "IntegrationClient", patientId: "Patient", seriesId: "AppointmentSeries" },
  Encounter: { amendedByUserId: "User", appointmentId: "Appointment", clinicId: "Clinic", clinicalTemplateId: "ClinicalFormTemplate", clinicianId: "User", patientId: "Patient", signedByUserId: "User" },
  Diagnosis: { encounterId: "Encounter" },
  EncounterMedication: { encounterId: "Encounter" },
  EncounterDocument: { encounterId: "Encounter" },
  Operation: { clinicId: "Clinic", clinicianId: "User", createdByUserId: "User", integrationClientId: "IntegrationClient", patientId: "Patient" },
  OperationDocument: { operationId: "Operation" },
  OperationMedication: { operationId: "Operation" },
  Expense: { clinicId: "Clinic", employeeId: "Employee" },
  RevenueEntry: { appointmentId: "Appointment", clinicId: "Clinic", encounterId: "Encounter", operationId: "Operation" },
  Attendance: { employeeId: "Employee" },
  LeaveRequest: { employeeId: "Employee" },
};
/** Foreign keys to GLOBAL (non tenant-owned) catalogue tables that are safe to keep as they are. */
export const GLOBAL_FK = new Set(["drugProductId", "marketId"]);
/** Columns an uploaded backup may never set: authentication secrets of other people are only restored for users of this tenant (checked) but integration/platform links never. */
export const FORBIDDEN_COLUMNS = new Set(["platformIntegrationClientId"]);
/** Roles an uploaded backup can never grant (platform operator). */
export const FORBIDDEN_ROLE_VALUES = new Set(["PLATFORM_SUPER_ADMIN"]);

export type Literal = { kind: "null" } | { kind: "bool"; v: boolean } | { kind: "num"; v: string } | { kind: "str"; v: string } | { kind: "json"; v: string };
export type ParsedInsert = { table: string; columns: string[]; values: Literal[] };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const NUM = /^-?\d{1,30}(\.\d{1,30})?([eE][+-]?\d{1,4})?$/;

class Cursor {
  i = 0;
  constructor(readonly s: string) {}
  ws() { for (;;) { const c = this.s.charCodeAt(this.i); if (c === 32 || c === 9 || c === 10 || c === 13) this.i++; else break; } }
  eat(tok: string): boolean { if (this.s.startsWith(tok, this.i)) { this.i += tok.length; return true; } return false; }
  eatWord(w: string): boolean { if (this.s.slice(this.i, this.i + w.length).toUpperCase() === w && !/[A-Za-z0-9_]/.test(this.s[this.i + w.length] ?? "")) { this.i += w.length; return true; } return false; }
}

function quotedIdent(c: Cursor): string | null {
  if (!c.eat('"')) return null;
  const end = c.s.indexOf('"', c.i);
  if (end < 0) return null;
  const name = c.s.slice(c.i, end); c.i = end + 1;
  return IDENT.test(name) ? name : null;
}

function stringLiteral(c: Cursor): string | null {
  if (!c.eat("'")) return null;
  let out = ""; const s = c.s;
  for (;;) {
    const q = s.indexOf("'", c.i);
    if (q < 0) return null;
    out += s.slice(c.i, q);
    if (s[q + 1] === "'") { out += "'"; c.i = q + 2; continue; }
    c.i = q + 1;
    break;
  }
  return out.includes("\0") ? null : out;
}

function literal(c: Cursor): Literal | null {
  c.ws();
  if (c.eatWord("NULL")) return { kind: "null" };
  if (c.eatWord("TRUE")) return { kind: "bool", v: true };
  if (c.eatWord("FALSE")) return { kind: "bool", v: false };
  if (c.s[c.i] === "'") {
    const str = stringLiteral(c);
    if (str === null) return null;
    if (c.eat("::jsonb")) { try { JSON.parse(str); } catch { return null; } return { kind: "json", v: str }; }
    return { kind: "str", v: str };
  }
  const m = /^-?[0-9][0-9.eE+-]*/.exec(c.s.slice(c.i, c.i + 64));
  if (m && NUM.test(m[0])) { c.i += m[0].length; return { kind: "num", v: m[0] }; }
  return null;
}

function statement(c: Cursor): ParsedInsert | null {
  if (!c.eatWord("INSERT")) return null;
  c.ws(); if (!c.eatWord("INTO")) return null;
  c.ws(); const table = quotedIdent(c); if (!table) return null;
  c.ws(); if (!c.eat("(")) return null;
  const columns: string[] = [];
  for (;;) {
    c.ws(); const col = quotedIdent(c); if (!col) return null;
    columns.push(col); c.ws();
    if (c.eat(",")) continue;
    if (c.eat(")")) break;
    return null;
  }
  c.ws(); if (!c.eatWord("VALUES")) return null;
  c.ws(); if (!c.eat("(")) return null;
  const values: Literal[] = [];
  for (;;) {
    const lit = literal(c); if (!lit) return null;
    values.push(lit); c.ws();
    if (c.eat(",")) continue;
    if (c.eat(")")) break;
    return null;
  }
  c.ws(); if (!c.eat(";")) return null;
  if (columns.length !== values.length || new Set(columns).size !== columns.length || columns.length > 200) return null;
  return { table, columns, values };
}

/** Linear-time parse. Anything that is not exactly the exporter grammar is counted in `rejected` and skipped; `-- comment` lines are ignored. */
export function parseExportInserts(sql: string, maxStatements = 1_000_000): { statements: ParsedInsert[]; rejected: number } {
  const c = new Cursor(sql);
  const statements: ParsedInsert[] = []; let rejected = 0;
  while (c.i < sql.length && statements.length + rejected < maxStatements) {
    c.ws();
    if (c.i >= sql.length) break;
    if (sql.startsWith("--", c.i)) { const nl = sql.indexOf("\n", c.i); c.i = nl < 0 ? sql.length : nl + 1; continue; }
    const start = c.i;
    const st = statement(c);
    if (st) { statements.push(st); continue; }
    rejected++;
    c.i = start;
    const next = sql.indexOf("\nINSERT", start + 1); // resynchronise on the next statement start; the rejected text is never executed
    c.i = next < 0 ? sql.length : next + 1;
  }
  return { statements, rejected };
}

const lit = (l: Literal): string => {
  switch (l.kind) {
    case "null": return "NULL";
    case "bool": return l.v ? "TRUE" : "FALSE";
    case "num": return l.v;
    case "str": return `'${l.v.replace(/'/g, "''")}'`;
    case "json": return `'${l.v.replace(/'/g, "''")}'::jsonb`;
  }
};

/** SQL rebuilt from validated tokens only (identifiers match IDENT, literals are re-escaped). */
export function buildInsert(p: ParsedInsert): string {
  return `INSERT INTO "${p.table}" (${p.columns.map((c) => `"${c}"`).join(", ")}) VALUES (${p.values.map(lit).join(", ")})`;
}

export type RestoreVerdict = { ok: true; fks: Array<{ column: string; parent: string; id: string }> } | { ok: false; reason: string };

/**
 * Static checks for one statement (no database access): allow-listed table, never Tenant/FeatureFlag, tenantId literal must equal the restoring tenant,
 * no integration links, no platform role, and every `...Id` column must be a known tenant-scoped FK (returned for the caller to verify) or a global one.
 */
export function checkRestoreStatement(p: ParsedInsert, tenantId: string): RestoreVerdict {
  if (NEVER_RESTORE.has(p.table)) return { ok: false, reason: "TABLE_NOT_RESTORABLE" };
  if (!(RESTORABLE_TABLES as readonly string[]).includes(p.table)) return { ok: false, reason: "TABLE_NOT_ALLOWED" };
  const fks: Array<{ column: string; parent: string; id: string }> = [];
  const hasTenantCol = p.columns.includes("tenantId");
  const needsTenant = p.table !== "Attendance" && p.table !== "LeaveRequest";
  if (needsTenant && !hasTenantCol) return { ok: false, reason: "TENANT_ID_REQUIRED" };
  for (let i = 0; i < p.columns.length; i++) {
    const col = p.columns[i]!, v = p.values[i]!;
    if (col === "tenantId") { if (v.kind !== "str" || v.v !== tenantId) return { ok: false, reason: "CROSS_TENANT" }; continue; }
    if (FORBIDDEN_COLUMNS.has(col)) { if (v.kind !== "null") return { ok: false, reason: "COLUMN_NOT_RESTORABLE" }; continue; }
    if (col === "role" && v.kind === "str" && FORBIDDEN_ROLE_VALUES.has(v.v)) return { ok: false, reason: "ROLE_NOT_GRANTABLE" };
    if (col === "additionalRoles" && v.kind !== "null" && /PLATFORM_SUPER_ADMIN/.test(lit(v))) return { ok: false, reason: "ROLE_NOT_GRANTABLE" };
    if (col === "id") { if (v.kind !== "str") return { ok: false, reason: "BAD_ID" }; continue; }
    if (/Id$/.test(col)) {
      if (v.kind === "null") continue;
      if (GLOBAL_FK.has(col)) continue;
      const parent = TENANT_FK[p.table]?.[col];
      if (!parent || v.kind !== "str") return { ok: false, reason: "FOREIGN_KEY_NOT_ALLOWED" };
      fks.push({ column: col, parent, id: v.v });
    }
  }
  return { ok: true, fks };
}

/** `files/<kind>/<tenantId>/...`: restored object keys must live under the restoring tenant's own folder, never `..`, never absolute. */
export function restorableObjectPath(kind: string, relativePath: string, tenantId: string, ownUserIds: ReadonlySet<string> = new Set()): string | null {
  if (!/^(encounters|expenses|employees|patients|operations|users|clinics|revenue|clinicians|marketplace-profiles)$/.test(kind)) return null;
  if (typeof relativePath !== "string" || relativePath.length > 400 || relativePath.includes("\0") || relativePath.includes("\\")) return null;
  const segs = relativePath.replace(/^\.\//, "").split("/");
  if (segs.some((s) => s === "" || s === "." || s === "..")) return null;
  if (segs[0] === tenantId) return segs.join("/");
  if (kind === "users" && segs.length >= 2 && ownUserIds.has(segs[1]!)) return segs.join("/"); // avatars: `<scope>/<userId>/<file>`
  return null;
}

export class UnzipLimitError extends Error {}
/** Streaming unzip with hard caps on the bytes ACTUALLY produced (declared sizes are attacker-controlled): zip bombs stop at `maxTotal`. */
export function safeUnzip(data: Uint8Array, limits: { maxTotal: number; maxEntries: number; maxEntry: number }): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  let total = 0, entries = 0;
  const uz = new Unzip();
  uz.register(UnzipInflate);
  uz.onfile = (f) => {
    if (++entries > limits.maxEntries) throw new UnzipLimitError("ZIP_TOO_MANY_ENTRIES");
    if (f.originalSize !== undefined && f.originalSize > limits.maxEntry) throw new UnzipLimitError("ZIP_ENTRY_TOO_LARGE");
    const chunks: Uint8Array[] = []; let size = 0;
    f.ondata = (err, chunk, final) => {
      if (err) throw err;
      size += chunk.length; total += chunk.length;
      if (size > limits.maxEntry) throw new UnzipLimitError("ZIP_ENTRY_TOO_LARGE");
      if (total > limits.maxTotal) throw new UnzipLimitError("ZIP_TOO_LARGE");
      chunks.push(chunk);
      if (final) { const buf = new Uint8Array(size); let o = 0; for (const ch of chunks) { buf.set(ch, o); o += ch.length; } out[f.name] = buf; }
    };
    f.start();
  };
  uz.push(data, true);
  return out;
}
