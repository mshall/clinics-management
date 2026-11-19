import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MessageChannel, Prisma } from "@prisma/client";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { EmailService } from "../messaging/email.service";
import { MessagingService } from "../messaging/messaging.service";
import { localDateKey, localHour, localWeekKey } from "../messaging/digest-policy";
import { PrismaService } from "../prisma/prisma.service";
import { isReportExportKey } from "../reports/report-export-format";

const SCAN_MS = 60_000;
export const OWNER_SCHEDULED_REPORT_TEMPLATE = "owner_scheduled_report";

/** RP-02 — weekly email/WhatsApp nudge with export links for configured report keys. */
@Injectable()
export class ScheduledReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ScheduledReportsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.tick().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    let sent = 0;
    for (const t of tenants) {
      try {
        sent += await this.sendForTenant(t.id, now);
      } catch (e) {
        this.log.warn(`scheduled report ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return sent;
  }

  async sendForTenant(tenantId: string, now = new Date()): Promise<number> {
    const schedule = await this.prisma.tenantReportSchedule.findUnique({ where: { tenantId } });
    const enabled = schedule?.enabled ?? true;
    if (!enabled) return 0;
    const dayOfWeek = schedule?.dayOfWeek ?? 1;
    const hourLocal = schedule?.hourLocal ?? 9;
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    const tz = market.timezone;
    const hour = localHour(now, tz);
    if (hour !== hourLocal) return 0;
    const dateKey = localDateKey(now, tz);
    const [y, m, d] = dateKey.split("-").map(Number);
    const utc = new Date(Date.UTC(y!, m! - 1, d!));
    const isoDow = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay();
    if (isoDow !== dayOfWeek) return 0;

    const keysRaw = schedule?.reportKeys;
    const keys = Array.isArray(keysRaw)
      ? (keysRaw as unknown[]).map(String).filter(isReportExportKey)
      : ["payments", "operations"];
    const format = schedule?.format === "pdf" ? "pdf" : "xlsx";
    const week = localWeekKey(now, tz);
    const channelEmail = schedule?.channelEmail !== false;
    const channelWhatsApp = schedule?.channelWhatsApp !== false;

    const owners = await this.prisma.user.findMany({
      where: { tenantId, isTenantOwner: true, deactivatedAt: null, deletedAt: null },
      select: { id: true, displayName: true, email: true, employee: { select: { phone: true } } },
    });
    let sent = 0;
    const exportPaths = keys.map((k) => `/api/v1/reports/${k}/export?format=${format}`).join(", ");
    for (const o of owners) {
      if (!(await this.claimSend(tenantId, o.id, week))) continue;
      if (channelWhatsApp) {
        let phone = o.employee?.phone?.trim() || null;
        if (!phone) {
          const byEmail = await this.prisma.employee.findFirst({
            where: { tenantId, email: o.email },
            select: { phone: true },
          });
          phone = byEmail?.phone?.trim() || null;
        }
        if (phone) {
          await this.messaging.queueMessage(tenantId, {
            channel: MessageChannel.WHATSAPP,
            toPhone: phone,
            templateKey: OWNER_SCHEDULED_REPORT_TEMPLATE,
            body: `Weekly reports ready: ${keys.join(", ")}. Download in Reports.`,
            variables: {
              name: o.displayName,
              keys: keys.join(", "),
              format,
            },
            metadata: { kind: "scheduled_report", week, keys },
          });
        }
      }
      if (channelEmail && o.email) {
        await this.email.send({
          tenantId,
          to: o.email,
          templateKey: "weekly_report",
          locale: "both",
          variables: {
            reportKeys: keys.join(", "),
            exportPath: exportPaths,
            name: o.displayName,
          },
          tags: { kind: "scheduled_report" },
        });
      }
      sent += 1;
    }
    return sent;
  }

  private async claimSend(tenantId: string, userId: string, week: string): Promise<boolean> {
    try {
      await this.prisma.digestSendLog.create({
        data: {
          tenantId,
          userId,
          kind: "scheduled_report",
          periodKey: week,
        },
      });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
  }
}
