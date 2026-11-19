import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AppointmentStatus, MessageChannel, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_DIGEST_PREFS,
  type DigestKind,
  type DigestPrefsLike,
  localDateKey,
  localHour,
  localWeekKey,
  mayDeliverDigest,
  normalizeDigestPrefs,
} from "./digest-policy";
import { MessagingService } from "./messaging.service";
import type { OwnerRecipient } from "./owner-notifications.service";

export const DOCTOR_TOMORROW_TEMPLATE = "doctor_tomorrow_digest";
export const OWNER_WEEKLY_TEMPLATE = "owner_weekly_insights";
export const KIOREX_PROGRESS_TEMPLATE = "kiorex_progress_nudge";
export const MONTHLY_RECAP_TEMPLATE = "kiorex_monthly_recap";

const SCAN_MS = 60_000;
const DOCTOR_SEND_HOUR = 20;

/** MS-04 — doctor tomorrow list, owner weekly insights, CR-07 WhatsApp/in-app nudges + monthly recap. */
@Injectable()
export class DigestsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DigestsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Same recipients as OwnerNotificationsService — kept here to avoid a Nest circular DI edge. */
  private async ownerRecipients(tenantId: string): Promise<OwnerRecipient[]> {
    const owners = await this.prisma.user.findMany({
      where: { tenantId, isTenantOwner: true, deactivatedAt: null, deletedAt: null },
      select: { id: true, displayName: true, email: true, employee: { select: { phone: true } } },
    });
    const out: OwnerRecipient[] = [];
    for (const o of owners) {
      let phone = o.employee?.phone?.trim() || null;
      if (!phone) {
        const byEmail = await this.prisma.employee.findFirst({ where: { tenantId, email: o.email }, select: { phone: true } });
        phone = byEmail?.phone?.trim() || null;
      }
      if (phone) out.push({ userId: o.id, displayName: o.displayName, phone });
    }
    return out;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.tick().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async getPreferences(tenantId: string, userId: string): Promise<DigestPrefsLike> {
    const row = await this.prisma.staffDigestPreference.findUnique({ where: { userId } });
    return normalizeDigestPrefs(row ?? undefined);
  }

  async putPreferences(tenantId: string, user: JwtUser, body: Partial<DigestPrefsLike>) {
    const next = normalizeDigestPrefs({ ...(await this.getPreferences(tenantId, user.userId)), ...body });
    if (next.quietHoursStart < 0 || next.quietHoursStart > 23 || next.quietHoursEnd < 0 || next.quietHoursEnd > 23) {
      throw new BadRequestException({ message: "Quiet hours must be 0–23", code: "QUIET_HOURS_INVALID" });
    }
    await this.prisma.staffDigestPreference.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, tenantId, ...next },
      update: { ...next, tenantId },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: "DIGEST_PREFERENCES_UPDATED",
        resource: "StaffDigestPreference",
        resourceId: user.userId,
        metadata: next as unknown as Prisma.InputJsonValue,
      },
    });
    return next;
  }

  async listNotices(tenantId: string, userId: string, opts: { unreadOnly?: boolean } = {}) {
    return this.prisma.staffInAppNotice.findMany({
      where: { tenantId, userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markNoticeRead(tenantId: string, userId: string, noticeId: string) {
    const row = await this.prisma.staffInAppNotice.findFirst({ where: { id: noticeId, tenantId, userId } });
    if (!row) throw new BadRequestException("Notice not found");
    if (row.readAt) return row;
    return this.prisma.staffInAppNotice.update({ where: { id: noticeId }, data: { readAt: new Date() } });
  }

  /** Preferences for a user, or defaults when none saved. */
  async prefsFor(userId: string): Promise<DigestPrefsLike> {
    const row = await this.prisma.staffDigestPreference.findUnique({ where: { userId } });
    return normalizeDigestPrefs(row ?? DEFAULT_DIGEST_PREFS);
  }

  async tick(now = new Date()): Promise<{ doctor: number; weekly: number; recap: number; nudges: number }> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    let doctor = 0;
    let weekly = 0;
    let recap = 0;
    let nudges = 0;
    for (const t of tenants) {
      try {
        doctor += await this.sendDoctorDigests(t.id, now);
        weekly += await this.sendOwnerWeekly(t.id, now);
        recap += await this.sendMonthlyRecaps(t.id, now);
        nudges += await this.deliverPendingKiorexNudges(t.id, now);
      } catch (e) {
        this.log.warn(`digest tick ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { doctor, weekly, recap, nudges };
  }

  /** Doctor: tomorrow's appointment list at 20:00 local (once per day). */
  async sendDoctorDigests(tenantId: string, now = new Date()): Promise<number> {
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) return 0;
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const tz = market.timezone;
    if (localHour(now, tz) !== DOCTOR_SEND_HOUR) return 0;
    const today = localDateKey(now, tz);
    const doctors = await this.prisma.user.findMany({
      where: {
        tenantId,
        deactivatedAt: null,
        deletedAt: null,
        OR: [{ role: UserRole.PHYSICIAN }, { additionalRoles: { has: UserRole.PHYSICIAN } }],
      },
      select: { id: true, displayName: true, employee: { select: { phone: true } }, email: true },
    });
    let sent = 0;
    for (const d of doctors) {
      const prefs = await this.prefsFor(d.id);
      if (!mayDeliverDigest(prefs, "doctor_tomorrow", DOCTOR_SEND_HOUR)) continue;
      if (!(await this.claimSend(tenantId, d.id, "doctor_tomorrow", today))) continue;
      const phone = await this.phoneFor(tenantId, d.id, d.email, d.employee?.phone);
      const tomorrowStart = this.nextLocalDayStart(now, tz);
      const tomorrowEnd = new Date(tomorrowStart.getTime() + 86_400_000);
      const apts = await this.prisma.appointment.findMany({
        where: {
          tenantId,
          clinicianId: d.id,
          startsAt: { gte: tomorrowStart, lt: tomorrowEnd },
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN] },
        },
        include: { patient: { select: { firstNameEn: true, lastNameEn: true } }, clinic: { select: { nameEn: true } } },
        orderBy: { startsAt: "asc" },
        take: 40,
      });
      const lines = apts
        .map((a) => {
          const t = a.startsAt.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
          return `${t} ${a.patient.firstNameEn} ${a.patient.lastNameEn}`.trim();
        })
        .join("; ");
      const count = String(apts.length);
      const clinic = apts[0]?.clinic.nameEn ?? "Clinic";
      const body =
        apts.length === 0
          ? `No appointments tomorrow at ${clinic}.`
          : `Tomorrow (${apts.length}): ${lines.slice(0, 900)}`;
      await this.createNotice(tenantId, d.id, "doctor_tomorrow", {
        titleEn: "Tomorrow's list",
        titleAr: "قائمة الغد",
        bodyEn: body,
        bodyAr: body,
        metadata: { count: apts.length, date: today },
      });
      if (phone) {
        await this.messaging.queueMessage(tenantId, {
          channel: MessageChannel.WHATSAPP,
          toPhone: phone,
          templateKey: DOCTOR_TOMORROW_TEMPLATE,
          body,
          variables: { name: d.displayName, clinic, count, list: lines.slice(0, 500) || "—" },
          metadata: { kind: "doctor_tomorrow", recipientUserId: d.id },
        });
      }
      sent += 1;
    }
    return sent;
  }

  /** Owner weekly insights (Pro+ via mod_messaging): visits, revenue, no-shows, Kiorex, free progress. */
  async sendOwnerWeekly(tenantId: string, now = new Date()): Promise<number> {
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) return 0;
    if (!(await this.entitlements.isEntitled(tenantId, "mod_messaging"))) return 0;
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const tz = market.timezone;
    const hour = localHour(now, tz);
    // Sunday evening window 18–19 local
    const dow = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
    if (dow !== "Sun" || hour !== 18) return 0;
    const week = localWeekKey(now, tz);
    const recipients = await this.ownerRecipients(tenantId);
    let sent = 0;
    const weekStart = this.daysAgoLocal(now, tz, 7);
    const visits = await this.prisma.appointment.count({
      where: { tenantId, startsAt: { gte: weekStart, lt: now }, status: { not: AppointmentStatus.CANCELLED } },
    });
    const noShows = await this.prisma.appointment.count({
      where: { tenantId, startsAt: { gte: weekStart, lt: now }, status: AppointmentStatus.NO_SHOW },
    });
    const revenue = await this.prisma.revenueEntry.aggregate({
      where: { tenantId, status: "POSTED", postedAt: { gte: weekStart, lt: now } },
      _sum: { netAmount: true },
    });
    const rev = Number(revenue._sum.netAmount ?? 0).toFixed(2);
    const kiorexPatients = await this.prisma.appointment.count({
      where: {
        tenantId,
        startsAt: { gte: weekStart, lt: now },
        bookingSource: "KIOREX_MARKETPLACE",
        status: { not: AppointmentStatus.CANCELLED },
      },
    });
    const freeNudge = await this.prisma.kiorexProgressNudge.findFirst({
      where: { tenantId, threshold: 100 },
      orderBy: { createdAt: "desc" },
    });
    const progressPct = freeNudge ? 100 : kiorexPatients > 0 ? 50 : 0;
    for (const r of recipients) {
      const prefs = await this.prefsFor(r.userId);
      if (!mayDeliverDigest(prefs, "owner_weekly", hour)) continue;
      if (!(await this.claimSend(tenantId, r.userId, "owner_weekly", week))) continue;
      const body = `This week: ${visits} visits, ${rev} ${market.currency} collected, ${noShows} no-shows, ${kiorexPatients} Kiorex patients, Kiorly free ${progressPct}%.`;
      await this.createNotice(tenantId, r.userId, "owner_weekly", {
        titleEn: "Weekly clinic insights",
        titleAr: "ملخص العيادة الأسبوعي",
        bodyEn: body,
        bodyAr: body,
        metadata: { visits, noShows, revenue: rev, kiorexPatients, progressPct, week },
      });
      await this.messaging.queueMessage(tenantId, {
        channel: MessageChannel.WHATSAPP,
        toPhone: r.phone,
        templateKey: OWNER_WEEKLY_TEMPLATE,
        body,
        variables: {
          name: r.displayName,
          visits: String(visits),
          revenue: `${rev} ${market.currency}`,
          noshows: String(noShows),
          kiorex: String(kiorexPatients),
          progress: `${progressPct}`,
        },
        metadata: { kind: "owner_weekly", recipientUserId: r.userId, week },
      });
      sent += 1;
    }
    return sent;
  }

  /** CR-07 monthly recap on the 1st at 10:00 local — amount offset / saved last month. */
  async sendMonthlyRecaps(tenantId: string, now = new Date()): Promise<number> {
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) return 0;
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const tz = market.timezone;
    const hour = localHour(now, tz);
    const day = Number(localDateKey(now, tz).slice(8, 10));
    if (day !== 1 || hour !== 10) return 0;
    const prev = this.previousPeriodKey(now, tz);
    const recipients = await this.ownerRecipients(tenantId);
    let sent = 0;
    const currency = market.currency;
    const [py, pm] = prev.split("-").map(Number);
    const periodStart = new Date(Date.UTC(py!, pm! - 1, 1));
    const periodEnd = new Date(Date.UTC(pm === 12 ? py! + 1 : py!, pm === 12 ? 0 : pm!, 1));
    const commissionSum = await this.prisma.kiorexCommissionCharge.aggregate({
      where: { tenantId, status: { in: ["CONFIRMED", "BILLED"] }, createdAt: { gte: periodStart, lt: periodEnd } },
      _sum: { amount: true },
    });
    const saved = Number(commissionSum._sum.amount ?? 0);
    for (const r of recipients) {
      const prefs = await this.prefsFor(r.userId);
      if (!mayDeliverDigest(prefs, "monthly_recap", hour)) continue;
      if (!(await this.claimSend(tenantId, r.userId, "monthly_recap", prev))) continue;
      const amount = `${saved.toFixed(2)} ${currency}`;
      const body = `Last month (${prev}): Kiorex offset ${amount} toward your Kiorly subscription.`;
      await this.createNotice(tenantId, r.userId, "monthly_recap", {
        titleEn: "Kiorly monthly recap",
        titleAr: "ملخص كيورلي الشهري",
        bodyEn: body,
        bodyAr: body,
        metadata: { periodKey: prev, saved },
      });
      await this.messaging.queueMessage(tenantId, {
        channel: MessageChannel.WHATSAPP,
        toPhone: r.phone,
        templateKey: MONTHLY_RECAP_TEMPLATE,
        body,
        variables: { name: r.displayName, period: prev, amount },
        metadata: { kind: "monthly_recap", recipientUserId: r.userId, periodKey: prev },
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * Deliver WhatsApp + in-app for KiorexProgressNudge rows that exist but have not been messaged yet
   * (tracked via DigestSendLog kind kiorex_progress + periodKey-threshold).
   */
  async deliverPendingKiorexNudges(tenantId: string, now = new Date()): Promise<number> {
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) return 0;
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const hour = localHour(now, market.timezone);
    const nudges = await this.prisma.kiorexProgressNudge.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const recipients = await this.ownerRecipients(tenantId);
    let sent = 0;
    for (const n of nudges) {
      for (const r of recipients) {
        const prefs = await this.prefsFor(r.userId);
        if (!mayDeliverDigest(prefs, "kiorex_progress", hour)) continue;
        const periodKey = `${n.periodKey}:${n.threshold}`;
        if (!(await this.claimSend(tenantId, r.userId, "kiorex_progress", periodKey))) continue;
        const titleEn = n.threshold >= 100 ? "Kiorly is free this month" : `Kiorly free progress ${n.threshold}%`;
        const titleAr = n.threshold >= 100 ? "كيورلي مجاني هذا الشهر" : `تقدم كيورلي المجاني ${n.threshold}%`;
        const bodyEn =
          n.threshold >= 100
            ? `Congratulations — Kiorex commission has covered your Kiorly subscription for ${n.periodKey}.`
            : `You have reached ${n.threshold}% of the commission needed for free Kiorly in ${n.periodKey}. Keep accepting Kiorex bookings.`;
        await this.createNotice(tenantId, r.userId, "kiorex_progress", {
          titleEn,
          titleAr,
          bodyEn,
          bodyAr: bodyEn,
          metadata: { periodKey: n.periodKey, threshold: n.threshold },
        });
        await this.messaging.queueMessage(tenantId, {
          channel: MessageChannel.WHATSAPP,
          toPhone: r.phone,
          templateKey: KIOREX_PROGRESS_TEMPLATE,
          body: bodyEn,
          variables: { name: r.displayName, period: n.periodKey, threshold: String(n.threshold) },
          metadata: { kind: "kiorex_progress", recipientUserId: r.userId, periodKey: n.periodKey, threshold: n.threshold },
        });
        sent += 1;
      }
    }
    return sent;
  }

  /** Whether a shift-closed owner WhatsApp may go out for this user right now. */
  async maySendOwnerShift(userId: string, now: Date, timeZone: string): Promise<boolean> {
    const prefs = await this.prefsFor(userId);
    return mayDeliverDigest(prefs, "owner_shift", localHour(now, timeZone));
  }

  private async claimSend(tenantId: string, userId: string, kind: DigestKind | string, periodKey: string): Promise<boolean> {
    try {
      await this.prisma.digestSendLog.create({ data: { tenantId, userId, kind, periodKey } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
  }

  private async createNotice(
    tenantId: string,
    userId: string,
    kind: string,
    copy: { titleEn: string; titleAr: string; bodyEn: string; bodyAr: string; metadata?: Prisma.InputJsonValue },
  ) {
    return this.prisma.staffInAppNotice.create({
      data: {
        tenantId,
        userId,
        kind,
        titleEn: copy.titleEn,
        titleAr: copy.titleAr,
        bodyEn: copy.bodyEn,
        bodyAr: copy.bodyAr,
        metadata: copy.metadata ?? undefined,
      },
    });
  }

  private async phoneFor(tenantId: string, userId: string, email: string, employeePhone?: string | null) {
    let phone = employeePhone?.trim() || null;
    if (!phone) {
      const byEmail = await this.prisma.employee.findFirst({ where: { tenantId, email }, select: { phone: true } });
      phone = byEmail?.phone?.trim() || null;
    }
    return phone;
  }

  private nextLocalDayStart(now: Date, timeZone: string): Date {
    const today = localDateKey(now, timeZone);
    const [y, m, d] = today.split("-").map(Number);
    // noon UTC tomorrow-ish: walk forward 24h from a UTC guess of local midnight
    const guess = new Date(Date.UTC(y!, m! - 1, d! + 1, 12, 0, 0));
    // refine: find the UTC instant whose local date is tomorrow and hour is 0
    for (let i = 0; i < 48; i++) {
      const t = new Date(guess.getTime() - 12 * 3600_000 + i * 3600_000);
      if (localDateKey(t, timeZone) === localDateKey(new Date(Date.UTC(y!, m! - 1, d! + 1)), timeZone) && localHour(t, timeZone) === 0) {
        return t;
      }
    }
    return new Date(guess.getTime() - 12 * 3600_000);
  }

  private daysAgoLocal(now: Date, timeZone: string, days: number): Date {
    return new Date(now.getTime() - days * 86_400_000);
  }

  private previousPeriodKey(now: Date, timeZone: string): string {
    const [y, m] = localDateKey(now, timeZone).split("-").map(Number);
    const pm = m! === 1 ? 12 : m! - 1;
    const py = m! === 1 ? y! - 1 : y!;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }
}
