import assert from "node:assert/strict";
import test from "node:test";
import { extractPatientSearchTerm, messageAsksForPatientLookup } from "./assistant-patient-search";

test("detects patient detail lookup", () => {
  assert.ok(messageAsksForPatientLookup("Show patient details for Ahmed Hassan"));
  assert.ok(messageAsksForPatientLookup("find patient MRN-10023"));
  assert.ok(!messageAsksForPatientLookup("how many patients do we have"));
});

test("extracts patient search terms", () => {
  assert.equal(extractPatientSearchTerm("find patient MRN-10023"), "MRN-10023");
  assert.equal(extractPatientSearchTerm('patient details for "Sara Ali"'), "Sara Ali");
  assert.match(extractPatientSearchTerm("Show patient details for Ahmed Hassan"), /Ahmed Hassan/);
});

test("extracts name from look for patient named", () => {
  const term = extractPatientSearchTerm("look for a patient named Fatma Mostafa");
  assert.match(term, /fatma/i);
  assert.match(term, /mostafa/i);
  assert.ok(!/look for|named/i.test(term.toLowerCase()));
});
