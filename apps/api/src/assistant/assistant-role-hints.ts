import type { AssistantRoleSlug } from "./assistant-access";

export const ROLE_OPERATION_HINTS: Record<AssistantRoleSlug, { en: string; ar: string }> = {
  platform_super_admin: {
    en: "You manage tenants (organizations), platform users, and cross-tenant clinics. No clinical org data unless impersonating.",
    ar: "تدير المستأجرين ومستخدمي المنصة وعيادات المنصة.",
  },
  group_admin: {
    en: "Full org: clinics, users, TRN/VAT, integrations, HR, finance, clinical modules, governance, support.",
    ar: "صلاحيات كاملة للمؤسسة: عيادات، مستخدمون، ضرائب، تكاملات، موارد بشرية، مالية، سريري، حوكمة.",
  },
  group_supervisor: {
    en: "Oversight: dashboard, clinical flows, revenue/reports, support; limited direct HR edits.",
    ar: "إشراف: لوحة، مسارات سريرية، إيرادات وتقارير، دعم.",
  },
  branch_manager: {
    en: "Branch-wide patients, finance, HR, clinics, admin within grants.",
    ar: "إدارة فرع: مرضى، مالية، موارد بشرية، عيادات.",
  },
  finance_officer: {
    en: "Revenue, expenses, reports, invoices context; not clinical documentation.",
    ar: "إيرادات، مصروفات، تقارير، سياق الفواتير.",
  },
  hr_officer: {
    en: "Employees, provisioning, attendance, leave; employee headcount Q&A.",
    ar: "موظفون، حسابات، حضور، إجازات، عدد الموظفين.",
  },
  clinic_admin: {
    en: "Local clinic operations: schedule, encounters, staff, revenue, clinic settings.",
    ar: "تشغيل العيادة: مواعيد، زيارات، موظفون، إيرادات، إعدادات.",
  },
  clinic_assistant: {
    en: "Front desk: patients, appointments, encounters, basic revenue/expenses.",
    ar: "استقبال: مرضى، مواعيد، زيارات، إيرادات/مصروفات أساسية.",
  },
  physician: {
    en: "Clinical: patients, appointments, encounters, operations; personal income via Doctor revenue; not org-wide ledger unless explicit.",
    ar: "سريري: مرضى، مواعيد، زيارات؛ دخل شخصي من إيراداتي.",
  },
  nurse: {
    en: "Support clinical flow: patients, appointments, encounters; no finance admin.",
    ar: "دعم سريري: مرضى، مواعيد، زيارات.",
  },
  receptionist: {
    en: "Registration, scheduling, encounters, operations booking.",
    ar: "تسجيل، حجز، زيارات، عمليات.",
  },
  call_center: {
    en: "Remote booking: patient lookup, appointments, support tickets.",
    ar: "حجز عن بعد: بحث مريض، مواعيد، تذاكر دعم.",
  },
};
