import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gender, ImportEntity, UserRole } from "@prisma/client";
import { strToU8, zipSync } from "fflate";
import { parseCsv, parseDayMonthYear, parseSpreadsheet, parseTimeOfDay } from "./import-parse";
import { mapHeaders, templateCsv } from "./import-templates";
import { resolveNationalIdPattern, validateImport, type ImportValidationContext, type PatientImportRow } from "./import-validate";

function ctx(over: Partial<ImportValidationContext> = {}): ImportValidationContext {
  return {
    country: "EG",
    nationalIdPattern: resolveNationalIdPattern("EG", null),
    patientsByPhone: new Map(),
    patientsByNationalId: new Map(),
    patientsByMrn: new Map(),
    cliniciansByEmail: new Map(),
    clinicsByName: new Map(),
    defaultClinic: null,
    catalogCodes: new Set(),
    userEmails: new Set(),
    ...over,
  };
}

describe("ON-05 import parsing", () => {
  it("parses quoted CSV with BOM, CRLF and embedded commas", () => {
    const rows = parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n\r\n');
    assert.deepEqual(rows, [
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });

  it("parses dd/mm/yyyy, Arabic digits and Excel serials; rejects impossible dates", () => {
    assert.equal(parseDayMonthYear("21/03/1990")?.toISOString(), "1990-03-21T00:00:00.000Z");
    assert.equal(parseDayMonthYear("٢١/٠٣/١٩٩٠")?.toISOString(), "1990-03-21T00:00:00.000Z");
    assert.equal(parseDayMonthYear("45658")?.toISOString(), "2025-01-01T00:00:00.000Z");
    assert.equal(parseDayMonthYear("31/02/2020"), null);
    assert.equal(parseDayMonthYear("2020-01-01"), null);
    assert.equal(parseTimeOfDay("17:30"), 1050);
    assert.equal(parseTimeOfDay("25:00"), null);
  });

  it("reads the first sheet of an xlsx with shared and inline strings", () => {
    const sheet = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>منى</t></is></c><c r="B2"><v>201001234567</v></c></row>
    </sheetData></worksheet>`;
    const sst = `<sst><si><t>firstNameAr</t></si><si><t>phone</t></si></sst>`;
    const buf = Buffer.from(zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet), "xl/sharedStrings.xml": strToU8(sst) }));
    assert.deepEqual(parseSpreadsheet("p.xlsx", buf), [
      ["firstNameAr", "phone"],
      ["منى", "201001234567"],
    ]);
  });

  it("templates carry Arabic and English headers that map back to keys", () => {
    const ar = templateCsv(ImportEntity.PATIENTS, "ar").toString("utf8");
    assert.ok(ar.startsWith("\uFEFF"));
    const header = parseCsv(ar)[0];
    const { keys, missing } = mapHeaders(ImportEntity.PATIENTS, header);
    assert.deepEqual(missing, []);
    assert.ok(keys.includes("phone") && keys.includes("firstNameAr"));
  });
});

describe("ON-05 validation", () => {
  const header = ["firstNameEn", "lastNameEn", "firstNameAr", "phone", "nationalId", "dob", "gender"];

  it("flags bad phones, dates, national IDs, Arabic names and in-file duplicates", () => {
    const res = validateImport(
      ImportEntity.PATIENTS,
      [
        header,
        ["Mona", "Hassan", "منى", "01001234567", "29001011234567", "01/01/1990", "F"],
        ["Ali", "", "Ali123", "12", "123", "31/02/1990", "X"],
        ["Mona Ali", "", "", "+201001234567", "", "", ""],
      ],
      ctx(),
    );
    assert.equal(res.valid.length, 1);
    const codes = res.errors.map((e) => `${e.row}:${e.field}:${e.code}`);
    assert.ok(codes.includes("3:phone:PHONE_INVALID"));
    assert.ok(codes.includes("3:dob:DATE_INVALID"));
    assert.ok(codes.includes("3:nationalId:NATIONAL_ID_INVALID"));
    assert.ok(codes.includes("3:firstNameAr:ARABIC_NAME_INVALID"));
    assert.ok(codes.includes("3:gender:GENDER_INVALID"));
    assert.ok(codes.includes("4:phone:DUPLICATE_IN_FILE"));
    const p = res.valid[0] as PatientImportRow;
    assert.equal(p.phone, "+201001234567");
    assert.equal(p.gender, Gender.F);
  });

  it("marks rows matching an existing patient by phone or national ID as duplicates (not errors)", () => {
    const res = validateImport(
      ImportEntity.PATIENTS,
      [header, ["Mona", "", "", "01001234567", "", "", ""]],
      ctx({ patientsByPhone: new Map([["201001234567", { id: "p1", mrn: "MRN-1" }]]) }),
    );
    assert.equal(res.errors.length, 0);
    assert.equal(res.duplicateRows, 1);
    assert.equal((res.valid[0] as PatientImportRow).matchPatientId, "p1");
  });

  it("reports missing required columns", () => {
    const res = validateImport(ImportEntity.STAFF, [["displayName"], ["X"]], ctx());
    assert.deepEqual(res.missingColumns, ["email", "role"]);
  });

  it("maps Arabic staff roles and rejects existing emails", () => {
    const res = validateImport(
      ImportEntity.STAFF,
      [
        ["displayName", "email", "role"],
        ["سارة", "sara@x.com", "استقبال"],
        ["Ali", "taken@x.com", "doctor"],
      ],
      ctx({ userEmails: new Set(["taken@x.com"]) }),
    );
    assert.equal(res.valid.length, 1);
    assert.equal((res.valid[0] as { role: UserRole }).role, UserRole.RECEPTIONIST);
    assert.equal(res.errors[0]?.code, "EMAIL_EXISTS");
  });
});
