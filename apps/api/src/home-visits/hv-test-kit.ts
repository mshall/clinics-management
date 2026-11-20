import { AppointmentStatus, BillingInterval, BookingSource, PlanKey, PrismaClient, SubscriptionStatus, UserRole, VerificationStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { KiorexFlagSnapshotService } from "../feature-flags/kiorex-flag-snapshot.service";
import type { FlagSnapshot } from "../feature-flags/kiorex-flag-snapshot";
import { CLINIC_FLAG_DEFINITIONS } from "../feature-flags/feature-flag-keys";
import { FieldVisitService } from "../field-visit/field-visit.service";
import { DevInboxRecorder } from "../messaging/dev-inbox.recorder";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ScopeOfPracticeService } from "../scope-of-practice/scope-of-practice.service";
import { HomeVisitBookingService } from "./home-visit-booking.service";
import { HomeVisitConfigService } from "./home-visit-config.service";
import { HomeVisitExecService } from "./home-visit-exec.service";
import { HomeVisitPrivacyService } from "./home-visit-privacy.service";
import { HomeVisitSafetyService } from "./home-visit-safety.service";
import { HomeVisitService } from "./home-visit.service";
import { MockRouteMapsAdapter } from "./maps/mock-route-maps.adapter";
import { syncHomeVisitWithAppointmentStatus } from "./home-visit-sync";

/** Integration-test kit for home visits / Nurse: real services on a real DB, fake AppointmentsService (status moves + HV sync), mock maps/SMS. */
export function snapshotFor(opts: { gates?: Record<string, boolean>; off?: string[] } = {}): FlagSnapshot {
  const flags = CLINIC_FLAG_DEFINITIONS.map((d) => ({
    key: d.key,
    class: d.class,
    scopes: [...d.scopes],
    dependsOn: [...d.dependsOn],
    launchLocked: d.launchLocked,
    gateSatisfied: opts.gates?.[d.key] ?? true,
    values: opts.off?.includes(d.key) ? { global: "OFF" as const } : {},
  }));
  return { product: "kiorly-clinic", version: 1, generatedAt: new Date().toISOString(), flags, signature: "x" } as unknown as FlagSnapshot;
}

export async function buildKit(prisma: PrismaClient, snapshot: FlagSnapshot | null = snapshotFor()) {
  const p = prisma as unknown as PrismaService;
  DevInboxRecorder.bind(prisma);
  const snaps = new KiorexFlagSnapshotService(p, {} as never);
  snaps.setSnapshotForTests(snapshot);
  const flags = new FeatureFlagsService(p, { resolve: async () => ({ entitlements: new Proxy({}, { get: () => true }) }) } as never, snaps);
  const audit = new AuditService(p);
  const outbox = new OutboxEventService(p);
  const port = new FieldVisitService();
  const maps = new MockRouteMapsAdapter();
  const scope = new ScopeOfPracticeService(p);
  const privacy = new HomeVisitPrivacyService(p, port);
  const config = new HomeVisitConfigService(p, flags, scope, audit);
  const homeVisits = new HomeVisitService(p, flags, scope, port, maps, privacy, outbox, audit);
  const safety = new HomeVisitSafetyService(p, port, outbox);
  const appointments = {
    updateStatus: async (tenantId: string, id: string, status: AppointmentStatus) => {
      const row = await prisma.$transaction(async (tx) => {
        const r = await tx.appointment.update({ where: { id }, data: { status, ...(status === AppointmentStatus.CHECKED_IN ? { checkedInAt: new Date() } : {}) } });
        await syncHomeVisitWithAppointmentStatus(tx, tenantId, id, status);
        return r;
      });
      return row;
    },
    create: async (tenantId: string, _actor: JwtUser, dto: { clinicId: string; patientId: string; clinicianId: string; appointmentTypeId: string; startsAt: string; endsAt: string; status: AppointmentStatus }) => {
      const type = await prisma.appointmentType.findUniqueOrThrow({ where: { id: dto.appointmentTypeId } });
      return prisma.appointment.create({ data: { tenantId, clinicId: dto.clinicId, patientId: dto.patientId, clinicianId: dto.clinicianId, appointmentTypeId: dto.appointmentTypeId, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt), feeAmount: type.feeAmount, status: dto.status, bookingSource: BookingSource.FRONT_DESK } });
    },
  };
  const commissions = { onCancelOrNoShow: async () => null, applyCreditIntents: async () => undefined };
  const exec = new HomeVisitExecService(p, port, safety, homeVisits, appointments as never, commissions as never, outbox, audit);
  const booking = new HomeVisitBookingService(p, homeVisits, appointments as never, audit);
  return { p, flags, snaps, audit, outbox, port, maps, scope, privacy, config, homeVisits, safety, exec, booking, appointments };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

export async function buildWorld(prisma: PrismaClient, suffix: string, opts: { plan?: PlanKey; edition?: "CLINIC" | "NURSE"; kind?: "SOLO" | "AGENCY"; safetyContact?: boolean } = {}) {
  const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
  const plan = await prisma.plan.findFirstOrThrow({ where: { key: opts.plan ?? PlanKey.PRO } });
  const tenant = await prisma.tenant.create({
    data: {
      name: `HV ${suffix}`,
      deploymentCell: "frankfurt",
      marketId: market.id,
      edition: opts.edition ?? "CLINIC",
      nurseTenantKind: opts.kind ?? null,
      ...(opts.safetyContact === false ? {} : { safetyContactName: "Owner", safetyContactPhone: "+201000000999" }),
    },
  });
  const tenantId = tenant.id;
  const clinic = await prisma.clinic.create({
    data: { tenantId, nameEn: "Branch", nameAr: "فرع", country: "EG", city: "Cairo", addressEn: "Street", addressAr: "شارع", locationUrl: "https://maps.example/hv", timezone: "Africa/Cairo", phone: "201000000041", email: `hv.${suffix}@example.com`, licenseNumber: "EG-HV", defaultCurrency: "EGP" },
  });
  await prisma.subscription.create({
    data: { tenantId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: BillingInterval.MONTHLY, clinicianSeats: 5, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
  });
  const mkUser = async (label: string, role: UserRole, extra: { profession?: "PHYSICIAN" | "NURSE" | "PHYSIOTHERAPIST" | "DENTIST" | "ASSISTANT"; owner?: boolean; verified?: boolean; supervisorUserId?: string } = {}) => {
    const u = await prisma.user.create({
      data: { tenantId, email: `${label}.${suffix}@example.com`, passwordHash: bcrypt.hashSync("demo", 10), displayName: `${label} ${suffix}`, role, isTenantOwner: extra.owner ?? false, ...(extra.profession ? { profession: extra.profession } : {}), ...(extra.supervisorUserId ? { supervisorUserId: extra.supervisorUserId } : {}) },
    });
    if (extra.verified) {
      await prisma.clinicianVerification.create({ data: { userId: u.id, tenantId, status: VerificationStatus.VERIFIED, verifiedProfession: extra.profession ?? null, profession: extra.profession ?? null, syndicateNumber: `SYN-${label}-${suffix}`, documentKeys: [] } });
    }
    const jwt: JwtUser = { userId: u.id, tenantId, email: u.email, role, additionalRoles: [], isTenantOwner: extra.owner ?? false };
    return { row: u, jwt };
  };
  const admin = await mkUser("admin", UserRole.CLINIC_ADMIN, { owner: true });
  const clinician = await mkUser("doc", UserRole.PHYSICIAN, { profession: opts.edition === "NURSE" ? "NURSE" : "PHYSICIAN", verified: true });
  const other = await mkUser("other", UserRole.PHYSICIAN, { profession: opts.edition === "NURSE" ? "NURSE" : "PHYSICIAN", verified: true });
  const patient = await prisma.patient.create({ data: { tenantId, mrn: `MRN-${suffix}`, firstNameEn: "Test", lastNameEn: "Patient", gender: "F", phone: `+2010${suffix.slice(-8).padStart(8, "0")}` } });
  const homeType = await prisma.appointmentType.create({
    data: { tenantId, clinicId: clinic.id, nameEn: "Home dressing", nameAr: "تغيير جرح", durationMinutes: 30, feeAmount: 300, serviceLocation: "HOME", bufferBeforeMin: 30, bufferAfterMin: 30, homeSurchargeAmount: 50, marketplaceBookable: true },
  });
  return { tenantId, clinicId: clinic.id, admin, clinician, other, patient, homeType, market };
}

/** A clean HomeVisit (+ appointment) row for lifecycle tests, planned around `start`. */
export async function seedVisit(prisma: PrismaClient, w: World, opts: { start: Date; minutes?: number; state?: "REQUESTED" | "CONFIRMED"; kiorex?: boolean; clinicianId?: string; district?: string; address?: { district: string; line1: string } } = { start: new Date() }) {
  const { encryptVisitAddress } = await import("./address-crypto");
  const end = new Date(opts.start.getTime() + (opts.minutes ?? 30) * 60_000);
  const clientKey = `plt_hv_${Math.random().toString(36).slice(2, 10)}`;
  const client = opts.kiorex ? await prisma.platformIntegrationClient.create({ data: { name: clientKey, clientKey, secretHash: "x", scopes: ["MARKETPLACE"] } }) : null;
  const appt = await prisma.appointment.create({
    data: { tenantId: w.tenantId, clinicId: w.clinicId, patientId: w.patient.id, clinicianId: opts.clinicianId ?? w.clinician.row.id, appointmentTypeId: w.homeType.id, startsAt: opts.start, endsAt: end, feeAmount: 300, homeSurchargeAmount: 50, serviceLocation: "HOME", status: AppointmentStatus.CONFIRMED, bookingSource: opts.kiorex ? BookingSource.KIOREX_MARKETPLACE : BookingSource.FRONT_DESK, ...(client ? { platformIntegrationClientId: client.id, externalReference: `kx_bk_${clientKey}` } : {}) },
  });
  const address = opts.address ?? { district: opts.district ?? "nasr-city", line1: "12 Example St" };
  const visit = await prisma.homeVisit.create({
    data: { tenantId: w.tenantId, clinicId: w.clinicId, appointmentId: appt.id, patientId: w.patient.id, clinicianId: opts.clinicianId ?? w.clinician.row.id, state: opts.state ?? "CONFIRMED", districtId: address.district, addressCiphertext: encryptVisitAddress(address, w.tenantId), addressConfirmedAt: new Date(), plannedStartsAt: opts.start, plannedEndsAt: end, surchargeAmount: 50 },
  });
  return { visit, appt };
}

export async function cleanup(prisma: PrismaClient, tenantId: string) {
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
}
