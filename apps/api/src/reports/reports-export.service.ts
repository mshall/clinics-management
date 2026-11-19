import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinancialVisibilityOverride, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { resolveReportingRange, formatLocalYmd } from "../common/reporting-range";
import {
  DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  loadUserMoneyVisibilityOverrides,
  operationSummaryFinancialsVisibleForViewer,
} from "../common/user-money-visibility";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildReportPdf,
  buildSpreadsheetMl,
  flattenObjectRows,
  isReportExportKey,
  MONEY_REPORT_KEYS,
  type ExportRow,
  type ReportExportKey,
} from "./report-export-format";
import { ReportsService } from "./reports.service";

export type ReportExportResult = {
  key: ReportExportKey;
  format: "xlsx" | "pdf";
  filename: string;
  contentType: string;
  body: Buffer;
  rowCount: number;
};

@Injectable()
export class ReportsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  async assertMoneyVisible(tenantId: string, viewer: JwtUser, key: ReportExportKey): Promise<void> {
    if (!MONEY_REPORT_KEYS.has(key)) return;
    const overrides = await loadUserMoneyVisibilityOverrides(this.prisma, tenantId, viewer.userId);
    if (!operationSummaryFinancialsVisibleForViewer(viewer, overrides)) {
      throw new ForbiddenException({
        message: "Money fields are hidden for your account",
        code: "MONEY_VISIBILITY_DENIED",
      });
    }
  }

  /** Pure helper for unit tests — same gate without DB. */
  static moneyVisibleForOverrides(
    viewer: JwtUser | undefined,
    overrides: typeof DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  ): boolean {
    return operationSummaryFinancialsVisibleForViewer(viewer, overrides);
  }

  async buildRows(
    tenantId: string,
    key: ReportExportKey,
    from?: string,
    to?: string,
    clinicId?: string,
    viewer?: JwtUser,
  ): Promise<ExportRow[]> {
    switch (key) {
      case "profit-loss": {
        const data = await this.reports.profitLoss(tenantId, from, to, clinicId, viewer);
        return [
          ...flattenObjectRows("summary", {
            revenue: data.revenue,
            expenses: data.expenses,
            netProfit: data.netProfit,
            baseCurrency: data.baseCurrency,
            from: data.period.from,
            to: data.period.to,
          }),
          ...flattenObjectRows("byCurrency", data.byCurrency),
        ];
      }
      case "performance": {
        const data = await this.reports.performanceSummary(tenantId, from, to, clinicId, viewer);
        return flattenObjectRows("performance", {
          visits: data.visits,
          newPatients: data.newPatients,
          appointmentsCompleted: data.appointmentsCompleted,
          baseCurrency: data.baseCurrency,
          byCurrency: data.byCurrency,
          from: data.period.from,
          to: data.period.to,
        });
      }
      case "operations": {
        const data = await this.reports.operationsReport(tenantId, from, to, clinicId, viewer);
        return [
          ...flattenObjectRows("noShow", data.noShow),
          ...flattenObjectRows("utilisation", data.utilisation),
          ...flattenObjectRows("revenuePerDoctorHour", { value: data.revenuePerDoctorHour }),
          ...flattenObjectRows("newVsReturning", data.newVsReturning),
          ...flattenObjectRows("bookingSources", data.bookingSources),
        ];
      }
      case "clinic-breakdown": {
        const data = await this.reports.clinicBreakdown(tenantId, from, to, viewer);
        return flattenObjectRows("clinic", data.items);
      }
      case "monthly-series": {
        const data = await this.reports.monthlySeries(tenantId, from, to, clinicId, viewer);
        return flattenObjectRows("month", data.items);
      }
      case "patient-acquisition": {
        const data = await this.reports.patientAcquisitionBreakdown(tenantId, from, to);
        return flattenObjectRows("channel", data.items);
      }
      case "payments":
        return this.paymentsRows(tenantId, from, to, clinicId, viewer);
      default:
        throw new NotFoundException({ message: `Unknown report key`, code: "REPORT_KEY_UNKNOWN" });
    }
  }

  private async paymentsRows(
    tenantId: string,
    fromStr?: string,
    toStr?: string,
    clinicIdStr?: string,
    viewer?: JwtUser,
  ): Promise<ExportRow[]> {
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const clinicId = clinicIdStr?.trim() || null;
    const where: Prisma.BillingPaymentWhereInput = {
      tenantId,
      createdAt: { gte: start, lte: end },
      ...(clinicId ? { clinicId } : {}),
      patient: { isSample: false },
    };
    const payments = await this.prisma.billingPayment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 10_000,
      select: {
        id: true,
        createdAt: true,
        totalAmount: true,
        currency: true,
        clinicId: true,
        patient: {
          select: { mrn: true, firstNameEn: true, lastNameEn: true, firstNameAr: true, lastNameAr: true },
        },
        allocations: {
          select: { method: true, amount: true, revenueEntryId: true },
        },
      },
    });
    const revenueIds = payments.flatMap((p) =>
      p.allocations.map((a) => a.revenueEntryId).filter((id): id is string => Boolean(id)),
    );
    const revenueRows =
      revenueIds.length === 0
        ? []
        : await this.prisma.revenueEntry.findMany({
            where: { id: { in: revenueIds } },
            select: {
              id: true,
              category: true,
              description: true,
              transferReference: true,
              transferChannel: true,
            },
          });
    const revenueById = new Map(revenueRows.map((r) => [r.id, r]));
    const rows: ExportRow[] = [];
    for (const p of payments) {
      const patientName =
        `${p.patient.firstNameEn} ${p.patient.lastNameEn}`.trim() ||
        `${p.patient.firstNameAr ?? ""} ${p.patient.lastNameAr ?? ""}`.trim();
      if (p.allocations.length === 0) {
        rows.push({
          date: formatLocalYmd(p.createdAt),
          patient: patientName,
          mrn: p.patient.mrn,
          service: "",
          amount: Number(p.totalAmount),
          currency: p.currency,
          method: "",
          reference: "",
          paymentId: p.id,
          clinicId: p.clinicId,
        });
        continue;
      }
      for (const a of p.allocations) {
        const rev = a.revenueEntryId ? revenueById.get(a.revenueEntryId) : undefined;
        rows.push({
          date: formatLocalYmd(p.createdAt),
          patient: patientName,
          mrn: p.patient.mrn,
          service: rev?.description || rev?.category || "",
          amount: Number(a.amount),
          currency: p.currency,
          method: a.method,
          reference: rev?.transferReference || rev?.transferChannel || "",
          paymentId: p.id,
          clinicId: p.clinicId,
        });
      }
    }
    void viewer;
    return rows;
  }

  async export(
    tenantId: string,
    keyRaw: string,
    formatRaw: string | undefined,
    from?: string,
    to?: string,
    clinicId?: string,
    viewer?: JwtUser,
  ): Promise<ReportExportResult> {
    if (!isReportExportKey(keyRaw)) {
      throw new NotFoundException({ message: `Unknown report key: ${keyRaw}`, code: "REPORT_KEY_UNKNOWN" });
    }
    const format = (formatRaw ?? "xlsx").toLowerCase() === "pdf" ? "pdf" : "xlsx";
    if (viewer) await this.assertMoneyVisible(tenantId, viewer, keyRaw);
    const rows = await this.buildRows(tenantId, keyRaw, from, to, clinicId, viewer);
    const stamp = formatLocalYmd(new Date());
    if (format === "pdf") {
      return {
        key: keyRaw,
        format,
        filename: `kiorly-${keyRaw}-${stamp}.pdf`,
        contentType: "application/pdf",
        body: buildReportPdf(`Kiorly report: ${keyRaw}`, rows),
        rowCount: rows.length,
      };
    }
    return {
      key: keyRaw,
      format: "xlsx",
      filename: `kiorly-${keyRaw}-${stamp}.xls`,
      contentType: "application/vnd.ms-excel",
      body: buildSpreadsheetMl(keyRaw, rows),
      rowCount: rows.length,
    };
  }

  async getSchedule(tenantId: string) {
    const row = await this.prisma.tenantReportSchedule.findUnique({ where: { tenantId } });
    return (
      row ?? {
        tenantId,
        enabled: true,
        format: "xlsx",
        reportKeys: ["payments", "operations"],
        channelEmail: true,
        channelWhatsApp: true,
        dayOfWeek: 1,
        hourLocal: 9,
      }
    );
  }

  async putSchedule(
    tenantId: string,
    body: {
      enabled?: boolean;
      format?: string;
      reportKeys?: string[];
      channelEmail?: boolean;
      channelWhatsApp?: boolean;
      dayOfWeek?: number;
      hourLocal?: number;
    },
  ) {
    const keys = (body.reportKeys ?? ["payments", "operations"]).filter(isReportExportKey);
    const data = {
      enabled: body.enabled !== false,
      format: body.format === "pdf" ? "pdf" : "xlsx",
      reportKeys: keys as unknown as Prisma.InputJsonValue,
      channelEmail: body.channelEmail !== false,
      channelWhatsApp: body.channelWhatsApp !== false,
      dayOfWeek: clampDow(body.dayOfWeek ?? 1),
      hourLocal: clampHour(body.hourLocal ?? 9),
    };
    return this.prisma.tenantReportSchedule.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }
}

function clampDow(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(7, Math.max(1, Math.trunc(n)));
}

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return 9;
  return Math.min(23, Math.max(0, Math.trunc(n)));
}

/** Test helper: HIDE override blocks money exports. */
export function moneyExportBlockedByHideOverride(): boolean {
  const viewer = {
    userId: "u1",
    tenantId: "t1",
    email: "a@b.c",
    role: "FINANCE_OFFICER",
    roles: ["FINANCE_OFFICER"],
  } as JwtUser;
  const overrides = {
    ...DEFAULT_MONEY_VISIBILITY_OVERRIDES,
    operations: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT,
  };
  return !ReportsExportService.moneyVisibleForOverrides(viewer, overrides);
}
