import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clusterDoubleLinkedPatients,
  isSafeAutoMergeCluster,
  patientNamesLikelySame,
  type DoubleLinkedPatientRow,
} from "./double-linked-patients";

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

  it("does not cluster placeholder phones like all zeros or ones", () => {
    const clusters = clusterDoubleLinkedPatients([
      row({ id: "a", phone: "000000000000", firstNameEn: "A", lastNameEn: "One" }),
      row({ id: "b", phone: "0000000000", firstNameEn: "B", lastNameEn: "Two" }),
      row({ id: "c", phone: "111111111111", firstNameEn: "C", lastNameEn: "Three" }),
      row({ id: "d", phone: "1111111111", firstNameEn: "D", lastNameEn: "Four" }),
    ]);
    assert.equal(clusters.filter((c) => c.reason === "phone").length, 0);
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

describe("isSafeAutoMergeCluster", () => {
  it("rejects phone clusters of different people sharing a number", () => {
    const cluster = {
      reason: "phone" as const,
      matchKey: "+201055581552",
      patients: [
        row({ id: "a", phone: "+201055581552", firstNameEn: "Adam", lastNameEn: "Ramy" }),
        row({ id: "b", phone: "01055581552", firstNameEn: "El Amir", lastNameEn: "Ebrahim" }),
      ],
    };
    assert.equal(patientNamesLikelySame(cluster.patients[0]!, cluster.patients[1]!), false);
    assert.equal(isSafeAutoMergeCluster(cluster), false);
  });

  it("allows phone clusters with compatible names", () => {
    const cluster = {
      reason: "phone" as const,
      matchKey: "+201123796540",
      patients: [
        row({ id: "a", phone: "+201123796540", firstNameEn: "Mohammed", lastNameEn: "Elnagar" }),
        row({ id: "b", phone: "01123796540", firstNameEn: "Mohammed", lastNameEn: "Elnagar" }),
      ],
    };
    assert.equal(isSafeAutoMergeCluster(cluster), true);
  });

  it("rejects phone clusters that only share a common first name", () => {
    const cluster = {
      reason: "phone" as const,
      matchKey: "+201221545402",
      patients: [
        row({ id: "a", phone: "01221545402", firstNameEn: "Mohammed", lastNameEn: "Fared" }),
        row({ id: "b", phone: "01221545402", firstNameEn: "mohammed", lastNameEn: "mohammed" }),
      ],
    };
    assert.equal(isSafeAutoMergeCluster(cluster), false);
  });

  it("allows Badry/Badr Elsayed transliteration variants", () => {
    assert.equal(
      patientNamesLikelySame(
        row({ id: "a", phone: "01111580074", firstNameEn: "Badry", lastNameEn: "Elsayed" }),
        row({ id: "b", phone: "01111580074", firstNameEn: "Badr", lastNameEn: "Elsaid" }),
      ),
      true,
    );
  });

  it("skips AES seed name+DOB clones", () => {
    const dob = new Date("1970-02-01");
    const cluster = {
      reason: "name_dob" as const,
      matchKey: "fatma|mostafa|1970-02-01",
      patients: [
        row({ id: "a", phone: "01001110001", mrn: "AES-ABC-001", firstNameEn: "Fatma", lastNameEn: "Mostafa", dob }),
        row({ id: "b", phone: "01001110099", mrn: "AES-OCT-001", firstNameEn: "Fatma", lastNameEn: "Mostafa", dob }),
      ],
    };
    assert.equal(isSafeAutoMergeCluster(cluster), false);
  });
});
