import { BadRequestException, Injectable } from "@nestjs/common";
import { AppointmentStatus, RevenueStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import {
  buildMonthlyStatement,
  statementSourceFromSettlement,
} from "../billing-platform/monthly-statement";
import { SettlementService } from "../billing-platform/settlement.service";
import { parseBillingPeriod } from "../billing-platform/settlement-period";
import {
  currentPeriodKey,
  KIOREX_OVERVIEW_SOURCES,
  summarizeKiorexOverview,
} from "../marketplace/kiorex-overview";
import { PrismaService } from "../prisma/prisma.service";
import { deriveKiorexImpact, matchesStatement } from "./kiorex-impact";

@Injectable()
export class KiorexImpactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  async report(tenantId: string, periodRaw: string | undefined, viewer: JwtUser) {
    let period;
    try {
      period = parseBillingPeriod(periodRaw?.trim() || currentPeriodKey());
    } catch {
      throw new BadRequestException({ message: "period must be YYYY-MM", code: "PERIOD_INVALID" });
    }
    const range = { gte: period.periodStart, lt: period.periodEnd };

    const [appointments, charges, tenant] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          bookingSource: { in: [...KIOREX_OVERVIEW_SOURCES] },
          startsAt: range,
          patient: { isSample: false },
        },
        select: {
          id: true,
          startsAt: true,
          status: true,
          bookingSource: true,
          isNewPatientAtBooking: true,
        },
      }),
      this.prisma.kiorexCommissionCharge.findMany({
        where: { tenantId, attendedAt: range },
        select: { amount: true, status: true, attendedAt: true, currency: true },
      }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { baseCurrency: true } }),
    ]);

    const figures = summarizeKiorexOverview(period.periodStart, period.periodEnd, appointments, charges, []);

    const newPatientApptIds = appointments
      .filter(
        (a) =>
          (a.status === AppointmentStatus.CHECKED_IN || a.status === AppointmentStatus.COMPLETED) &&
          a.isNewPatientAtBooking,
      )
      .map((a) => a.id);

    let visitRevenue = 0;
    if (newPatientApptIds.length > 0) {
      const rev = await this.prisma.revenueEntry.aggregate({
        where: {
          tenantId,
          status: RevenueStatus.POSTED,
          appointmentId: { in: newPatientApptIds },
        },
        _sum: { netAmount: true },
      });
      visitRevenue = Number(rev._sum.netAmount ?? 0);
    }

    const preview = await this.settlement.previewForTenant(viewer, tenantId, period.periodKey);
    const calc = preview.calculation;
    const currency = charges[0]?.currency ?? tenant?.baseCurrency ?? "EGP";
    const statement = buildMonthlyStatement(
      statementSourceFromSettlement(period.periodKey, currency, 0, calc),
    );
    const offset = Number(calc.summary.offsetAmount);
    const statementCommission = Number(statement.commissionTotal);
    const statementOffset = Number(statement.offset);
    const commission = figures.commission.confirmed;

    const derived = deriveKiorexImpact({
      bookings: figures.bookings,
      attended: figures.attended,
      newPatients: figures.newPatients,
      visitRevenue,
      commission,
      offset,
    });

    // RP-03 acceptance: commission/offset reconcile with the CR-11 monthly statement.
    const statementMatch =
      matchesStatement({ commission, offset }, { commission: statementCommission, offset: statementOffset }) ||
      // When no confirmed charges yet, offset still must match the statement.
      (commission === 0 && Math.abs(offset - statementOffset) < 0.005);

    return {
      periodKey: period.periodKey,
      period: {
        from: period.periodStart.toISOString().slice(0, 10),
        to: new Date(period.periodEnd.getTime() - 1).toISOString().slice(0, 10),
      },
      currency,
      bookings: figures.bookings,
      attended: figures.attended,
      newPatients: figures.newPatients,
      visitRevenue: Math.round(visitRevenue * 100) / 100,
      commission,
      commissionPending: figures.commission.pending,
      offset,
      statementCommission,
      statementOffset,
      ...derived,
      matchesStatement: statementMatch,
      bookingsByChannel: figures.bookingsByChannel,
    };
  }
}
