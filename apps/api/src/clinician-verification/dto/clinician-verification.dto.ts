import { ClinicalSpecialty, Profession, VerificationStatus } from "@prisma/client";

export type ClinicianVerificationDocumentDto = {
  kind: string;
  originalFileName: string;
  mimeType: string;
  uploadedAt: string;
};

export type ProfessionalRegistrationDto = {
  registerCode: string;
  labelEn: string;
  labelAr: string;
  registrationNumber: string;
  expiresAt: string | null;
  status: VerificationStatus;
  verifiedAt: string | null;
};

export type VerificationBadgeDto = { profession: Profession | null; verified: boolean; labelEn: string; labelAr: string };

export type ClinicianVerificationDto = {
  id: string;
  userId: string;
  tenantId: string;
  syndicateNumber: string | null;
  specialty: ClinicalSpecialty | null;
  titleEn: string | null;
  titleAr: string | null;
  /** Platform reviewers only — never exposed to org users via nationalId in list. */
  hasNationalId: boolean;
  documents: ClinicianVerificationDocumentDto[];
  status: VerificationStatus;
  rejectReason: string | null;
  reviewedAt: string | null;
  verifiedSpecialty: ClinicalSpecialty | null;
  updatedAt: string;
  /** PRVER01 — profession being verified and the rule that applies (market pack). */
  profession: Profession | null;
  verifiedProfession: Profession | null;
  isSolo: boolean;
  requiredDocuments: string[];
  requiredRegisters: { code: string; labelEn: string; labelAr: string; required: boolean; hasExpiry: boolean; isSyndicate: boolean }[];
  /** PRVER02 — checklist the ops reviewer must complete for this profession (and solo status). */
  reviewChecklist: string[];
  registrations: ProfessionalRegistrationDto[];
  /** PRVER02 — profession-naming badge, e.g. "Verified physiotherapist". */
  badge: VerificationBadgeDto;
  /** PRVER03. */
  nextReverifyAt: string | null;
  reverifyReason: string | null;
  verifiedAt: string | null;
};

export type PlatformVerificationListItemDto = ClinicianVerificationDto & {
  clinicianName: string;
  clinicianEmail: string;
  clinicianCurrentProfession: Profession | null;
  tenantName: string;
  pendingAt: string | null;
  waitingMs: number | null;
  slaBreached: boolean | null;
};

export type PlatformVerificationReviewMetricsDto = {
  pendingCount: number;
  medianReviewMs: number | null;
  reviewsCounted: number;
  slaTargetHours: number;
};

export type PlatformVerificationReviewConfigDto = {
  slaTargetHours: number;
  checklistKeys: string[];
  /** PRVER02 — checklist per profession (solo adds keys) and AR/EN labels for every key. */
  checklistByProfession: Record<string, { base: string[]; solo: string[] }>;
  checklistLabels: Record<string, { en: string; ar: string }>;
  rejectTemplates: { code: string; labelEn: string; labelAr: string }[];
};