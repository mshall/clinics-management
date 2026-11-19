import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesShortcut } from "./keyboard-shortcuts";
import { isTransferReferenceApiError, transferReferenceIssue, validateVisitCollection } from "./visit-collection";

const rules = [
  { transferChannel: "INSTAPAY", referencePattern: "^[A-Za-z0-9][A-Za-z0-9\\-_.]{5,31}$" },
  { channelKey: "ORG_WALLET", referencePattern: "^W\\d{6}$" },
];
const t = (_k: string, fallback: string, params?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_m, p: string) => String(params?.[p] ?? ""));

describe("FS-02 transfer reference checks mirror the API", () => {
  it("flags short and badly formatted references per channel", () => {
    assert.equal(transferReferenceIssue("INSTAPAY", "ab", rules), "required");
    assert.equal(transferReferenceIssue("INSTAPAY", "@@bad@@", rules), "format");
    assert.equal(transferReferenceIssue("instapay", "IP-8F92A1BC", rules), null);
    assert.equal(transferReferenceIssue("ORG_WALLET", "W123456", rules), null);
    assert.equal(transferReferenceIssue("ORG_WALLET", "123456", rules), "format");
    assert.equal(transferReferenceIssue("UNKNOWN", "abc", rules), null, "no pattern → length check only");
  });

  it("validateVisitCollection returns a readable message naming the channel", () => {
    const msg = validateVisitCollection(350, { mode: "MONEY_TRANSFER", transferChannel: "INSTAPAY", transferReference: "@@bad@@" }, t, rules);
    assert.match(msg ?? "", /INSTAPAY reference/);
    assert.equal(validateVisitCollection(350, { mode: "CASH_ON_VISIT" }, t, rules), null);
  });

  it("recognises API errors that belong on the transaction-ID field", () => {
    assert.equal(isTransferReferenceApiError({ field: "transferReference", errorCode: "TRANSFER_REFERENCE_FORMAT" }), true);
    assert.equal(isTransferReferenceApiError({ message: "Slot taken" }), false);
  });
});

describe("FS-02 keyboard shortcuts", () => {
  const ev = (key: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string }> = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    code: "",
    ...mods,
  });
  it("Ctrl or Cmd + Enter submits; plain Enter does not", () => {
    const s = { key: "Enter", mod: true, handler: () => undefined };
    assert.equal(matchesShortcut(ev("Enter", { ctrlKey: true }), s), true);
    assert.equal(matchesShortcut(ev("Enter", { metaKey: true }), s), true);
    assert.equal(matchesShortcut(ev("Enter"), s), false);
  });
  it("Alt+digit works on macOS where the key is a symbol", () => {
    const s = { key: "2", alt: true, handler: () => undefined };
    assert.equal(matchesShortcut(ev("™", { altKey: true, code: "Digit2" }), s), true);
    assert.equal(matchesShortcut(ev("2"), s), false);
  });
});
