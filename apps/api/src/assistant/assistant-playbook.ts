import { NAV_GUIDANCE, TOPIC_GUIDANCE } from "./assistant-knowledge";
import { navPathForKey } from "./assistant-nav-routes";
import type { AssistantChatActionDto } from "./dto/assistant-chat.dto";

export type PlaybookLocale = "en" | "ar";

export type PlaybookEntry = {
  id: string;
  nav: string[];
  /** Topic patterns (how-to, what is, open/go to). */
  patterns: RegExp[];
  en: { title: string; steps: string[]; navigateLabel?: string };
  ar: { title: string; steps: string[]; navigateLabel?: string };
  /** Primary in-app destination after answering. */
  navigateNavKey?: string;
};

import { EXTENDED_PLAYBOOK } from "./assistant-playbook-entries";

const CORE_PLAYBOOK: PlaybookEntry[] = [
  {
    id: "register_patient",
    nav: ["patients"],
    patterns: [/register (a )?patient|add (a )?patient|new patient|create patient|تسجيل مريض|إضافة مريض/i],
    navigateNavKey: "patients",
    en: {
      title: "Register a patient",
      navigateLabel: "Open Patients",
      steps: [
        "Go to Patients → Add patient (or use the button below).",
        "Enter demographics, phone, and optional national ID.",
        "Set home branch if your role is scoped to clinics.",
        "Save — an MRN is assigned automatically.",
      ],
    },
    ar: {
      title: "تسجيل مريض",
      navigateLabel: "فتح المرضى",
      steps: [
        "من تبويب المرضى → إضافة مريض (أو الزر أدناه).",
        "أدخل البيانات والهاتف ورقم الهوية إن وجد.",
        "اختر الفرع الرئيسي إذا كانت صلاحياتك مقيدة بعيادة.",
        "احفظ — يُعيَّن رقم ملف تلقائياً.",
      ],
    },
  },
  {
    id: "book_appointment",
    nav: ["appointments"],
    patterns: [/book( an)? appointment|schedule (a )?appointment|new appointment|حجز موعد|موعد جديد/i],
    navigateNavKey: "appointments",
    en: {
      title: "Book an appointment",
      navigateLabel: "Open Appointments",
      steps: [
        "Open Appointments → New appointment.",
        "Pick patient, clinic, clinician, and time within clinic hours.",
        "Confirm status (e.g. scheduled).",
      ],
    },
    ar: {
      title: "حجز موعد",
      navigateLabel: "فتح المواعيد",
      steps: ["افتح المواعيد → موعد جديد.", "اختر المريض والعيادة والطبيب والوقت.", "احفظ الحالة."],
    },
  },
  {
    id: "start_encounter",
    nav: ["encounters"],
    patterns: [/start (an )?encounter|new encounter|open (a )?visit|begin visit|بدء زيارة|زيارة جديدة/i],
    navigateNavKey: "encounters",
    en: {
      title: "Start an encounter",
      navigateLabel: "Open Encounters",
      steps: [
        "Open Encounters → New encounter (or start from an appointment).",
        "Link the patient and clinic.",
        "Document chief complaint, fees, clinical notes; finalize when done.",
      ],
    },
    ar: {
      title: "بدء زيارة",
      navigateLabel: "فتح الزيارات",
      steps: ["افتح الزيارات → زيارة جديدة.", "اربط المريض والعيادة.", "وثّق الشكوى والرسوم ثم أنهِ الزيارة."],
    },
  },
  {
    id: "record_revenue",
    nav: ["revenue"],
    patterns: [/record revenue|post revenue|add revenue line|تسجيل إيراد/i],
    navigateNavKey: "revenue",
    en: {
      title: "Record revenue",
      navigateLabel: "Open Revenue",
      steps: [
        "Open Revenue → add or edit lines tied to patient/clinic.",
        "Ensure VAT/TRN settings are correct for tax invoices (Admin → Organization settings).",
        "Post when amounts are final.",
      ],
    },
    ar: {
      title: "تسجيل إيراد",
      navigateLabel: "فتح الإيرادات",
      steps: ["افتح الإيرادات وأضف بنداً مربوطاً بالمريض/العيادة.", "تأكد من TRN وضريبة القيمة المضافة.", "سجّل عند الاعتماد."],
    },
  },
  {
    id: "physician_income",
    nav: ["doctor_revenue"],
    patterns: [/my (revenue|income)|doctor revenue|إيراداتي|دخلي/i],
    navigateNavKey: "doctor_revenue",
    en: {
      title: "View my clinical income",
      navigateLabel: "Open My revenue",
      steps: [
        "Use My revenue for posted income attributed to your encounters.",
        "You can also ask me: “my gross and net income this month” for a summary.",
      ],
    },
    ar: {
      title: "عرض إيراداتي",
      navigateLabel: "فتح إيراداتي",
      steps: ["استخدم إيراداتي للدخل المسجّل من زياراتك.", "اسألني: «صافي وإجمالي دخلي هذا الشهر» للملخص."],
    },
  },
  {
    id: "add_employee",
    nav: ["hr"],
    patterns: [/add (an )?employee|new employee|hire staff|provision login|إضافة موظف|موظف جديد/i],
    navigateNavKey: "hr",
    en: {
      title: "Add an employee",
      navigateLabel: "Open HR",
      steps: [
        "HR → Employees → Add employee.",
        "Fill job title, clinic assignment, and employment type.",
        "Optional: provision login and assign role/nav tabs per policy.",
      ],
    },
    ar: {
      title: "إضافة موظف",
      navigateLabel: "فتح الموارد البشرية",
      steps: ["الموارد البشرية → الموظفون → إضافة.", "أدخل المسمى والعيادة ونوع التوظيف.", "اختياري: إنشاء حساب دخول ودور."],
    },
  },
  {
    id: "org_settings",
    nav: ["admin"],
    patterns: [/organization settings|trn|vat|integration client|org user|إعدادات المؤسسة|مستخدمي المؤسسة/i],
    navigateNavKey: "admin",
    en: {
      title: "Organization administration",
      navigateLabel: "Open Admin",
      steps: [
        "Admin → Clinics & branches, Organization users, Organization & settings (TRN/VAT).",
        "Integration API clients for external booking live under Admin as well.",
      ],
    },
    ar: {
      title: "إدارة المؤسسة",
      navigateLabel: "فتح الإدارة",
      steps: ["الإدارة: العيادات، المستخدمون، الإعدادات (TRN/VAT)، عملاء التكامل."],
    },
  },
  {
    id: "support_ticket",
    nav: ["customer_support"],
    patterns: [/support ticket|open ticket|customer support|تذكرة دعم/i],
    navigateNavKey: "customer_support",
    en: {
      title: "Customer support",
      navigateLabel: "Open Support",
      steps: ["Customer support → New ticket.", "Link audit/integration context if available.", "Update status and timeline notes."],
    },
    ar: {
      title: "دعم العملاء",
      navigateLabel: "فتح الدعم",
      steps: ["دعم العملاء → تذكرة جديدة.", "اربط السياق إن وجد.", "حدّث الحالة والملاحظات."],
    },
  },
  {
    id: "track_expense",
    nav: ["expenses"],
    patterns: [/add expense|record expense|track expense|مصروف جديد|تسجيل مصروف/i],
    navigateNavKey: "expenses",
    en: {
      title: "Track an expense",
      navigateLabel: "Open Expenses",
      steps: [
        "Expenses → add expense with amount, currency, clinic, and incurred date.",
        "Use approval workflow statuses as configured.",
      ],
    },
    ar: {
      title: "تسجيل مصروف",
      navigateLabel: "فتح المصروفات",
      steps: ["المصروفات → إضافة مبلغ وعملة وعيادة وتاريخ.", "اتبع حالات الاعتماد."],
    },
  },
  {
    id: "book_operation",
    nav: ["operations"],
    patterns: [/book operation|schedule (a )?procedure|surgery booking|حجز عملية/i],
    navigateNavKey: "operations",
    en: {
      title: "Book an operation",
      navigateLabel: "Open Operations",
      steps: [
        "Operations → create booking similar to appointments.",
        "Assign patient, clinic, team, and schedule.",
      ],
    },
    ar: {
      title: "حجز عملية",
      navigateLabel: "فتح العمليات",
      steps: ["العمليات → إنشاء حجز مثل المواعيد.", "عيّن المريض والعيادة والجدول."],
    },
  },
  {
    id: "reports_pnl",
    nav: ["reports"],
    patterns: [/p&l|profit and loss|financial report|تقرير الأرباح|تقارير/i],
    navigateNavKey: "reports",
    en: {
      title: "Reports",
      navigateLabel: "Open Reports",
      steps: [
        "Reports → pick period and report type (P&L, performance, acquisition).",
        "Uses posted revenue and approved/pending expenses.",
      ],
    },
    ar: {
      title: "التقارير",
      navigateLabel: "فتح التقارير",
      steps: ["التقارير → اختر الفترة ونوع التقرير.", "تعتمد على الإيرادات المسجلة والمصروفات."],
    },
  },
];

/** Specific patterns first (extended), then core defaults. */
export const PLAYBOOK: PlaybookEntry[] = [...EXTENDED_PLAYBOOK, ...CORE_PLAYBOOK];

const NAV_OPEN_ALIASES: { pattern: RegExp; navKey: string }[] = [
  { pattern: /\bpatient(s)?\b|المرضى/i, navKey: "patients" },
  { pattern: /\bappointment(s)?\b|المواعيد/i, navKey: "appointments" },
  { pattern: /\bencounter(s)?|visit(s)?\b|الزيارات/i, navKey: "encounters" },
  { pattern: /\boperation(s)?\b|العمليات/i, navKey: "operations" },
  { pattern: /\bexpense(s)?\b|المصروفات/i, navKey: "expenses" },
  { pattern: /\brevenue\b|الإيرادات/i, navKey: "revenue" },
  { pattern: /doctor revenue|my revenue|إيراداتي/i, navKey: "doctor_revenue" },
  { pattern: /\bhr\b|employee(s)?\b|الموارد البشرية|الموظفين/i, navKey: "hr" },
  { pattern: /\breport(s)?\b|التقارير/i, navKey: "reports" },
  { pattern: /\badmin\b|الإدارة/i, navKey: "admin" },
  { pattern: /\bclinic(s)?\b|branch(es)?\b|العيادات/i, navKey: "clinics" },
  { pattern: /dashboard|لوحة/i, navKey: "dashboard" },
  { pattern: /support|الدعم/i, navKey: "customer_support" },
  { pattern: /profile|الملف/i, navKey: "profile" },
  { pattern: /platform clinic|عيادات المنصة/i, navKey: "platform_clinics" },
  { pattern: /platform org|منظمات المنصة/i, navKey: "platform_organizations" },
];

export function messageAsksHowTo(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /\b(how (do|can|should) i|how to|steps to|walk me through|guide me)\b/i.test(message) ||
    /(كيف|أريد أن|خطوات|ارشدني|دلّني)/u.test(message) ||
    /\b(add|create|register|book|schedule|start|open|post|record)\b/i.test(m)
  );
}

export function messageRequestsOpenScreen(message: string): boolean {
  return (
    /\b(open|go to|take me to|navigate to|show me the)\b/i.test(message) ||
    /(افتح|اذهب إلى|خذني إلى)/u.test(message)
  );
}

export function formatPlaybookReply(entry: PlaybookEntry, locale: PlaybookLocale): string {
  const pack = entry[locale];
  const lines = [`${pack.title}:`, ...pack.steps.map((s, i) => `${i + 1}. ${s}`)];
  return lines.join("\n");
}

export function navigateActionForNavKey(navKey: string, locale: PlaybookLocale): AssistantChatActionDto | null {
  const href = navPathForKey(navKey);
  if (!href) return null;
  const label =
    locale === "ar"
      ? `فتح ${NAV_GUIDANCE[navKey]?.ar?.split(":")[0] ?? navKey}`
      : `Open ${NAV_GUIDANCE[navKey]?.en?.split(":")[0] ?? navKey.replace(/_/g, " ")}`;
  return { type: "navigate", href, label, navKey };
}

export function findPlaybookMatch(message: string, navKeys: string[]): PlaybookEntry | null {
  for (const entry of PLAYBOOK) {
    if (!entry.nav.some((k) => navKeys.includes(k))) continue;
    if (entry.patterns.some((p) => p.test(message))) return entry;
  }
  return null;
}

export function tryPlaybookReply(
  message: string,
  navKeys: string[],
  locale: PlaybookLocale,
): { reply: string; actions?: AssistantChatActionDto[] } | null {
  const entry = findPlaybookMatch(message, navKeys);
  if (entry) {
    const reply = formatPlaybookReply(entry, locale);
    const navKey = entry.navigateNavKey;
    const act = navKey ? navigateActionForNavKey(navKey, locale) : null;
    if (act && entry[locale].navigateLabel) act.label = entry[locale].navigateLabel!;
    return { reply, actions: act ? [act] : undefined };
  }

  if (!messageRequestsOpenScreen(message)) return null;

  for (const alias of NAV_OPEN_ALIASES) {
    if (!alias.pattern.test(message)) continue;
    if (!navKeys.includes(alias.navKey)) continue;
    const act = navigateActionForNavKey(alias.navKey, locale);
    if (!act) continue;
    const reply =
      locale === "ar"
        ? `يمكنك فتح هذا القسم من الزر أدناه.`
        : `You can open that area in the app using the button below.`;
    return { reply, actions: [act] };
  }
  return null;
}

export function playbookSummaryForPrompt(navKeys: string[], locale: PlaybookLocale): string {
  const lines: string[] = [];
  for (const key of navKeys) {
    const g = NAV_GUIDANCE[key]?.[locale];
    if (g) lines.push(`- ${key}: ${g}`);
  }
  for (const entry of PLAYBOOK) {
    if (!entry.nav.some((k) => navKeys.includes(k))) continue;
    const pack = entry[locale];
    lines.push(`- how-to ${entry.id}: ${pack.steps.join(" → ")}`);
  }
  for (const [topic, copy] of Object.entries(TOPIC_GUIDANCE)) {
    if (topic === "language") lines.push(`- ${topic}: ${copy[locale]}`);
    else if (topic === "trn_vat" && navKeys.includes("admin")) lines.push(`- ${topic}: ${copy[locale]}`);
    else if (topic === "invoice" && (navKeys.includes("encounters") || navKeys.includes("operations")))
      lines.push(`- ${topic}: ${copy[locale]}`);
  }
  return lines.join("\n");
}

const QUICK_PROMPTS: Record<string, { en: string[]; ar: string[] }> = {
  patients: {
    en: ["Find a patient by name or MRN", "How do I register a patient?"],
    ar: ["ابحث عن مريض بالاسم أو MRN", "كيف أسجل مريضاً؟"],
  },
  appointments: { en: ["Book an appointment", "How do I cancel an appointment?"], ar: ["حجز موعد", "كيف ألغي موعداً؟"] },
  encounters: {
    en: ["How do I start an encounter?", "How do I finalize an encounter?"],
    ar: ["كيف أبدأ زيارة؟", "كيف أنهي زيارة؟"],
  },
  operations: { en: ["How do I book an operation?"], ar: ["كيف أحجز عملية؟"] },
  doctor_revenue: { en: ["My gross and net income this month"], ar: ["صافي وإجمالي دخلي هذا الشهر"] },
  revenue: { en: ["Organization revenue this month"], ar: ["إيرادات المؤسسة هذا الشهر"] },
  expenses: { en: ["How do I record an expense?"], ar: ["كيف أسجل مصروفاً؟"] },
  hr: { en: ["How many employees do we have?", "How do I add an employee?"], ar: ["كم عدد الموظفين؟", "كيف أضيف موظفاً؟"] },
  clinics: { en: ["List clinics in this org", "How do I add a clinic?"], ar: ["ما قائمة العيادات؟", "كيف أضيف عيادة؟"] },
  admin: { en: ["What is TRN and VAT used for?", "How do I add an organization user?"], ar: ["ما دور TRN وVAT؟", "كيف أضيف مستخدم مؤسسة؟"] },
  reports: { en: ["Explain P&L reports"], ar: ["اشرح تقرير الأرباح"] },
  dashboard: { en: ["What does the dashboard show?"], ar: ["ماذا تعرض اللوحة؟"] },
  customer_support: { en: ["How do I open a support ticket?"], ar: ["كيف أفتح تذكرة دعم؟"] },
  profile: { en: ["How do I change the UI language?"], ar: ["كيف أغير لغة الواجهة؟"] },
  platform_organizations: { en: ["How do I create a platform organization?"], ar: ["كيف أنشئ منظمة على المنصة؟"] },
  platform_users: { en: ["What are platform users?"], ar: ["ما مستخدمو المنصة؟"] },
  platform_clinics: { en: ["Review platform clinics"], ar: ["مراجعة عيادات المنصة"] },
};

export function quickPromptsForNav(navKeys: string[], locale: PlaybookLocale): string[] {
  const out: string[] = [];
  for (const key of navKeys) {
    const pack = QUICK_PROMPTS[key];
    if (!pack) continue;
    for (const p of pack[locale]) {
      if (!out.includes(p)) out.push(p);
    }
    if (out.length >= 6) break;
  }
  return out.slice(0, 4);
}
