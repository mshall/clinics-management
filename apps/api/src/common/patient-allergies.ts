import { BadRequestException } from "@nestjs/common";
import { PatientAllergyCode } from "@prisma/client";
import type { PatientAllergyInputDto } from "../patients/dto/patient-allergy-input.dto";

export const PATIENT_ALLERGY_CODES = Object.values(PatientAllergyCode);

export function normalizePatientAllergyInputs(items: PatientAllergyInputDto[] | undefined): PatientAllergyInputDto[] {
  if (!items?.length) return [];
  const out: PatientAllergyInputDto[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const code = raw.code;
    const comment = raw.otherComment?.trim() ?? "";
    if (code === PatientAllergyCode.OTHER) {
      if (!comment) throw new BadRequestException("otherComment is required for allergy OTHER");
      const key = `OTHER:${comment.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ code, otherComment: comment });
    } else {
      if (seen.has(code)) continue;
      seen.add(code);
      if (comment) throw new BadRequestException(`otherComment is only allowed for allergy OTHER`);
      out.push({ code });
    }
  }
  return out;
}
