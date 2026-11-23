import { ListingStatus, SubscriptionStatus, VerificationStatus } from "@prisma/client";
import { PROVIDER_PROFILE_COMPLETENESS_MIN } from "./provider-profile-schema";

export const MARKETPLACE_BLOCKER = {
  VERIFICATION: "verification",
  BILLING: "billing",
  APPOINTMENT_TYPES: "appointment_types",
  AVAILABILITY: "availability",
  OWNER: "owner",
  PROFILE: "profile",
  QUALITY: "quality",
  /** KX-23 KNKX02 / ADR-032: a SOLO nurse lists only when nurse.individual_kiorex_listing is effective (launch-locked, gate GKN2) AND PRVER04 evidence was checked. */
  SOLO_NURSE: "solo_nurse_listing",
  /** ADR-040: an organisation that started standalone lists only after it asked to connect and Kiorex ops approved it. */
  CONNECTION: "connection",
} as const;

export type MarketplaceBlockerCode = (typeof MARKETPLACE_BLOCKER)[keyof typeof MARKETPLACE_BLOCKER];

export type MarketplaceListingEligibilityInput = {
  verificationStatus: VerificationStatus | null;
  subscriptionStatus: SubscriptionStatus | null;
  marketplaceBookableTypeCount: number;
  hasAvailability: boolean;
  profileCompletenessPercent: number;
  ownerPaused?: boolean;
  /** SB-05: Lite commission invoice unpaid past the market pause window. */
  kiorexBillingPaused?: boolean;
  /**
   * Set only for SOLO nurse organizations (Nurse edition, ADR-032). `flagEffective` is the nurse.individual_kiorex_listing flag
   * (launch-locked behind gate GKN2, a human gate never recorded by code); `prver04Checked` = the verification was submitted as solo,
   * so the ID selfie match and criminal-record certificate checklist applied. Agencies list under clinic.kiorex_listing instead.
   */
  soloNurse?: { flagEffective: boolean; prver04Checked: boolean };
  /** ADR-040: undefined = legacy organisation, never gated. */
  connection?: { required: boolean; requested: boolean; paused: boolean };
};

export type MarketplaceListingEligibility = {
  blockers: MarketplaceBlockerCode[];
  status: ListingStatus;
  pausedReason: string | null;
};

const BILLING_BLOCK_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.READ_ONLY,
  SubscriptionStatus.SUSPENDED,
]);

export function evaluateMarketplaceListingEligibility(
  input: MarketplaceListingEligibilityInput,
): MarketplaceListingEligibility {
  const blockers: MarketplaceBlockerCode[] = [];

  if (input.ownerPaused) {
    blockers.push(MARKETPLACE_BLOCKER.OWNER);
  }
  if (
    input.kiorexBillingPaused ||
    (input.subscriptionStatus && BILLING_BLOCK_STATUSES.has(input.subscriptionStatus))
  ) {
    blockers.push(MARKETPLACE_BLOCKER.BILLING);
  }
  if (input.verificationStatus !== VerificationStatus.VERIFIED) {
    blockers.push(MARKETPLACE_BLOCKER.VERIFICATION);
  }
  if (input.marketplaceBookableTypeCount < 1) {
    blockers.push(MARKETPLACE_BLOCKER.APPOINTMENT_TYPES);
  }
  if (!input.hasAvailability) {
    blockers.push(MARKETPLACE_BLOCKER.AVAILABILITY);
  }
  if (input.profileCompletenessPercent < PROVIDER_PROFILE_COMPLETENESS_MIN) {
    blockers.push(MARKETPLACE_BLOCKER.PROFILE);
  }
  if (input.soloNurse && !(input.soloNurse.flagEffective && input.soloNurse.prver04Checked)) {
    blockers.push(MARKETPLACE_BLOCKER.SOLO_NURSE);
  }
  // last on purpose: blockers[0] stays the first thing the owner can fix
  if (input.connection?.required) {
    blockers.push(MARKETPLACE_BLOCKER.CONNECTION);
  }

  if (input.ownerPaused) {
    return { blockers, status: ListingStatus.PAUSED, pausedReason: MARKETPLACE_BLOCKER.OWNER };
  }
  if (blockers.includes(MARKETPLACE_BLOCKER.SOLO_NURSE)) {
    // Not listed on Kiorex; the software keeps working for the solo nurse (Q7 default: software only until GKN2).
    return { blockers, status: ListingStatus.PAUSED, pausedReason: MARKETPLACE_BLOCKER.SOLO_NURSE };
  }
  if (blockers.includes(MARKETPLACE_BLOCKER.BILLING)) {
    return { blockers, status: ListingStatus.PAUSED, pausedReason: MARKETPLACE_BLOCKER.BILLING };
  }
  if (input.connection?.paused) {
    return { blockers, status: ListingStatus.PAUSED, pausedReason: MARKETPLACE_BLOCKER.CONNECTION };
  }
  if (blockers.includes(MARKETPLACE_BLOCKER.VERIFICATION)) {
    return {
      blockers,
      status: ListingStatus.PENDING_VERIFICATION,
      pausedReason: MARKETPLACE_BLOCKER.VERIFICATION,
    };
  }
  // Request to go live submitted and nothing else is missing: waiting for Kiorex ops.
  if (input.connection?.requested && blockers.length === 1 && blockers[0] === MARKETPLACE_BLOCKER.CONNECTION) {
    return { blockers, status: ListingStatus.PENDING_VERIFICATION, pausedReason: MARKETPLACE_BLOCKER.CONNECTION };
  }
  if (blockers.length > 0) {
    return {
      blockers,
      status: ListingStatus.DRAFT,
      pausedReason: blockers[0] ?? MARKETPLACE_BLOCKER.QUALITY,
    };
  }
  return { blockers: [], status: ListingStatus.LIVE, pausedReason: null };
}