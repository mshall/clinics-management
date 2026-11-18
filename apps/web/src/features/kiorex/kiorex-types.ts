export type KiorexCancellationPolicy = {
  patientCancelMinHours: number;
  patientRescheduleMinHours: number;
  depositRefundMinHours: number;
  maxPatientReschedules: number;
};

export type KiorexReviewDto = {
  id: string;
  clinicianId: string;
  clinicianName: string | null;
  rating: number;
  comment: string | null;
  reviewedAt: string;
  replyText: string | null;
  repliedAt: string | null;
};

export type KiorexRatingsDto = {
  clinicId: string;
  overall: { averageRating: number | null; reviewCount: number };
  doctors: { clinicianId: string; clinicianName: string | null; averageRating: number; reviewCount: number; syncedAt: string }[];
  reviews: KiorexReviewDto[];
};

export type KiorexSettingsDto = {
  clinicId: string;
  cancellationPolicy: {
    effective: KiorexCancellationPolicy;
    marketDefault: KiorexCancellationPolicy;
    override: Partial<KiorexCancellationPolicy> | null;
  };
};
