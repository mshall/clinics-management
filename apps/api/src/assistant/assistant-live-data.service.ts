import { ForbiddenException, Injectable } from "@nestjs/common";
import { EmployeeRecordStatus, ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import { fetchEmployeeManageScopeIds } from "../common/clinic-scope";
import type { JwtUser } from "../auth/jwt-user";
import { formatLocalYmd } from "../common/reporting-range";
import type { ClinicDto } from "../clinics/clinics.service";
import { ClinicsService } from "../clinics/clinics.service";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { RevenueService } from "../revenue/revenue.service";
import {
  canAssistantQueryExpenses,
  canAssistantQueryOrgRevenue,
  canAssistantQueryPersonalRevenue,
} from "./assistant-finance-policy";
import {
  messageAsksForClinicList,
  messageAsksForClinicRevenueBreakdown,
  messageAsksForEmployeeCount,
  messageAsksForExpenses,
  messageAsksForOrgUsers,
  messageAsksForPatientCount,
  messageAsksForRevenue,
  messageNeedsClinicContext,
} from "./assistant-intent";
import { resolveAssistantRevenueIsPersonal } from "./assistant-revenue-scope";
import { canAssistantQueryEmployeeCount } from "./assistant-hr-policy";
import { canAssistantSearchPatients } from "./assistant-patient-policy";
import { extractPatientSearchTerm, messageAsksForPatientLookup } from "./assistant-patient-search";
import { mdCallout, mdHeading, mdMetric } from "./assistant-markdown";
import { resolveAssistantPeriod, type AssistantPeriod } from "./assistant-period";
import type { AssistantChatActionDto } from "./dto/assistant-chat.dto";

const ASSISTANT_PATIENT_SEARCH_LIMIT = 8;

export type AssistantLiveClinic = {
  id: string;
  nameEn: string;
  nameAr: string;
  city: string;
  country: string;
  kind: string;
  status: string;
  parentNameEn: string | null;
};

export type AssistantFinancialSummary = {
  period: AssistantPeriod;
  scope: "organization" | "personal";
  revenueByCurrency: { currency: string; grossTotal: number; netTotal: number }[];
  revenueNetTotal: number;
  revenueGrossTotal: number;
  expenseByCurrency?: { currency: string; amount: number }[];
  expenseTotal?: number;
};

export type AssistantLiveSnapshot = {
  organization: { name: string; baseCurrency: string } | null;
  role: UserRole;
  displayName?: string;
  allowedNavKeys: string[];
  clinics?: AssistantLiveClinic[];
  patientCount?: number;
  organizationUserCount?: number;
  activeEmployeeCount?: number;
  employeeCountScope?: "organization" | "clinic_scope";
  financialSummary?: AssistantFinancialSummary;
  financialAccessDenied?: boolean;
  generatedAt: string;
};

@Injectable()
export class AssistantLiveDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinics: ClinicsService,
    private readonly revenue: RevenueService,
    private readonly patients: PatientsService,
  ) {}

  private canSeePatients(navKeys: string[]): boolean {
    return navKeys.includes("patients");
  }

  private canSeeOrgUsers(navKeys: string[]): boolean {
    return navKeys.includes("admin");
  }

  async buildSnapshot(user: JwtUser, navKeys: string[], message: string): Promise<AssistantLiveSnapshot> {
    const tenantId = user.tenantId;
    const snapshot: AssistantLiveSnapshot = {
      organization: null,
      role: user.role,
      displayName: user.email,
      allowedNavKeys: navKeys,
      generatedAt: new Date().toISOString(),
    };

    if (!tenantId) return snapshot;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, baseCurrency: true },
    });
    if (tenant) {
      snapshot.organization = { name: tenant.name, baseCurrency: tenant.baseCurrency };
    }

    const loadClinics =
      user.role !== UserRole.PLATFORM_SUPER_ADMIN &&
      (messageNeedsClinicContext(message) ||
        navKeys.includes("clinics") ||
        navKeys.includes("admin") ||
        navKeys.includes("dashboard"));

    if (loadClinics) {
      const rows = await this.clinics.list(tenantId, user, false);
      snapshot.clinics = rows.map((c) => this.mapClinic(c));
    }

    if (this.canSeePatients(navKeys) && messageAsksForPatientCount(message)) {
      snapshot.patientCount = await this.prisma.patient.count({
        where: { tenantId, deletedAt: null },
      });
    }

    if (this.canSeeOrgUsers(navKeys) && messageAsksForOrgUsers(message)) {
      snapshot.organizationUserCount = await this.prisma.user.count({ where: { tenantId } });
    }

    if (canAssistantQueryEmployeeCount(navKeys, user.role) && messageAsksForEmployeeCount(message)) {
      const scopeIds = await fetchEmployeeManageScopeIds(this.prisma, tenantId, user);
      const where: Prisma.EmployeeWhereInput = {
        tenantId,
        deletedAt: null,
        recordStatus: EmployeeRecordStatus.ACTIVE,
      };
      if (scopeIds !== null) {
        where.clinicId = scopeIds.length ? { in: scopeIds } : { in: [] };
        snapshot.employeeCountScope = "clinic_scope";
      } else {
        snapshot.employeeCountScope = "organization";
      }
      snapshot.activeEmployeeCount = await this.prisma.employee.count({ where });
    }

    if (messageAsksForRevenue(message) || messageAsksForExpenses(message)) {
      await this.attachFinancialSummary(user, navKeys, message, tenantId, snapshot);
    }

    return snapshot;
  }

  private async attachFinancialSummary(
    user: JwtUser,
    navKeys: string[],
    message: string,
    tenantId: string,
    snapshot: AssistantLiveSnapshot,
  ): Promise<void> {
    const personal = resolveAssistantRevenueIsPersonal(message, user.role, navKeys);
    const canRevenue = personal
      ? canAssistantQueryPersonalRevenue(navKeys, user.role)
      : canAssistantQueryOrgRevenue(navKeys, user.role);
    const canExpenses = messageAsksForExpenses(message) && canAssistantQueryExpenses(navKeys, user.role);

    if (messageAsksForRevenue(message) && !canRevenue) {
      snapshot.financialAccessDenied = true;
      return;
    }
    if (messageAsksForExpenses(message) && !canExpenses && !messageAsksForRevenue(message)) {
      snapshot.financialAccessDenied = true;
      return;
    }

    const period = resolveAssistantPeriod(message);
    const from = formatLocalYmd(period.start);
    const to = formatLocalYmd(period.end);

    const summary: AssistantFinancialSummary = {
      period,
      scope: personal ? "personal" : "organization",
      revenueByCurrency: [],
      revenueNetTotal: 0,
      revenueGrossTotal: 0,
    };

    if (canRevenue && messageAsksForRevenue(message)) {
      const clinicianId = personal ? user.userId : undefined;
      const totals = await this.revenue.totals(tenantId, from, to, undefined, clinicianId, user);
      summary.revenueByCurrency = totals.byCurrency.map((row) => ({
        currency: row.currency,
        grossTotal: row.grossTotal,
        netTotal: row.netTotal,
      }));
      summary.revenueNetTotal = totals.netTotal;
      summary.revenueGrossTotal = totals.grossTotal;
    }

    if (canExpenses && messageAsksForExpenses(message)) {
      const expenseRows = await this.prisma.expense.groupBy({
        by: ["currency"],
        where: {
          tenantId,
          status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PENDING] },
          incurredAt: { gte: period.start, lte: period.end },
        },
        _sum: { amount: true },
      });
      summary.expenseByCurrency = expenseRows
        .map((r) => ({ currency: r.currency, amount: Number(r._sum.amount ?? 0) }))
        .filter((r) => r.amount !== 0);
      summary.expenseTotal = summary.expenseByCurrency.reduce((s, r) => s + r.amount, 0);
    }

    snapshot.financialSummary = summary;
  }

  private mapClinic(c: ClinicDto): AssistantLiveClinic {
    return {
      id: c.id,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      city: c.city,
      country: c.country,
      kind: c.kind,
      status: c.recordStatus,
      parentNameEn: c.parentNameEn,
    };
  }

  formatClinicListReply(clinics: AssistantLiveClinic[], locale: "en" | "ar", orgName?: string): string {
    if (!clinics.length) {
      return locale === "ar"
        ? "## العيادات\n\n> لا توجد عيادات نشطة ضمن صلاحياتك الحالية."
        : "## Clinics\n\n> There are no active clinics in your current permissions.";
    }
    const header =
      locale === "ar"
        ? `${orgName ? `مؤسسة ${orgName} — ` : ""}${clinics.length} عيادة/فرع نشط`
        : `${orgName ? `${orgName} — ` : ""}${clinics.length} active clinic(s) / branch(es)`;
    const lines = clinics.map((c, i) => {
      const name = locale === "ar" && c.nameAr.trim() ? c.nameAr : c.nameEn;
      const branch =
        c.parentNameEn && locale === "en"
          ? ` (branch of ${c.parentNameEn})`
          : c.parentNameEn && locale === "ar"
            ? ` (فرع)`
            : "";
      return locale === "ar"
        ? `${i + 1}. ${name} — ${c.city}, ${c.country}${branch}`
        : `${i + 1}. ${name} — ${c.city}, ${c.country}${branch} [${c.kind}]`;
    });
    return `${mdHeading(header)}${lines.join("\n")}`;
  }

  formatFinancialReply(snapshot: AssistantLiveSnapshot, locale: "en" | "ar"): string {
    const fin = snapshot.financialSummary;
    if (!fin) return "";
    const org = snapshot.organization?.name ?? "Organization";
    const periodLabel = locale === "ar" ? fin.period.labelAr : fin.period.labelEn;
    const from = formatLocalYmd(fin.period.start);
    const to = formatLocalYmd(fin.period.end);
    const scopeLine =
      fin.scope === "personal"
        ? locale === "ar"
          ? "نطاق الإيراد: إيراداتك السريرية المسندة."
          : "Revenue scope: your attributed clinical revenue."
        : locale === "ar"
          ? "نطاق الإيراد: المؤسسة ضمن صلاحياتك وعياداتك."
          : "Revenue scope: organization totals within your clinic access.";

    const lines: string[] = [];
    const title =
      fin.scope === "personal"
        ? locale === "ar"
          ? `إيراداتك السريرية (${periodLabel}: ${from} → ${to}):`
          : `Your clinical income (${periodLabel}: ${from} → ${to}):`
        : locale === "ar"
          ? `${org} — الإيرادات للفترة (${periodLabel}: ${from} → ${to}):`
          : `${org} — revenue for ${periodLabel} (${from} → ${to}):`;
    const parts: string[] = [mdHeading(title.replace(/:$/, "")), mdCallout(scopeLine)];

    if (fin.revenueByCurrency.length) {
      for (const row of fin.revenueByCurrency) {
        parts.push(
          mdMetric(
            row.currency,
            row.netTotal.toFixed(2),
            row.grossTotal.toFixed(2),
            locale,
          ),
        );
      }
    } else {
      parts.push(locale === "ar" ? "- لا توجد إيرادات مسجلة في هذه الفترة." : "- No posted revenue in this period.");
    }

    if (fin.revenueByCurrency.length && fin.scope === "personal") {
      const totalLine =
        locale === "ar"
          ? `**الإجمالي:** إجمالي **${fin.revenueGrossTotal.toFixed(2)}** · صافي **${fin.revenueNetTotal.toFixed(2)}**`
          : `**Totals:** Gross **${fin.revenueGrossTotal.toFixed(2)}** · Net **${fin.revenueNetTotal.toFixed(2)}**`;
      parts.push(`\n${totalLine}`);
    }

    if (fin.expenseByCurrency?.length) {
      parts.push(`\n## ${locale === "ar" ? "المصروفات" : "Expenses"}`);
      for (const row of fin.expenseByCurrency) {
        parts.push(`- **${row.currency}** — ${row.amount.toFixed(2)}`);
      }
    }

    return parts.join("\n");
  }

  tryDirectDataReply(snapshot: AssistantLiveSnapshot, message: string, locale: "en" | "ar"): string | null {
    if (messageAsksForClinicRevenueBreakdown(message)) return null;
    if (snapshot.financialAccessDenied) {
      return locale === "ar"
        ? "## خارج النطاق\n\n> لا يمكنني عرض الإيرادات أو المصروفات لأنها خارج تبويباتك الحالية."
        : "## Out of scope\n\n> I can't show revenue or expenses — open **My revenue**, **Revenue**, **Reports**, or **Dashboard** first.";
    }

    if (messageAsksForRevenue(message) && snapshot.financialSummary) {
      return this.formatFinancialReply(snapshot, locale);
    }

    if (messageAsksForClinicList(message) && snapshot.clinics) {
      return this.formatClinicListReply(snapshot.clinics, locale, snapshot.organization?.name);
    }

    if (messageAsksForPatientCount(message) && snapshot.patientCount !== undefined) {
      const title = locale === "ar" ? "المرضى النشطون" : "Active patients";
      const scope = locale === "ar" ? "ضمن صلاحياتك" : "Within your access";
      return `${mdHeading(title)}${mdCallout(scope)}- **${snapshot.patientCount}** ${locale === "ar" ? "مريض" : "patients"}`;
    }

    if (messageAsksForOrgUsers(message) && snapshot.organizationUserCount !== undefined) {
      const title = locale === "ar" ? "مستخدمو المؤسسة" : "Organization users";
      return `${mdHeading(title)}- **${snapshot.organizationUserCount}** ${locale === "ar" ? "حساب" : "accounts"}`;
    }

    if (messageAsksForEmployeeCount(message) && snapshot.activeEmployeeCount !== undefined) {
      const org = snapshot.organization?.name;
      const title = locale === "ar" ? "الموظفون النشطون" : "Active employees";
      const scope =
        snapshot.employeeCountScope === "clinic_scope"
          ? locale === "ar"
            ? "ضمن العيادات المسموح لك بإدارتها"
            : "within your assigned clinics"
          : locale === "ar"
            ? "في المؤسسة بأكملها"
            : "across the organization";
      const orgLine = org ? `${mdCallout(org)}` : "";
      return `${mdHeading(title)}${orgLine}> ${scope}\n\n- **${snapshot.activeEmployeeCount}** ${locale === "ar" ? "موظف" : "employees"}`;
    }

    return null;
  }

  async tryPatientLookupReply(
    user: JwtUser,
    navKeys: string[],
    message: string,
    locale: "en" | "ar",
  ): Promise<{ reply: string; actions: AssistantChatActionDto[] } | null> {
    if (!canAssistantSearchPatients(navKeys) || !messageAsksForPatientLookup(message)) return null;
    const tenantId = user.tenantId;
    if (!tenantId) return null;

    const term = extractPatientSearchTerm(message);
    if (term.length < 2) {
      return {
        reply:
          locale === "ar"
            ? "## بحث عن مريض\n\nأخبرني بالاسم أو **MRN** أو الهاتف أو رقم الهوية."
            : "## Patient search\n\nTell me a **name**, **MRN**, phone, national ID, or record id.",
        actions: [],
      };
    }

    const page = await this.patients.listPaginated(
      tenantId,
      { search: term, page: "1", pageSize: String(ASSISTANT_PATIENT_SEARCH_LIMIT) },
      user,
    );
    const rows = page.items;
    const total = page.total ?? rows.length;

    if (!rows.length) {
      return {
        reply:
          locale === "ar"
            ? `## لا توجد نتائج\n\nلا يوجد مريض مطابق لـ **${term}** ضمن صلاحياتك.`
            : `## No matches\n\nNo patients matched **${term}** within your access.`,
        actions: [],
      };
    }

    const actions: AssistantChatActionDto[] = rows.map((p) => {
      const name =
        locale === "ar" && (p.firstNameAr?.trim() || p.lastNameAr?.trim())
          ? `${p.firstNameAr ?? p.firstNameEn} ${p.lastNameAr ?? p.lastNameEn}`.trim()
          : `${p.firstNameEn} ${p.lastNameEn}`.trim();
      const branch = p.homeBranch ? ` · ${p.homeBranch}` : "";
      return {
        type: "open_patient",
        patientId: p.id,
        mrn: p.mrn,
        label: `${name} (${p.mrn})${branch}`,
      };
    });

    let reply: string;
    if (total === 1) {
      reply =
        locale === "ar"
          ? "## مريض واحد\n\nافتح السجل من الزر أدناه."
          : "## One patient\n\nOpen their chart using the button below.";
    } else if (total <= ASSISTANT_PATIENT_SEARCH_LIMIT) {
      reply =
        locale === "ar"
          ? `## ${total} نتائج\n\nاختر السجل الصحيح:`
          : `## ${total} matches\n\nSelect the correct chart:`;
    } else {
      reply =
        locale === "ar"
          ? `## ${ASSISTANT_PATIENT_SEARCH_LIMIT} من ${total}\n\nاختر السجل أو ضيّق البحث في تبويب المرضى.`
          : `## First ${ASSISTANT_PATIENT_SEARCH_LIMIT} of ${total}\n\nPick a chart or refine search in Patients.`;
    }

    return { reply, actions };
  }

  async tryClinicRevenueBreakdownReply(
    user: JwtUser,
    navKeys: string[],
    message: string,
    locale: "en" | "ar",
  ): Promise<string | null> {
    if (!messageAsksForClinicRevenueBreakdown(message)) return null;
    if (!canAssistantQueryOrgRevenue(navKeys, user.role)) {
      return locale === "ar"
        ? "## خارج النطاق\n\n> لا يمكنني عرض إيرادات العيادات — تحتاج تبويب **الإيرادات** أو **التقارير**."
        : "## Out of scope\n\n> I can't show per-clinic revenue — open **Revenue** or **Reports** in your menu.";
    }
    const tenantId = user.tenantId;
    if (!tenantId) return null;
    const period = resolveAssistantPeriod(message);
    const from = formatLocalYmd(period.start);
    const to = formatLocalYmd(period.end);
    const periodLabel = locale === "ar" ? period.labelAr : period.labelEn;
    try {
      const breakdown = await this.revenue.clinicBreakdown(tenantId, from, to, user);
      const items = [...breakdown.items].sort((a, b) => b.netTotal - a.netTotal);
      if (!items.length) {
        return locale === "ar"
          ? `## إيراد العيادات — ${periodLabel}\n\n> لا توجد إيرادات مسجلة في هذه الفترة.`
          : `## Revenue by clinic — ${periodLabel}\n\n> No posted revenue in this period.`;
      }
      const lines = items.map((row) => {
        const name = locale === "ar" && row.nameAr.trim() ? row.nameAr : row.nameEn;
        return `- **${name}** — Net **${row.netTotal.toFixed(2)}** · Gross ${row.grossTotal.toFixed(2)}`;
      });
      const total =
        locale === "ar"
          ? `\n**الإجمالي:** صافي **${breakdown.grandNet.toFixed(2)}** · إجمالي ${breakdown.grandGross.toFixed(2)}`
          : `\n**Total:** Net **${breakdown.grandNet.toFixed(2)}** · Gross ${breakdown.grandGross.toFixed(2)}`;
      const title =
        locale === "ar"
          ? `إيراد كل عيادة — ${periodLabel}`
          : `Revenue per clinic — ${periodLabel}`;
      return `${mdHeading(title)}${mdCallout(`${from} → ${to}`)}${lines.join("\n")}${total}`;
    } catch (e) {
      if (e instanceof ForbiddenException) {
        return locale === "ar"
          ? "## خارج النطاق\n\n> دورك الحالي لا يسمح بعرض تفصيل الإيراد لكل عيادة."
          : "## Out of scope\n\n> Your role cannot view per-clinic revenue breakdown.";
      }
      throw e;
    }
  }

  snapshotForPrompt(snapshot: AssistantLiveSnapshot): string {
    const slim = {
      organization: snapshot.organization,
      role: snapshot.role,
      allowedNavKeys: snapshot.allowedNavKeys,
      clinics: snapshot.clinics?.map((c) => ({
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        city: c.city,
        kind: c.kind,
        parentNameEn: c.parentNameEn,
      })),
      patientCount: snapshot.patientCount,
      organizationUserCount: snapshot.organizationUserCount,
      activeEmployeeCount: snapshot.activeEmployeeCount,
      employeeCountScope: snapshot.employeeCountScope,
      financialSummary: snapshot.financialSummary
        ? {
            periodFrom: formatLocalYmd(snapshot.financialSummary.period.start),
            periodTo: formatLocalYmd(snapshot.financialSummary.period.end),
            scope: snapshot.financialSummary.scope,
            revenueByCurrency: snapshot.financialSummary.revenueByCurrency,
            revenueNetTotal: snapshot.financialSummary.revenueNetTotal,
            revenueGrossTotal: snapshot.financialSummary.revenueGrossTotal,
            expenseByCurrency: snapshot.financialSummary.expenseByCurrency,
          }
        : undefined,
    };
    return JSON.stringify(slim);
  }
}
