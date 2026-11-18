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

export type KiorexBookingLinkDto = {
  clinicId: string;
  clinicNameEn: string;
  clinicNameAr: string;
  slug: string;
  url: string;
  channel: "CLINIC_LINK";
  commissionFree: true;
  doctors: { listingId: string; clinicianId: string; nameEn: string; nameAr: string; slug: string; url: string }[];
};

export type PublicBookingPageDto = {
  slug: string;
  channel: "CLINIC_LINK";
  commissionFree: true;
  clinic: {
    id: string;
    nameEn: string;
    nameAr: string;
    logoUrl: string | null;
    brandColor: string;
    city: string;
    addressEn: string;
    addressAr: string;
    locationUrl: string;
    phone: string;
    currency: string;
  };
  doctors: {
    clinicianId: string;
    slug: string | null;
    nameEn: string;
    nameAr: string;
    titleEn: string | null;
    titleAr: string | null;
    specialty: string | null;
    widgetUrl: string | null;
  }[];
  appointmentTypes: { id: string; nameEn: string; nameAr: string; durationMinutes: number; feeAmount: string | null }[];
  widgetUrl: string | null;
};
