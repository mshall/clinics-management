import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPendingDocumentFieldErrors } from "./pending-document-validation";
import type { PendingDocumentRow } from "./pending-document-types";

function row(partial: Partial<PendingDocumentRow> & { id: string }): PendingDocumentRow {
  return {
    files: partial.files ?? [new File(["x"], "a.pdf")],
    category: partial.category ?? "",
    otherDetail: partial.otherDetail ?? "",
    id: partial.id,
  };
}

test("uniqueCategories rejects duplicate types across rows", () => {
  const result = collectPendingDocumentFieldErrors(
    [
      row({ id: "1", category: "CONSENT" }),
      row({ id: "2", category: "CONSENT" }),
    ],
    { uniqueCategories: true },
  );
  assert.equal(result.code, "doc_category_duplicate");
  assert.ok(result.invalidRowIds.has("2:category"));
});

test("uniqueCategories rejects reserved saved categories", () => {
  const result = collectPendingDocumentFieldErrors(
    [row({ id: "1", category: "OPERATION_REPORT" })],
    { uniqueCategories: true, reservedCategories: ["OPERATION_REPORT"] },
  );
  assert.equal(result.code, "doc_category_duplicate");
});

test("uniqueCategories allows distinct types", () => {
  const result = collectPendingDocumentFieldErrors(
    [
      row({ id: "1", category: "CONSENT" }),
      row({ id: "2", category: "LAB_RESULTS" }),
    ],
    { uniqueCategories: true },
  );
  assert.equal(result.code, null);
});
