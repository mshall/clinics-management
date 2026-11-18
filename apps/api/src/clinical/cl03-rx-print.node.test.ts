import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBilingualPdf } from "../billing-platform/bilingual-pdf";
import { prescriptionPdfSections, printedRxItem, toVerificationView, type PrintedRx } from "./rx-print";
import { arabicInstructionLine, sigToArabic } from "./rx-sig-ar";
import { rxTokenTtlDays } from "./rx-share.service";

const printed: PrintedRx = {
  encounterId: "enc1",
  clinicNameEn: "Nile Clinic",
  clinicNameAr: "عيادة النيل",
  doctorName: "Dr. Mona Adel",
  patientName: "Ahmed Samir Hassan",
  signedAt: "2026-11-18T10:00:00.000Z",
  items: [
    printedRxItem({
      drugName: "Augmentin 1g",
      dosage: "1 tab",
      frequency: "twice daily",
      duration: "7 days",
      instructions: "after meals",
      drugProduct: {
        brandNameEn: "Augmentin",
        strength: "1 g",
        defaultSigAr: null,
        ingredients: [{ ingredient: { nameEn: "Amoxicillin" } }, { ingredient: { nameEn: "Clavulanic acid" } }],
      },
    }),
  ],
  verifyUrl: "https://app.test/rx/abc",
};

function leafStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => leafStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => leafStrings(x, out));
  return out;
}

describe("CL-03 printed Rx", () => {
  it("prints brand + active ingredients + Arabic instructions", () => {
    const item = printed.items[0]!;
    assert.equal(item.brand, "Augmentin");
    assert.deepEqual(item.ingredients, ["Amoxicillin", "Clavulanic acid"]);
    assert.equal(item.instructionsAr, "مرتين يومياً — لمدة ٧ أيام — بعد الأكل");
  });

  it("translates common sigs and refuses to guess unknown English", () => {
    assert.equal(sigToArabic("TID"), "ثلاث مرات يومياً");
    assert.equal(sigToArabic("q8h"), "كل ٨ ساعات");
    assert.equal(sigToArabic("prn"), "عند اللزوم");
    assert.equal(sigToArabic("قرص بعد الغداء"), "قرص بعد الغداء");
    assert.equal(sigToArabic("apply thinly to the rash"), null);
    assert.equal(arabicInstructionLine({ defaultSigAr: "قرص كل 12 ساعة" }), "قرص كل ١٢ ساعة");
  });

  it("verification view shows no more PHI than the printed Rx", () => {
    const view = toVerificationView(printed, new Date("2026-12-01T00:00:00Z"));
    assert.equal(view.status, "VALID");
    if (view.status !== "VALID") return;
    const allowed = new Set([
      "status",
      "clinicNameEn",
      "clinicNameAr",
      "doctorName",
      "patientInitials",
      "signedAt",
      "items",
      "expiresAt",
    ]);
    for (const k of Object.keys(view)) assert.ok(allowed.has(k), `unexpected key ${k}`);
    assert.equal(view.patientInitials, "A. S. H.");
    const printedText = new Set(leafStrings(printed));
    for (const s of leafStrings({ ...view, status: undefined, expiresAt: undefined, patientInitials: undefined })) {
      assert.ok(printedText.has(s), `verification discloses "${s}" which is not on the printed Rx`);
    }
    assert.ok(!JSON.stringify(view).includes("Samir"), "full patient name must not be disclosed");
  });

  it("bilingual PDF embeds the verification QR", () => {
    const sections = prescriptionPdfSections(printed);
    assert.ok(sections.every((s) => s.rows.some((r) => r.kind === "qr" && r.text === printed.verifyUrl)));
    const pdf = buildBilingualPdf(sections);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.match(pdf.toString("latin1"), / re /);
  });

  it("token TTL comes from the market pack with a 14-day default", () => {
    assert.equal(rxTokenTtlDays(null), 14);
    assert.equal(rxTokenTtlDays({ rxVerification: { tokenTtlDays: 30 } }), 30);
    assert.equal(rxTokenTtlDays({ rxVerification: { tokenTtlDays: 0 } }), 14);
  });
});
