import { AppointmentStatus, BookingSource, FeeType, Gender, UserRole, type PrismaClient } from "@prisma/client";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { DepositSettlementService } from "../billing/deposit-settlement.service";
import { PatientMoneyService } from "../billing/patient-money.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import { SlotService } from "../scheduling/slot.service";
import { FrontDeskFlowService } from "../front-desk/front-desk-flow.service";
import { NewPatientService } from "../patients/new-patient.service";
import { ProvisionalPatientService } from "../patients/provisional-patient.service";
import { HttpPollingSignaling } from "./signaling/http-polling.signaling";
import { StunOnlyTurnProvider } from "./turn/stun-only.provider";
import { P2PWebRtcProvider } from "./video/p2p-webrtc.provider";
import { TelehealthService } from "./telehealth.service";
import { ensureTelehealthSession } from "./telehealth-sync";
import { signTelehealthToken } from "./telehealth-token";

/** Integration kit: real services on a real DB; flag/entitlement/nav-tab are switchable fakes. */
export function buildThKit(prisma: PrismaClient) {
  const p = prisma as unknown as PrismaService;
  const state = { flagOn: true, entitled: true };
  const flags = { evaluate: async () => ({ effective: state.flagOn, source: "global", scope: "global" }), isEnabled: async () => state.flagOn } as never;
  const entitlements = { isEntitled: async () => state.entitled, requireEntitlement: async () => { if (!state.entitled) throw new Error("PLAN_UPGRADE_REQUIRED"); } } as never;
  const outbox = new OutboxEventService(p);
  const slots = { invalidateAndNotify: async () => undefined } as unknown as SlotService;
  const charges = new CommissionChargeService(p, new KiorexCommissionService(p), outbox, new CreditWalletService(p));
  const settlement = new DepositSettlementService(p, new PatientMoneyService(p));
  const scheduling = new SchedulingService(p, {} as never, slots);
  (scheduling as unknown as { recordFreedSlot: () => Promise<null> }).recordFreedSlot = async () => null;
  const appointments = new AppointmentsService(p, scheduling, new FrontDeskFlowService(p), flags, new NewPatientService(p), new ProvisionalPatientService(p), charges, slots, new AppointmentOutboxService(outbox), entitlements, settlement);
  const navTabs = { assertMutateTab: async () => undefined, assertViewTab: async () => undefined } as never;
  const audit = new AuditService(p);
  const turn = new StunOnlyTurnProvider();
  const telehealth = new TelehealthService(p, audit, appointments, navTabs, flags, entitlements, new P2PWebRtcProvider(turn), new HttpPollingSignaling(p));
  return { p, state, appointments, telehealth, audit, charges };
}
export type ThKit = ReturnType<typeof buildThKit>;

export async function buildThWorld(prisma: PrismaClient, suffix: string) {
  const market = await prisma.market.create({
    data: { code: `TH${suffix}`.slice(0, 12), nameEn: `TH market ${suffix}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG" },
  });
  // the existing market rate row: EGP 40 flat per attended new Kiorex patient (NOT a telehealth-specific row)
  await prisma.kiorexCommissionRate.create({ data: { marketId: market.id, feeType: FeeType.FLAT, amount: 40, validFrom: new Date("2020-01-01") } });
  const tenant = await prisma.tenant.create({ data: { name: `TH ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" } });
  const tenantId = tenant.id;
  const clinic = await prisma.clinic.create({ data: { tenantId, nameEn: "TH Clinic", nameAr: "عيادة", country: "EG", city: "Cairo", addressEn: "St", addressAr: "شارع", locationUrl: "https://maps.example/th", timezone: "Africa/Cairo", phone: "+201000000077", email: `th.${suffix}@example.com`, licenseNumber: "EG-TH", defaultCurrency: "EGP" } });
  const mkUser = async (label: string, role: UserRole) => {
    const u = await prisma.user.create({ data: { tenantId, email: `${label}.${suffix}@example.com`, passwordHash: "x", displayName: `Dr ${label} ${suffix}`, role } });
    const jwt: JwtUser = { userId: u.id, tenantId, email: u.email, role, additionalRoles: [], isTenantOwner: false };
    return { row: u, jwt };
  };
  const doctor = await mkUser("doc", UserRole.PHYSICIAN);
  const otherDoctor = await mkUser("other", UserRole.PHYSICIAN);
  const admin = await mkUser("admin", UserRole.CLINIC_ADMIN);
  await prisma.clinicAdminScope.create({ data: { tenantId, userId: admin.row.id, clinicId: clinic.id } });
  const patient = await prisma.patient.create({ data: { tenantId, mrn: `THM-${suffix}`, firstNameEn: "Sara", lastNameEn: "Patient", gender: Gender.F, phone: `+2011${suffix.slice(-8).padStart(8, "0")}` } });
  await prisma.clinicianTelehealthSetting.createMany({ data: [{ tenantId, clinicianId: doctor.row.id, offersTelehealth: true }, { tenantId, clinicianId: otherDoctor.row.id, offersTelehealth: true }] });
  const videoType = await prisma.appointmentType.create({ data: { tenantId, clinicId: clinic.id, nameEn: "Video visit", nameAr: "كشف فيديو", durationMinutes: 20, feeAmount: 250, serviceLocation: "VIDEO", marketplaceBookable: true, minNoticeMinutes: 0, maxDaysAhead: 60 } });
  return { tenantId, clinicId: clinic.id, marketId: market.id, doctor, otherDoctor, admin, patient, videoType };
}
export type ThWorld = Awaited<ReturnType<typeof buildThWorld>>;

/** A VIDEO appointment + session as Flow A would leave them (Kiorex source = commissionable) starting `inMin` minutes from now. */
export async function seedVideoAppointment(prisma: PrismaClient, w: ThWorld, kit: ThKit, opts: { inMin?: number; kiorex?: boolean; notes?: string; clinicianId?: string; minutes?: number } = {}) {
  const startsAt = new Date(Date.now() + (opts.inMin ?? 2) * 60_000);
  const client = opts.kiorex ? await prisma.platformIntegrationClient.create({ data: { name: `th_${Math.random().toString(36).slice(2, 8)}`, clientKey: `plt_th_${Math.random().toString(36).slice(2, 10)}`, secretHash: "x", scopes: ["MARKETPLACE"] } }) : null;
  const apt = await prisma.appointment.create({
    data: {
      tenantId: w.tenantId, clinicId: w.clinicId, patientId: w.patient.id, clinicianId: opts.clinicianId ?? w.doctor.row.id, appointmentTypeId: w.videoType.id,
      startsAt, endsAt: new Date(startsAt.getTime() + (opts.minutes ?? 20) * 60_000), feeAmount: 250, status: AppointmentStatus.CONFIRMED, serviceLocation: "VIDEO",
      bookingSource: opts.kiorex ? BookingSource.KIOREX_MARKETPLACE : BookingSource.FRONT_DESK, isNewPatientAtBooking: opts.kiorex ? true : null, notes: opts.notes ?? null,
      ...(client ? { platformIntegrationClientId: client.id, externalReference: `kx_th_${client.clientKey}` } : {}),
    },
  });
  const s = await prisma.$transaction((tx) => ensureTelehealthSession(tx, apt, null));
  const session = await prisma.telehealthSession.findUniqueOrThrow({ where: { id: s.id } });
  const token = signTelehealthToken({ s: session.id, p: session.patientId, v: session.linkVersion });
  return { apt, session, token };
}
