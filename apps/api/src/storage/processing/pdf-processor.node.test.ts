import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { processPdf } from "./pdf-processor";
import { loadQualityPolicyConfig } from "./quality-policy";

const cfg = loadQualityPolicyConfig();

function minimalPdf(extra = ""): Buffer {
  // Minimal valid-enough PDF for JS/embedded detection heuristics
  const body = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj
trailer<< /Root 1 0 R >>
%%EOF
${extra}`;
  return Buffer.from(body, "latin1");
}

describe("pdf-processor", () => {
  it("KEEP under threshold untouched", async () => {
    const pdf = minimalPdf();
    assert.ok(pdf.length <= cfg.thresholdBytes);
    const out = await processPdf(pdf, cfg);
    assert.equal(out.qualityNote, "ORIGINAL_KEPT");
    assert.equal(out.body.equals(pdf), true);
    assert.equal(out.rejected, undefined);
  });

  it("rejects JavaScript PDFs", async () => {
    const pdf = minimalPdf("/JavaScript (app.alert(1);)");
    const out = await processPdf(pdf, cfg);
    assert.equal(out.rejected, true);
    assert.equal(out.rejectReason, "pdf_javascript_or_embedded");
  });
});
