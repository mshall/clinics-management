import { Inject, Injectable } from "@nestjs/common";
import { GEOSTAMP_RETENTION_MS, type FieldVisit, type Viewer } from "@kiorly/field-visit";
import type { HomeVisit } from "@prisma/client";
import { FIELD_VISIT_PORT, type FieldVisitPort } from "../field-visit/field-visit.port";
import { PrismaService } from "../prisma/prisma.service";
import { decryptVisitAddress } from "./address-crypto";
import { maskVisitAddress, type VisitAddress } from "./visit-address";

export const ADDRESS_MASK_AFTER_MS = 24 * 60 * 60 * 1000;

export type AddressView = ({ masked: false } & VisitAddress) | { district: string; masked: true };

/**
 * HVPRV01 (BR52) address privacy + geostamp retention. Address visibility is a safety control (ADR-025): no feature flags here.
 *  - visible only to the ASSIGNED clinician and org admins, only from CONFIRMED, and never 24 h after the visit ended;
 *  - after 24 h the ciphertext itself is wiped (data minimisation), so a DB read cannot reveal it either;
 *  - geostamps are coarse (~1 km); after 12 months lat/lng are removed and only the district stays.
 */
@Injectable()
export class HomeVisitPrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FIELD_VISIT_PORT) private readonly port: FieldVisitPort,
  ) {}

  fieldVisitOf(v: Pick<HomeVisit, "id" | "state" | "plannedStartsAt" | "plannedEndsAt" | "clinicianId" | "endedAt">): FieldVisit {
    return {
      id: v.id,
      state: v.state as FieldVisit["state"],
      plannedStartMs: v.plannedStartsAt.getTime(),
      plannedEndMs: v.plannedEndsAt.getTime(),
      assignedClinicianId: v.clinicianId ?? undefined,
      endedAtMs: v.endedAt?.getTime(),
      history: [],
    };
  }

  canView(viewer: Viewer, v: Pick<HomeVisit, "id" | "state" | "plannedStartsAt" | "plannedEndsAt" | "clinicianId" | "endedAt" | "addressMaskedAt">, now = new Date()): boolean {
    if (v.addressMaskedAt) return false;
    return this.port.canViewAddress(viewer, this.fieldVisitOf(v), now.getTime());
  }

  /** The address for this viewer, or the district-only masked view. */
  view(viewer: Viewer, v: HomeVisit, now = new Date()): AddressView {
    if (!this.canView(viewer, v, now)) return maskVisitAddress({ district: v.districtId });
    const a = decryptVisitAddress(v.addressCiphertext, v.tenantId);
    if (!a) return maskVisitAddress({ district: v.districtId });
    return { masked: false, ...a };
  }

  /** Wipes the ciphertext of visits that ended more than 24 h ago. Idempotent; returns how many were masked. */
  async maskExpiredAddresses(now = new Date(), batch = 500): Promise<number> {
    const cutoff = new Date(now.getTime() - ADDRESS_MASK_AFTER_MS);
    const due = await this.prisma.homeVisit.findMany({
      where: { endedAt: { lte: cutoff }, addressMaskedAt: null, addressCiphertext: { not: null } },
      select: { id: true },
      take: batch,
    });
    if (!due.length) return 0;
    const r = await this.prisma.homeVisit.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { addressCiphertext: null, addressMaskedAt: now } });
    return r.count;
  }

  /**
   * Geostamp retention (KX-08): stamps older than 12 months lose lat/lng and keep the district. Batched and idempotent so the 60 s job-runner
   * Lambda can call it repeatedly; `remaining` tells the caller whether another run is needed.
   */
  async purgeGeostamps(now = new Date(), batch = 1000): Promise<{ purged: number; remaining: number; cutoff: string }> {
    const cutoff = new Date(now.getTime() - GEOSTAMP_RETENTION_MS);
    const where = { recordedAt: { lt: cutoff }, purgedAt: null } as const;
    const ids = await this.prisma.homeVisitGeostamp.findMany({ where, select: { id: true }, take: batch, orderBy: { recordedAt: "asc" } });
    let purged = 0;
    if (ids.length) {
      const r = await this.prisma.homeVisitGeostamp.updateMany({ where: { id: { in: ids.map((i) => i.id) }, purgedAt: null }, data: { lat: null, lng: null, purgedAt: now } });
      purged = r.count;
    }
    const remaining = await this.prisma.homeVisitGeostamp.count({ where });
    return { purged, remaining, cutoff: cutoff.toISOString() };
  }
}
