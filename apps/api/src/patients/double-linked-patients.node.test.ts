import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clusterDoubleLinkedPatients, type DoubleLinkedPatientRow } from "./double-linked-patients";

function row(partial: Partial<DoubleLinkedPatientRow> & Pick<DoubleLinkedPatientRow, "id" | "phone">): DoubleLinkedPatientRow {
  return {
    mrn: partial.mrn ?? `MRN-${partial.id}`,
    firstNameEn: partial.firstNameEn ?? "Ada",
    lastNameEn: partial.lastNameEn ?? "Lovelace",
    firstNameAr: null,
    lastNameAr: null,
    email: null,
    nationalId: partial.nationalId ?? null,
    dob: partial.dob ?? null,
    gender: "FEMALE",
    homeBranchId: null,
    createdAt: new Date("2024-01-01"),
    ...partial,
  };
}

describe("clusterDoubleLinkedPatients", () => {
  it("clusters by matching phone", () => {
    const clusters = clusterDoubleLinkedPatients([
      row({ id: "a", phone: "+20 100 111 2222" }),
      row({ id: "b", phone: "01001112222", firstNameEn: "Other" }),
      row({ id: "c", phone: "01009999999" }),
    ]);
    const phone = clusters.find((c) => c.reason === "phone");
    assert.ok(phone);
    assert.equal(phone!.patients.length, 2);
    assert.deepEqual(phone!.patients.map((p) => p.id).sort(), ["a", "b"]);
  });

  it("clusters by national ID", () => {
    const clusters = clusterDoubleLinkedPatients([
      row({ id: "a", phone: "01001110001", nationalId: "NID-1" }),
      row({ id: "b", phone: "01001110002", nationalId: "NID-1", firstNameEn: "Bob" }),
    ]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]!.reason, "nationalId");
  });

  it("clusters by name and DOB when phone differs", () => {
    const dob = new Date("1990-05-01");
    const clusters = clusterDoubleLinkedPatients([
      row({ id: "a", phone: "01001110001", firstNameEn: "Sam", lastNameEn: "Same", dob }),
      row({ id: "b", phone: "01001110099", firstNameEn: "Sam", lastNameEn: "Same", dob }),
    ]);
    assert.equal(clusters.some((c) => c.reason === "name_dob"), true);
  });
});
