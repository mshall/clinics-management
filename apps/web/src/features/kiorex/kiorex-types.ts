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

export type KiorexDoctorSettings = {
  listingId: string;
  clinicianId: string;
  clinicianName: string;
  status: "DRAFT" | "PENDING_VERIFICATION" | "LIVE" | "PAUSED";
  pausedReason: string | null;
  blockers: string[];
  completenessPercent: number;
  verificationStatus: string | null;
  dailyCap: number | null;
};

export type KiorexTypeSettings = {
  id: string;
  nameEn: string;
  nameAr: string;
  sharedAcrossBranches: boolean;
  feeAmount: number;
  marketplaceBookable: boolean;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  depositAmount: number | null;
};

export type KiorexOverviewDto = {
  clinicId: string;
  periodKey: string;
  currency: string;
  profileViews: number;
  bookings: number;
  bookingsByChannel: { marketplace: number; whatsapp: number; clinicLink: number };
  attended: number;
  noShows: number;
  cancelled: number;
  newPatients: number;
  commission: { amount: number; chargedVisits: number; confirmed: number; pending: number };
  daily: { date: string; views: number; bookings: number; attended: number }[];
  rating: { averageRating: number | null; reviewCount: number };
  creditOffset: number | null;
  freeProgress: {
    progressPercent: number;
    patientsAttended: number;
    patientsTarget: number;
    patientsStillNeeded: number;
    isFreeThisMonth: boolean;
    subscriptionAmount: number;
    currency: string;
  } | null;
};

export type KiorexSettingsDto = {
  clinicId: string;
  autoConfirm: boolean;
  doctors: KiorexDoctorSettings[];
  appointmentTypes: KiorexTypeSettings[];
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
    /** Never null since GRW-P1-D1: the dedicated widget origin when configured, else the Kiorex canonical page; carries the signed touch for tracked visits. */
    widgetUrl: string | null;
  }[];
  appointmentTypes: { id: string; nameEn: string; nameAr: string; durationMinutes: number; feeAmount: string | null }[];
  widgetUrl: string | null;
};
