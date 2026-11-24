import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ClinicRecordStatus, ReferralLinkChannelKind, ReferralLinkStatus } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import { ContentGuardError } from "./content-guard";

export const MARKETING_ERROR = {
  CONTENT: "CONTENT_NOT_ALLOWED",
  LINK_REQUIRED: "SHARE_LINK_REQUIRED",
  SLOT_GONE: "SLOT_NO_LONGER_AVAILABLE",
  INVALID: "GROWTH_MARKETING_INVALID",
  VERIFICATION_STATE: "VERIFICATION_REQUEST_STATE",
} as const;

export const bad = (code: string, message: string, extra?: Record<string, unknown>) => new BadRequestException({ code, message, ...extra });

export function contentRefused(e: ContentGuardError): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: MARKETING_ERROR.CONTENT,
    message: "This text contains wording that cannot be published (guarantees, cures, price comparisons, testimonials, before-and-after results or pressure).",
    findings: e.findings.map((f) => ({ id: f.id, category: f.category })),
  });
}

/** The clinic a share action is for: active, in the caller's organisation, with a public booking page slug. */
export async function shareableClinic(prisma: PrismaService, tenantId: string, clinicId: string | undefined) {
  const where = { tenantId, recordStatus: ClinicRecordStatus.ACTIVE, ...(clinicId ? { id: clinicId } : { parentClinicId: null }) };
  const clinic = await prisma.clinic.findFirst({ where, orderBy: { createdAt: "asc" }, select: { id: true, nameEn: true, nameAr: true, bookingSlug: true, country: true, timezone: true } });
  if (!clinic) throw new NotFoundException("Clinic not found");
  if (!clinic.bookingSlug) throw new ConflictException({ code: MARKETING_ERROR.LINK_REQUIRED, message: "Publish your booking page first: the clinic has no public page yet." });
  return clinic as typeof clinic & { bookingSlug: string };
}

/**
 * The provider link a share carries. Sharing never creates a fee-bearing path: the link is the provider's own (`PROVIDER_LED`), so a booking made from a
 * share is provider-led and never carries the Kiorex fee. Preference: an explicit active `linkId`, then an active SOCIAL link of the clinic, then any
 * active link of the clinic. Returns null when none exists (the caller may create one when the role allows it).
 */
export async function pickShareLink(prisma: PrismaService, tenantId: string, clinicId: string, linkId?: string) {
  if (linkId) {
    const l = await prisma.providerReferralLink.findFirst({ where: { id: linkId, tenantId, clinicId } });
    if (!l) throw new NotFoundException("Link not found");
    if (l.status !== ReferralLinkStatus.ACTIVE) throw new ConflictException({ code: MARKETING_ERROR.LINK_REQUIRED, message: "This link is paused or revoked." });
    return l;
  }
  const social = await prisma.providerReferralLink.findFirst({ where: { tenantId, clinicId, status: ReferralLinkStatus.ACTIVE, channelKind: ReferralLinkChannelKind.SOCIAL }, orderBy: { createdAt: "asc" } });
  if (social) return social;
  return prisma.providerReferralLink.findFirst({ where: { tenantId, clinicId, status: ReferralLinkStatus.ACTIVE }, orderBy: { createdAt: "asc" } });
}
