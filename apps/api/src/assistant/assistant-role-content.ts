import { UserRole } from "@prisma/client";
import type { AssistantRoleSlug } from "./assistant-access";

type LocaleCopy = { title: string; greeting: string; prompts: string[] };

const BY_ROLE: Record<UserRole, { en: LocaleCopy; ar: LocaleCopy }> = {
  [UserRole.PLATFORM_SUPER_ADMIN]: {
    en: {
      title: "Platform assistant",
      greeting: "Hi — I help with platform organizations, users, and clinics within your platform permissions.",
      prompts: ["List platform organizations", "Manage platform users", "Review platform clinics"],
    },
    ar: {
      title: "مساعد المنصة",
      greeting: "مرحباً — أساعدك في منظمات المنصة والمستخدمين والعيادات ضمن صلاحيات المنصة.",
      prompts: ["عرض منظمات المنصة", "إدارة مستخدمي المنصة", "مراجعة عيادات المنصة"],
    },
  },
  [UserRole.GROUP_ADMIN]: {
    en: {
      title: "Organization admin assistant",
      greeting: "Hi — I guide you through clinics, users, settings, and governance within your permissions.",
      prompts: ["Set organization TRN and VAT", "Add a clinic", "User roles and nav permissions", "Review integrations"],
    },
    ar: {
      title: "مساعد مدير المؤسسة",
      greeting: "مرحباً — أرشدك في العيادات والمستخدمين والإعدادات والحوكمة حسب صلاحياتك.",
      prompts: ["ضبط TRN وضريبة القيمة المضافة", "إضافة عيادة", "صلاحيات المستخدمين", "مراجعة التكاملات"],
    },
  },
  [UserRole.GROUP_SUPERVISOR]: {
    en: {
      title: "Supervisor assistant",
      greeting: "Hi — I help with oversight dashboards, clinical flows, revenue, and support within your grants.",
      prompts: ["Review organization dashboard", "Patient and encounter workflows", "Revenue overview", "Support tickets"],
    },
    ar: {
      title: "مساعد المشرف",
      greeting: "مرحباً — أساعدك في لوحة المتابعة والمسارات السريرية والإيرادات والدعم ضمن صلاحياتك.",
      prompts: ["لوحة المؤسسة", "مسار المرضى والزيارات", "نظرة على الإيرادات", "تذاكر الدعم"],
    },
  },
  [UserRole.BRANCH_MANAGER]: {
    en: {
      title: "Branch manager assistant",
      greeting: "Hi — I help with branch operations: patients, finance, HR, and admin within your tab grants.",
      prompts: ["Branch revenue and expenses", "Staff and HR", "Clinic operations", "Reports"],
    },
    ar: {
      title: "مساعد مدير الفرع",
      greeting: "مرحباً — أساعدك في عمليات الفرع: المرضى والمالية والموارد البشرية والإدارة.",
      prompts: ["إيرادات ومصروفات الفرع", "الموظفون والموارد البشرية", "عمليات العيادة", "التقارير"],
    },
  },
  [UserRole.FINANCE_OFFICER]: {
    en: {
      title: "Finance assistant",
      greeting: "Hi — I help with revenue, expenses, invoices, and reports within your permissions.",
      prompts: ["Record revenue", "Track expenses", "Tax invoices and VAT lines", "Financial reports"],
    },
    ar: {
      title: "مساعد المالية",
      greeting: "مرحباً — أساعدك في الإيرادات والمصروفات والفواتير والتقارير ضمن صلاحياتك.",
      prompts: ["تسجيل الإيرادات", "متابعة المصروفات", "الفواتير الضريبية", "التقارير المالية"],
    },
  },
  [UserRole.HR_OFFICER]: {
    en: {
      title: "HR assistant",
      greeting: "Hi — I help with employees, provisioning logins, attendance, and leave within HR access.",
      prompts: ["Add an employee", "Provision a user login", "Attendance and leave", "HR policies"],
    },
    ar: {
      title: "مساعد الموارد البشرية",
      greeting: "مرحباً — أساعدك في الموظفين وحسابات الدخول والحضور والإجازات.",
      prompts: ["إضافة موظف", "إنشاء حساب مستخدم", "الحضور والإجازات", "سياسات الموارد البشرية"],
    },
  },
  [UserRole.CLINIC_ADMIN]: {
    en: {
      title: "Clinic admin assistant",
      greeting: "Hi — I help run your clinic: scheduling, encounters, staff, and local admin settings.",
      prompts: ["Clinic appointments", "Encounters workflow", "Local users and nav tabs", "Clinic revenue"],
    },
    ar: {
      title: "مساعد إدارة العيادة",
      greeting: "مرحباً — أساعدك في تشغيل العيادة: المواعيد والزيارات والموظفين والإعدادات.",
      prompts: ["مواعيد العيادة", "مسار الزيارات", "المستخدمون والتبويبات", "إيرادات العيادة"],
    },
  },
  [UserRole.CLINIC_ASSISTANT]: {
    en: {
      title: "Clinic assistant",
      greeting: "Hi — I help with front-desk tasks: patients, appointments, encounters, and billing you can access.",
      prompts: ["Register a patient", "Book an appointment", "Start an encounter", "Revenue entry"],
    },
    ar: {
      title: "مساعد العيادة",
      greeting: "مرحباً — أساعدك في الاستقبال: المرضى والمواعيد والزيارات والفوترة المتاحة لك.",
      prompts: ["تسجيل مريض", "حجز موعد", "بدء زيارة", "إدخال إيراد"],
    },
  },
  [UserRole.PHYSICIAN]: {
    en: {
      title: "Physician assistant",
      greeting: "Hi — I help with patients, appointments, encounters, and your revenue within your permissions.",
      prompts: ["Start a new encounter", "My appointments", "Tax invoices for patients", "Clinical documentation tips"],
    },
    ar: {
      title: "مساعد الطبيب",
      greeting: "مرحباً — أساعدك في المرضى والمواعيد والزيارات وإيراداتك ضمن صلاحياتك.",
      prompts: ["بدء زيارة جديدة", "مواعيدي", "الفواتير الضريبية للمرضى", "توثيق سريري"],
    },
  },
  [UserRole.NURSE]: {
    en: {
      title: "Nursing assistant",
      greeting: "Hi — I help with patients, appointments, and encounters within your nursing permissions.",
      prompts: ["Patient lookup", "Today's appointments", "Encounter checklist", "Switch UI language"],
    },
    ar: {
      title: "مساعد التمريض",
      greeting: "مرحباً — أساعدك في المرضى والمواعيد والزيارات ضمن صلاحيات التمريض.",
      prompts: ["البحث عن مريض", "مواعيد اليوم", "قائمة الزيارة", "تغيير لغة الواجهة"],
    },
  },
  [UserRole.RECEPTIONIST]: {
    en: {
      title: "Reception assistant",
      greeting: "Hi — I help with registration, scheduling, encounters, and operations you can access.",
      prompts: ["Register a patient", "Book an appointment", "Check-in and encounters", "Operations booking"],
    },
    ar: {
      title: "مساعد الاستقبال",
      greeting: "مرحباً — أساعدك في التسجيل والحجز والزيارات والعمليات المتاحة لك.",
      prompts: ["تسجيل مريض", "حجز موعد", "الزيارات والاستقبال", "حجز عمليات"],
    },
  },
  [UserRole.CALL_CENTER]: {
    en: {
      title: "Call center assistant",
      greeting: "Hi — I help with patient lookup, appointments, and support tickets within your role.",
      prompts: ["Find a patient", "Schedule an appointment", "Open a support ticket", "Appointment statuses"],
    },
    ar: {
      title: "مساعد مركز الاتصال",
      greeting: "مرحباً — أساعدك في المرضى والمواعيد وتذاكر الدعم ضمن صلاحياتك.",
      prompts: ["البحث عن مريض", "حجز موعد", "فتح تذكرة دعم", "حالات المواعيد"],
    },
  },
};

const FALLBACK = BY_ROLE[UserRole.RECEPTIONIST];

export function roleAssistantContent(
  role: UserRole,
  locale: "en" | "ar",
  _allowedNavKeys: string[],
): { title: string; greeting: string; suggestedPrompts: string[] } {
  const pack = BY_ROLE[role] ?? FALLBACK;
  const copy = pack[locale];
  return { title: copy.title, greeting: copy.greeting, suggestedPrompts: copy.prompts.slice(0, 4) };
}

export function assistantSystemPersonaLabel(roleSlug: AssistantRoleSlug, locale: "en" | "ar"): string {
  const role = roleSlug.toUpperCase() as UserRole;
  const title = (BY_ROLE[role] ?? FALLBACK)[locale].title;
  return title;
}
