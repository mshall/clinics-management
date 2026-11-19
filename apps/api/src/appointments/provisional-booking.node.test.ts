import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { ProvisionalPatientDto } from "./dto/provisional-patient.dto";

describe("provisional booking DTO shape", () => {
  it("allows provisionalPatient without patientId on the create DTO type", () => {
    const dto = new CreateAppointmentDto();
    dto.clinicId = "c1";
    dto.clinicianId = "u1";
    dto.startsAt = new Date().toISOString();
    const provisional = new ProvisionalPatientDto();
    provisional.firstNameEn = "Sara";
    provisional.lastNameEn = "Ali";
    provisional.phone = "+201001234567";
    dto.provisionalPatient = provisional;
    assert.equal(dto.patientId, undefined);
    assert.equal(dto.provisionalPatient.firstNameEn, "Sara");
  });
});
