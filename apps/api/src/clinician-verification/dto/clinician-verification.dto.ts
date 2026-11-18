import { ClinicalSpecialty, VerificationStatus } from "@prisma/client";

export type ClinicianVerificationDocumentDto = {
  kind: string;
  originalFileName: string;
  mimeType: string;
  uploadedAt: string;
};

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
};

export type PlatformVerificationListItemDto = ClinicianVerificationDto & {
  clinicianName: string;
  clinicianEmail: string;
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
  rejectTemplates: { code: string; labelEn: string; labelAr: string }[];
};