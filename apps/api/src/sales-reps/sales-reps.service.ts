import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KiorlyInvoiceStatus, SubscriptionStatus, TenantStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole } from "../common/effective-roles";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { SALES_REP_COMMISSION_DEFAULTS, safeParseCommercialConfig } from "../markets/commercial-config.schema";
import { OUTBOX_TARGET_INTERNAL, OutboxEventService } from "../messaging/outbox-event.service";
import { sendWhatsAppMessage } from "../messaging/whatsapp.provider";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeSignupPhone } from "../signup/signup-phone";
import { SignupProvisionService, type SignupProvisionInput } from "../signup/signup-provision.service";

export const REP_OWNER_CONFIRM_PURPOSE_PREFIX = "REP_OWNER_CONFIRM:";
const OTP_TTL_MS = 10 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_OTP_SENDS_PER_HOUR = 5;
const SET_PASSWORD_TTL_MS = 7 * 24 * 3_600_000;

export type RepCreateTenantInput = Omit<SignupProvisionInput, "profile" | "salesRepCode" | "onBehalfOfSalesRepId" | "legalAcceptances"> & {
  owner: { displayName: string; email: string };
};

export function repOwnerConfirmPurpose(tenantId: string): string {
  return `${REP_OWNER_CONFIRM_PURPOSE_PREFIX}${tenantId}`;
}

/** Commission on invoices paid by clinics still subscribed after the retention window (ON-07). */
export function repCommissionForInvoices(
  invoices: { total: number; tenantCreatedAt: Date; retained: boolean }[],
  cfg: { commissionPercent: number; retentionDays: number },
  asOf: Date,
): { eligibleTotal: number; commission: number; eligibleCount: number } {
  const cutoff = asOf.getTime() - cfg.retentionDays * 86_400_000;
  let eligibleTotal = 0;
  let eligibleCount = 0;
  for (const inv of invoices) {
    if (!inv.retained || inv.tenantCreatedAt.getTime() > cutoff) continue;
    eligibleTotal += inv.total;
    eligibleCount += 1;
  }
  const commission = Math.round(eligibleTotal * cfg.commissionPercent) / 100;
  return { eligibleTotal: Math.round(eligibleTotal * 100) / 100, commission, eligibleCount };
}

@Injectable()
export class SalesRepsService {
  private readonly logger = new Logger(SalesRepsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provision: SignupProvisionService,
    private readonly legal: LegalAcceptanceService,
    private readonly outbox: OutboxEventService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private devOtpCode(): string | null {
    const raw = this.config.get<string>("SIGNUP_OTP_DEV_CODE")?.trim();
    return raw && raw.length >= 4 ? raw : null;
  }

  private webBaseUrl(): string {
    return (
      this.config.get<string>("APP_WEB_URL")?.trim() ||
      this.config.get<string>("WEB_APP_URL")?.trim() ||
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }

  async requireRep(user: JwtUser) {
    if (!hasRole(user, UserRole.SALES_REP)) throw new ForbiddenException("Sales rep account required");
    const rep = await this.prisma.salesRep.findUnique({ where: { userId: user.userId } });
    if (!rep || !rep.active) throw new ForbiddenException("Sales rep account is inactive");
    return rep;
  }

  private async repTenant(repId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, createdBySalesRepId: repId },
      include: { users: { where: { isTenantOwner: true }, select: { id: true, email: true }, take: 1 } },
    });
    if (!tenant) throw new NotFoundException("Clinic not found in your portfolio");
    const owner = tenant.users[0];
    const employee = owner
      ? await this.prisma.employee.findFirst({ where: { tenantId, email: owner.email }, select: { phone: true } })
      : null;
    return { ...tenant, owner: owner ? { ...owner, phone: employee?.phone ?? null } : null };
  }

  async me(user: JwtUser) {
    const rep = await this.requireRep(user);
    return { id: rep.id, code: rep.code, displayName: rep.displayName };
  }

  // --- platform: rep accounts -------------------------------------------------

  async createRep(actor: JwtUser, body: { email?: string; displayName?: string; code?: string; phone?: string; password?: string }) {
    if (!isPlatformSuperAdmin(actor)) throw new ForbiddenException("Platform super admin only");
    const email = body.email?.trim().toLowerCase();
    const displayName = body.displayName?.trim();
    const code = body.code?.trim().toUpperCase();
    if (!email?.includes("@") || !displayName || !code) throw new BadRequestException("email, displayName and code are required");
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw new BadRequestException("code must be 3–24 letters, digits or dashes");
    const password = body.password ?? randomBytes(12).toString("base64url");
    if (password.length < 8) throw new BadRequestException("Password must be at least 8 characters");
    if (await this.prisma.user.findFirst({ where: { email } })) throw new ConflictException("Email already in use");
    if (await this.prisma.salesRep.findUnique({ where: { code } })) throw new ConflictException("Rep code already in use");
    const rep = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId: null,
          email,
          displayName,
          role: UserRole.SALES_REP,
          passwordHash: await bcrypt.hash(password, 10),
        },
      });
      return tx.salesRep.create({ data: { userId: u.id, code, displayName, phone: body.phone?.trim() || null } });
    });
    return { id: rep.id, userId: rep.userId, code: rep.code, displayName: rep.displayName };
  }

  async listReps(actor: JwtUser) {
    if (!isPlatformSuperAdmin(actor)) throw new ForbiddenException("Platform super admin only");
    return this.prisma.salesRep.findMany({ orderBy: { createdAt: "desc" } });
  }

  // --- rep: create tenant on behalf of an owner -------------------------------

  async createTenant(user: JwtUser, body: RepCreateTenantInput) {
    const rep = await this.requireRep(user);
    if (!body?.owner?.email || !body.owner.displayName) throw new BadRequestException("owner name and email are required");
    const market = await this.prisma.market.findFirst({ where: { id: body.marketId } });
    if (!market) throw new BadRequestException("Unknown market");
    const phone = normalizeSignupPhone(body.phone ?? "", market.defaultPhoneRegion?.replace(/\D/g, "") || "");
    const result = await this.provision.provision({
      phone,
      marketId: body.marketId,
      specialty: body.specialty,
      clinic: body.clinic,
      planKey: body.planKey,
      referralCode: body.referralCode,
      salesRepCode: rep.code,
      onBehalfOfSalesRepId: rep.id,
      profile: {
        displayName: body.owner.displayName,
        email: body.owner.email,
        password: randomBytes(24).toString("base64url"),
      },
    });
    await this.audit.recordEvent({
      tenantId: result.tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "REP_TENANT_CREATED",
      resource: "Tenant",
      resourceId: result.tenantId,
      metadata: { salesRepId: rep.id, salesRepCode: rep.code, planKey: result.planKey },
    });
    const otp = await this.sendOwnerOtp(result.tenantId, result.phone);
    return { tenantId: result.tenantId, status: TenantStatus.PENDING_OWNER, salesRepCode: rep.code, otp };
  }

  private async sendOwnerOtp(tenantId: string, phone: string) {
    const purpose = repOwnerConfirmPurpose(tenantId);
    const recent = await this.prisma.otpChallenge.count({
      where: { purpose, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= MAX_OTP_SENDS_PER_HOUR) {
      throw new HttpException("Too many confirmation codes for this clinic. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const devCode = this.devOtpCode();
    const code = devCode ?? String(randomInt(100_000, 999_999));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.prisma.otpChallenge.create({
      data: { phone, purpose, codeHash: await bcrypt.hash(code, 8), expiresAt },
    });
    const wa = await sendWhatsAppMessage(
      phone,
      `Kiorly: a sales rep is creating your clinic account. Share this code with them only if you agree: ${code}`,
    );
    if (!wa.ok) this.logger.warn(`Rep owner OTP WhatsApp failed for tenant ${tenantId}: ${wa.error}`);
    return {
      expiresAt: expiresAt.toISOString(),
      channel: wa.ok ? ("whatsapp" as const) : ("sms_pending" as const),
      ...(devCode ? { devHint: "SIGNUP_OTP_DEV_CODE is set" } : {}),
    };
  }

  async resendOwnerOtp(user: JwtUser, tenantId: string) {
    const rep = await this.requireRep(user);
    const tenant = await this.repTenant(rep.id, tenantId);
    if (tenant.status !== TenantStatus.PENDING_OWNER) throw new ConflictException({ message: "Owner already confirmed", code: "TENANT_ALREADY_CONFIRMED" });
    const phone = tenant.owner?.phone;
    if (!phone) throw new BadRequestException("Owner phone missing");
    return this.sendOwnerOtp(tenant.id, phone);
  }

  /** Owner reads the OTP to the rep; only then the tenant leaves PENDING_OWNER. */
  async confirmOwner(
    user: JwtUser,
    tenantId: string,
    body: { code?: string; legalAcceptances?: { document: string; version: string }[] },
  ) {
    const rep = await this.requireRep(user);
    const tenant = await this.repTenant(rep.id, tenantId);
    if (tenant.status !== TenantStatus.PENDING_OWNER) throw new ConflictException({ message: "Owner already confirmed", code: "TENANT_ALREADY_CONFIRMED" });
    const owner = tenant.owner;
    if (!owner) throw new BadRequestException("Owner missing");
    const code = body?.code?.trim();
    if (!code) throw new BadRequestException("code is required");

    const sub = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    this.legal.assertSignupLegal(sub?.plan.key ?? "LITE", body.legalAcceptances);

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { purpose: repOwnerConfirmPurpose(tenantId), consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) throw new BadRequestException({ message: "No active confirmation code", code: "REP_OTP_EXPIRED" });
    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) throw new HttpException("Too many incorrect attempts", HttpStatus.TOO_MANY_REQUESTS);
    const devCode = this.devOtpCode();
    const ok = (devCode != null && code === devCode) || (await bcrypt.compare(code, challenge.codeHash));
    if (!ok) {
      await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException({ message: "Incorrect code", code: "REP_OTP_INCORRECT" });
    }

    const rawToken = randomBytes(32).toString("base64url");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } }),
      this.prisma.tenant.update({ where: { id: tenantId }, data: { status: TenantStatus.ACTIVE, ownerConfirmedAt: now } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: owner.id,
          tokenHash: createHash("sha256").update(rawToken).digest("hex"),
          expiresAt: new Date(now.getTime() + SET_PASSWORD_TTL_MS),
        },
      }),
    ]);
    if (body.legalAcceptances?.length) await this.legal.recordMany(tenantId, owner.id, body.legalAcceptances);
    await this.outbox.enqueueEvent({
      tenantId,
      type: "rep.owner_welcome",
      aggregateType: "Tenant",
      aggregateId: tenantId,
      target: OUTBOX_TARGET_INTERNAL,
      payload: {
        channel: "WHATSAPP",
        toPhone: owner.phone,
        to: owner.email,
        setPasswordUrl: `${this.webBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`,
        textEn: "Your Kiorly clinic is ready. Set your password to sign in.",
        textAr: "عيادتك على كيورلي جاهزة. عيّن كلمة المرور لتسجيل الدخول.",
      },
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: null,
      action: "REP_TENANT_OWNER_CONFIRMED",
      resource: "Tenant",
      resourceId: tenantId,
      metadata: { salesRepId: rep.id },
    });
    return { tenantId, status: TenantStatus.ACTIVE, ownerConfirmedAt: now.toISOString() };
  }

  /** Imports run in the clinic's tenant with the rep recorded as acting user (ON-05 hook). */
  async importActor(user: JwtUser, tenantId: string) {
    const rep = await this.requireRep(user);
    const tenant = await this.repTenant(rep.id, tenantId);
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException({ message: "Owner must confirm before importing data", code: "TENANT_PENDING_OWNER" });
    }
    return { tenantId, userId: user.userId, actingRepUserId: user.userId };
  }

  // --- rep: portfolio & commission -----------------------------------------

  async portfolio(user: JwtUser) {
    const rep = await this.requireRep(user);
    const tenants = await this.prisma.tenant.findMany({
      where: { OR: [{ createdBySalesRepId: rep.id }, { salesRepCode: rep.code }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        nameAr: true,
        status: true,
        createdAt: true,
        ownerConfirmedAt: true,
        createdBySalesRepId: true,
        onboardingProgress: { select: { activatedAt: true } },
        subscription: { select: { status: true, plan: { select: { key: true } } } },
        kiorlyInvoices: { where: { status: KiorlyInvoiceStatus.PAID }, select: { id: true }, take: 1 },
      },
    });
    const clinics = tenants.map((t) => ({
      tenantId: t.id,
      name: t.name,
      nameAr: t.nameAr,
      status: t.status,
      createdByRep: t.createdBySalesRepId === rep.id,
      createdAt: t.createdAt.toISOString(),
      ownerConfirmedAt: t.ownerConfirmedAt?.toISOString() ?? null,
      activatedAt: t.onboardingProgress?.activatedAt?.toISOString() ?? null,
      planKey: t.subscription?.plan.key ?? null,
      subscriptionStatus: t.subscription?.status ?? null,
      paid: t.kiorlyInvoices.length > 0,
    }));
    return {
      rep: { code: rep.code, displayName: rep.displayName },
      totals: {
        signups: clinics.length,
        pendingOwner: clinics.filter((c) => c.status === TenantStatus.PENDING_OWNER).length,
        activated: clinics.filter((c) => c.activatedAt).length,
        paid: clinics.filter((c) => c.paid).length,
      },
      clinics,
    };
  }

  async commission(user: JwtUser, period?: string) {
    const rep = await this.requireRep(user);
    const { from, to, label } = parsePeriod(period);
    const invoices = await this.prisma.kiorlyInvoice.findMany({
      where: {
        status: KiorlyInvoiceStatus.PAID,
        paidAt: { gte: from, lt: to },
        tenant: { OR: [{ createdBySalesRepId: rep.id }, { salesRepCode: rep.code }] },
      },
      select: {
        id: true,
        total: true,
        currency: true,
        paidAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            market: { select: { code: true, commercialConfig: true } },
            subscription: { select: { status: true } },
          },
        },
      },
    });
    const byCurrency = new Map<string, { marketCode: string; rows: typeof invoices }>();
    for (const inv of invoices) {
      const key = inv.currency;
      const entry = byCurrency.get(key) ?? { marketCode: inv.tenant.market?.code ?? "", rows: [] };
      entry.rows.push(inv);
      byCurrency.set(key, entry);
    }
    const lines = [...byCurrency.entries()].map(([currency, { marketCode, rows }]) => {
      const parsed = safeParseCommercialConfig(rows[0]?.tenant.market?.commercialConfig);
      const cfg = (parsed.success && parsed.data.salesRep) || SALES_REP_COMMISSION_DEFAULTS;
      const summary = repCommissionForInvoices(
        rows.map((r) => ({
          total: Number(r.total),
          tenantCreatedAt: r.tenant.createdAt,
          retained: isRetained(r.tenant.subscription?.status),
        })),
        cfg,
        to,
      );
      return {
        currency,
        marketCode,
        commissionPercent: cfg.commissionPercent,
        retentionDays: cfg.retentionDays,
        invoiceCount: rows.length,
        ...summary,
      };
    });
    return { period: label, from: from.toISOString(), to: to.toISOString(), lines };
  }
}

function isRetained(status: SubscriptionStatus | undefined): boolean {
  return status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING || status === SubscriptionStatus.PAST_DUE;
}

export function parsePeriod(period?: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(period?.trim() ?? "");
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) - 1 : now.getUTCMonth();
  if (month < 0 || month > 11) throw new BadRequestException("period must be YYYY-MM");
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));
  return { from, to, label: `${year}-${String(month + 1).padStart(2, "0")}` };
}
