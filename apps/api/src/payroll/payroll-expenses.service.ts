import { Injectable } from "@nestjs/common";
import { EmployeeRecordStatus, ExpenseStatus, Prisma } from "@prisma/client";
import { effectiveEmployeeSalaryCurrency } from "../common/employee-salary-currency";
import { PrismaService } from "../prisma/prisma.service";

export const PAYROLL_EXPENSE_CATEGORY = "PAYROLL";

function listPayrollMonths(start: Date, end: Date): string[] {
  const out: string[] = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function monthBounds(payrollMonth: string): { start: Date; end: Date; incurredAt: Date } {
  const [y, mo] = payrollMonth.split("-").map((x) => Number.parseInt(x, 10));
  const start = new Date(y, mo - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, mo, 0, 23, 59, 59, 999);
  return { start, end, incurredAt: start };
}

@Injectable()
export class PayrollExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForRange(
    tenantId: string,
    start: Date,
    end: Date,
    scopeClinicIds: string[] | null,
  ): Promise<void> {
    for (const payrollMonth of listPayrollMonths(start, end)) {
      await this.ensureForMonth(tenantId, payrollMonth, scopeClinicIds);
    }
  }

  async ensureForMonth(tenantId: string, payrollMonth: string, scopeClinicIds: string[] | null): Promise<void> {
    const { start, end, incurredAt } = monthBounds(payrollMonth);
    const clinicFilter: Prisma.EmployeeWhereInput =
      scopeClinicIds != null ? { clinicId: { in: scopeClinicIds } } : {};

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        recordStatus: EmployeeRecordStatus.ACTIVE,
        salaryBase: { gt: 0 },
        hireDate: { lte: end },
        OR: [{ resignationDate: null }, { resignationDate: { gte: start } }],
        ...clinicFilter,
      },
      include: { clinic: { select: { defaultCurrency: true } } },
    });

    const activeIds = employees.map((e) => e.id);

    for (const emp of employees) {
      const vendorName = `Salary — ${emp.firstNameEn} ${emp.lastNameEn}`.trim();
      const currency = effectiveEmployeeSalaryCurrency(emp.salaryCurrency, emp.clinic.defaultCurrency);
      await this.prisma.expense.upsert({
        where: {
          tenantId_employeeId_payrollMonth: {
            tenantId,
            employeeId: emp.id,
            payrollMonth,
          },
        },
        create: {
          tenantId,
          clinicId: emp.clinicId,
          category: PAYROLL_EXPENSE_CATEGORY,
          vendorName,
          amount: emp.salaryBase,
          currency,
          incurredAt,
          status: ExpenseStatus.APPROVED,
          employeeId: emp.id,
          payrollMonth,
        },
        update: {
          clinicId: emp.clinicId,
          vendorName,
          amount: emp.salaryBase,
          currency,
          status: ExpenseStatus.APPROVED,
        },
      });
    }

    await this.prisma.expense.deleteMany({
      where: {
        tenantId,
        payrollMonth,
        category: PAYROLL_EXPENSE_CATEGORY,
        employeeId: { not: null },
        ...(scopeClinicIds != null ? { clinicId: { in: scopeClinicIds } } : {}),
        ...(activeIds.length ? { NOT: { employeeId: { in: activeIds } } } : {}),
      },
    });
  }
}
