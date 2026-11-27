import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { AppointmentStatus, MessageChannel, PaymentMethod, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import {
  type DepositReason,
  type DepositRequirement,
  depositLinkExpiry,
  depositRequirement,
  hashDepositLinkToken,
  newDepositLinkToken,
  resolveDepositPolicy,
} from "../billing/deposit-policy";
import { KIOREX_PAY_SOURCE } from "../billing/kiorex-deposits.service";
import { canApproveRefunds, canHandlePatientMoney, DEPOSIT_STATUS, roundMoney } from "../billing/patient-money";
import { PatientMoneyService } from "../billing/patient-money.service";
import { resolveClinicCurrency } from "../common/clinic-currency";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { type DepositPolicy, depositPolicySchema } from "../markets/commercial-config.schema";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { MessagingService } from "../messaging/messaging.service";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentsService } from "./appointments.service";
import { routeDeposit } from "./deposit-routing";

export const DEPOSIT_LINK_TEMPLATE_KEY = "deposit_payment_link";
export const DEPOSIT_LINK_PROVIDERS = ["CLINIC", "KIOREX_PAY"] as const;
export type DepositLinkProvider = (typeof DEPOSIT_LINK_PROVIDERS)[number];

const SCAN_MS = 5 * 60_000;
const BOOKABLE = new Set<AppointmentStatus>([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]);

/** `AUTO` routes through the Kiorly Pay contract (deposit-routing.ts); omitting `provider` keeps the old default (the clinic page). */
export type CreateDepositLinkBody = { amount?: number; provider?: DepositLinkProvider | "AUTO"; send?: boolean };

/** Kiorly-hosted page for clinic links; Kiorex Pay hosts its own checkout (base URL from env). */
export function depositLinkUrl(provider: DepositLinkProvider, token: string): string | null {
  if (provider === "KIOREX_PAY") {
    const base = process.env.KIOREX_PAY_LINK_BASE_URL?.trim();
    return base ? `${base.replace(/\/$/, "")}/deposit/${encodeURIComponent(token)}` : null;
  }
  const web = process.env.APP_WEB_URL?.trim() || "http://localhost:5173";
  return `${web.replace(/\/$/, "")}/pay/${encodeURIComponent(token)}`;
}

/** FS-04 — deposits & payment links for high-risk bookings. */
@Injectable()
export class DepositLinkService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DepositLinkService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly money: PatientMoneyService,
    private readonly messaging: MessagingService,
    private readonly featureFlags: FeatureFlagsService,
    @Inject(forwardRef(() => AppointmentsService)) private readonly appointments: AppointmentsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.expireDue().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async policyFor(tenantId: string, clinicId: string): Promise<DepositPolicy> {
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: clinicId, tenantId },
      select: { depositPolicy: true, tenant: { select: { market: { select: { commercialConfig: true } } } } },
    });
    return resolveDepositPolicy(clinic?.tenant.market?.commercialConfig, clinic?.depositPolicy);
  }

  async requirement(tenantId: string, appointmentId: string) {
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        clinicId: true,
        feeAmount: true,
        noShowRiskScore: true,
        appointmentType: { select: { depositAmount: true } },
        patient: { select: { requiresAppointmentDeposit: true, noShowCount: true } },
      },
    });
    if (!apt) throw new NotFoundException("Appointment not found");
    const [policy, currency, deposit] = await Promise.all([
      this.policyFor(tenantId, apt.clinicId),
      resolveClinicCurrency(this.prisma, tenantId, apt.clinicId),
      this.prisma.patientDeposit.findFirst({
        where: { tenantId, appointmentId, status: { in: [DEPOSIT_STATUS.PENDING, DEPOSIT_STATUS.HELD, DEPOSIT_STATUS.APPLIED] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, amount: true, linkExpiresAt: true, source: true },
      }),
    ]);
    const req: DepositRequirement = depositRequirement(
      {
        patientFlag: apt.patient.requiresAppointmentDeposit,
        noShowCount: apt.patient.noShowCount,
        riskScore: apt.noShowRiskScore != null ? Number(apt.noShowRiskScore) : null,
        typeDepositAmount: apt.appointmentType?.depositAmount != null ? Number(apt.appointmentType.depositAmount) : null,
        feeAmount: Number(apt.feeAmount),
      },
      policy,
    );
    return {
      ...req,
      currency,
      policy,
      kiorexPayAvailable: Boolean(process.env.KIOREX_PAY_LINK_BASE_URL?.trim()),
      suggestedProvider: routeDeposit({ kiorexPayConfigured: Boolean(process.env.KIOREX_PAY_LINK_BASE_URL?.trim()) }).destination,
      deposit: deposit
        ? { ...deposit, amount: Number(deposit.amount), linkExpiresAt: deposit.linkExpiresAt?.toISOString() ?? null }
        : null,
    };
  }

  /** POST /appointments/:id/deposit-link — creates (or replaces) the pending deposit and sends the link on WhatsApp. */
  async createLink(tenantId: string, user: JwtUser, appointmentId: string, body: CreateDepositLinkBody) {
    if (!canHandlePatientMoney(user)) throw new ForbiddenException("Front desk or finance role required");
    const requested = body.provider ?? "CLINIC";
    if (requested !== "AUTO" && !DEPOSIT_LINK_PROVIDERS.includes(requested)) throw new BadRequestException("Unknown payment link provider");
    const routing = routeDeposit({ kiorexPayConfigured: Boolean(process.env.KIOREX_PAY_LINK_BASE_URL?.trim()) });
    const provider: DepositLinkProvider = requested === "AUTO" ? routing.destination : requested;
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        clinicId: true,
        patientId: true,
        startsAt: true,
        status: true,
        feeAmount: true,
        patient: { select: { firstNameEn: true, phone: true, isSample: true } },
      },
    });
    if (!apt) throw new NotFoundException("Appointment not found");
    const now = new Date();
    if (!BOOKABLE.has(apt.status) || apt.startsAt.getTime() <= now.getTime()) {
      throw new BadRequestException({ message: "Deposit links are only for upcoming bookings", code: "DEPOSIT_LINK_NOT_UPCOMING" });
    }
    if (apt.patient.isSample) {
      throw new BadRequestException({ message: "Sample patient — payments are not recorded for demo data", code: "SAMPLE_PATIENT_NO_REVENUE" });
    }
    const req = await this.requirement(tenantId, appointmentId);
    if (req.deposit && req.deposit.status !== DEPOSIT_STATUS.PENDING) {
      throw new ConflictException({ message: "This booking already has a paid deposit", code: "DEPOSIT_ALREADY_PAID" });
    }
    const amount = roundMoney(body.amount != null ? Number(body.amount) : req.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException({ message: "Enter a deposit amount", code: "DEPOSIT_AMOUNT_REQUIRED" });
    }
    if (Number(apt.feeAmount) > 0 && amount > Number(apt.feeAmount) + 0.001) {
      throw new BadRequestException({ message: "Deposit is larger than the visit fee", code: "DEPOSIT_EXCEEDS_FEE" });
    }
    const { token, hash } = newDepositLinkToken();
    const url = depositLinkUrl(provider, token);
    if (!url) {
      throw new BadRequestException({ message: "Kiorex Pay links are not configured", code: "KIOREX_PAY_NOT_CONFIGURED" });
    }
    const reasons: DepositReason[] = req.reasons.length ? req.reasons : ["MANUAL"];
    const expiresAt = depositLinkExpiry(now, apt.startsAt, req.policy);

    const deposit = await this.prisma.$transaction(async (tx) => {
      if (req.deposit?.status === DEPOSIT_STATUS.PENDING) {
        await this.money.voidPendingDepositTx(tx, tenantId, user.userId, req.deposit.id, "CANCELLED", "Replaced by a new payment link");
      }
      return this.money.createPendingDepositTx(tx, {
        tenantId,
        clinicId: apt.clinicId,
        patientId: apt.patientId,
        appointmentId: apt.id,
        amount,
        currency: req.currency,
        method: provider === "KIOREX_PAY" ? PaymentMethod.KIOREX_PAY : PaymentMethod.TRANSFER,
        source: provider === "KIOREX_PAY" ? KIOREX_PAY_SOURCE : "PAYMENT_LINK",
        actorId: user.userId,
        linkTokenHash: hash,
        linkExpiresAt: expiresAt,
        reasons,
      });
    });

    const send = await this.sendLink(tenantId, apt, deposit.id, { url, amount, currency: req.currency, expiresAt, skip: body.send === false });
    return {
      depositId: deposit.id,
      status: deposit.status,
      amount,
      currency: req.currency,
      provider,
      ...(requested === "AUTO" ? { routing: { requested: "AUTO", destination: routing.destination, order: routing.decision.order, excluded: routing.decision.excluded, explain: routing.decision.explain } } : {}),
      url,
      expiresAt: expiresAt.toISOString(),
      reasons,
      ...send,
    };
  }

  private async sendLink(
    tenantId: string,
    apt: { id: string; clinicId: string; patientId: string; startsAt: Date; patient: { firstNameEn: string; phone: string | null } },
    depositId: string,
    p: { url: string; amount: number; currency: string; expiresAt: Date; skip: boolean },
  ): Promise<{ sent: boolean; sendError: string | null }> {
    if (p.skip) return { sent: false, sendError: null };
    const phone = apt.patient.phone?.trim();
    if (!phone) return { sent: false, sendError: "NO_PHONE" };
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) return { sent: false, sendError: "WHATSAPP_DISABLED" };
    const hours = Math.max(1, Math.round((p.expiresAt.getTime() - Date.now()) / 3_600_000));
    const clinic = await this.prisma.clinic.findFirst({ where: { id: apt.clinicId, tenantId }, select: { nameEn: true } });
    try {
      const msg = await this.messaging.queueMessage(tenantId, {
        patientId: apt.patientId,
        appointmentId: apt.id,
        channel: MessageChannel.WHATSAPP,
        toPhone: phone,
        templateKey: DEPOSIT_LINK_TEMPLATE_KEY,
        body: `Please pay a deposit of ${p.amount} ${p.currency} to keep your appointment: ${p.url} (within ${hours} h).`,
        variables: {
          name: apt.patient.firstNameEn,
          clinic: clinic?.nameEn ?? "",
          amount: `${p.amount} ${p.currency}`,
          link: p.url,
          hours: String(hours),
        },
        metadata: { kind: "deposit_link", depositId },
      });
      await this.prisma.patientDeposit.update({ where: { id: depositId }, data: { linkSentAt: new Date() } });
      return { sent: Boolean(msg.id), sendError: null };
    } catch (e) {
      return { sent: false, sendError: e instanceof Error ? e.message.slice(0, 200) : "SEND_FAILED" };
    }
  }

  /** Public pay page context (no patient name — the link may be forwarded). */
  async publicSummary(token: string) {
    const d = await this.prisma.patientDeposit.findUnique({ where: { linkTokenHash: hashDepositLinkToken(token.trim()) } });
    if (!d || d.source !== "PAYMENT_LINK") throw new NotFoundException("Payment link not found");
    const expired = d.status === DEPOSIT_STATUS.PENDING && d.linkExpiresAt != null && d.linkExpiresAt.getTime() < Date.now();
    const [clinic, apt, channels, market] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: d.clinicId, tenantId: d.tenantId }, select: { nameEn: true, nameAr: true, phone: true, timezone: true } }),
      d.appointmentId
        ? this.prisma.appointment.findFirst({ where: { id: d.appointmentId, tenantId: d.tenantId }, select: { startsAt: true } })
        : null,
      this.prisma.tenantPaymentChannel.findMany({
        where: { tenantId: d.tenantId, NOT: { channelKey: "KIOREX_PAY" } },
        select: { channelKey: true, name: true, accountNumber: true, mobileNumber: true },
      }),
      resolveMarketForTenant(this.prisma, d.tenantId),
    ]);
    return {
      status: expired ? DEPOSIT_STATUS.EXPIRED : d.status,
      amount: Number(d.amount),
      currency: d.currency,
      expiresAt: d.linkExpiresAt?.toISOString() ?? null,
      startsAt: apt?.startsAt.toISOString() ?? null,
      timeZone: clinic?.timezone?.trim() || market.timezone,
      clinicNameEn: clinic?.nameEn ?? "",
      clinicNameAr: clinic?.nameAr ?? "",
      clinicPhone: clinic?.phone ?? null,
      channels,
    };
  }

  /** Clinic deposit policy (market default + override). Approvers only may change it. */
  async getPolicy(tenantId: string, clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { depositPolicy: true } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    return { effective: await this.policyFor(tenantId, clinicId), override: clinic.depositPolicy ?? null };
  }

  async updatePolicy(tenantId: string, user: JwtUser, clinicId: string, body: { policy: Partial<DepositPolicy> | null }) {
    if (!canApproveRefunds(user)) throw new ForbiddenException("Only owners, admins and finance can change the deposit policy");
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId }, select: { id: true, depositPolicy: true } });
    if (!clinic) throw new NotFoundException("Clinic not found");
    let next: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (body?.policy) {
      const parsed = depositPolicySchema.partial().safeParse(body.policy);
      if (!parsed.success) {
        throw new BadRequestException({ message: "Invalid deposit policy", code: "DEPOSIT_POLICY_INVALID", issues: parsed.error.issues });
      }
      next = parsed.data as Prisma.InputJsonValue;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.clinic.update({ where: { id: clinicId }, data: { depositPolicy: next } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: user.userId,
          clinicId,
          action: "DEPOSIT_POLICY_UPDATED",
          resource: "Clinic",
          resourceId: clinicId,
          metadata: { before: clinic.depositPolicy ?? null, after: body?.policy ?? null } as Prisma.InputJsonValue,
        },
      });
    });
    return this.getPolicy(tenantId, clinicId);
  }

  /** Unpaid links past their expiry → EXPIRED; the booking is auto-cancelled when the clinic policy says so. */
  async expireDue(now = new Date(), batch = 100): Promise<{ expired: number; cancelled: number }> {
    const due = await this.prisma.patientDeposit.findMany({
      where: { status: DEPOSIT_STATUS.PENDING, linkExpiresAt: { lt: now } },
      select: { id: true, tenantId: true, clinicId: true, appointmentId: true },
      take: batch,
    });
    let expired = 0;
    let cancelled = 0;
    for (const d of due) {
      try {
        const voided = await this.prisma.$transaction((tx) =>
          this.money.voidPendingDepositTx(tx, d.tenantId, null, d.id, "EXPIRED", "Payment link expired unpaid"),
        );
        if (!voided) continue;
        expired += 1;
        if (!d.appointmentId) continue;
        const policy = await this.policyFor(d.tenantId, d.clinicId);
        if (!policy.autoCancelUnpaid) continue;
        if (await this.appointments.cancelForUnpaidDeposit(d.tenantId, d.appointmentId)) cancelled += 1;
      } catch (e) {
        this.log.warn(`deposit link expiry ${d.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { expired, cancelled };
  }
}
