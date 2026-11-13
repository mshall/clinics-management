import { NAV_GUIDANCE, TOPIC_GUIDANCE } from "./assistant-knowledge";
import { QA_EXTENDED } from "./assistant-qa-extended";
import { messageAllowedForNav, requiredNavKeysForMessage } from "./assistant-scope";

export type QaEntry = {
  pattern: RegExp;
  /** User must have at least one of these nav keys; empty = always allowed for signed-in users. */
  nav: string[];
  en: string;
  ar: string;
};

const QA_CORE: QaEntry[] = [
  {
    pattern: /what (is|are) (an? )?encounter|explain encounter|visit workflow|ما هي الزيارة|اشرح الزيارات/i,
    nav: ["encounters"],
    en: "An encounter is a clinical visit record: chief complaint, vitals, diagnoses, medications, fees, and finalization. Draft visits can be edited; finalized visits lock clinical billing fields. You open it from Encounters after linking a patient.",
    ar: "الزيارة هي سجل للزيارة السريرية: الشكوى، العلامات الحيوية، التشخيصات، الأدوية، الرسوم، ثم الإنهاء. المسودات قابلة للتعديل؛ المكتملة تقفل الحقول السريرية والمالية. تبدأها من تبويب الزيارات بعد ربط المريض.",
  },
  {
    pattern: /what (is|are) (an? )?appointment|difference.*appointment.*encounter|الفرق بين الموعد والزيارة|ما هو الموعد/i,
    nav: ["appointments"],
    en: "Appointments schedule when a patient should arrive and which clinician serves them. Encounters document what happened during the visit. A booked appointment often leads to starting an encounter on the day of care.",
    ar: "المواعيد تحدد وقت حضور المريض والطبيب المسؤول. الزيارات توثّق ما حدث أثناء الرعاية. غالباً يُحجز موعد ثم تُفتح زيارة يوم الزيارة.",
  },
  {
    pattern: /what (is|are) (a )?patient|mrn|ما هو المريض|رقم الملف/i,
    nav: ["patients"],
    en: "A patient record stores demographics, identifiers (MRN), documents, and links to appointments, encounters, and billing. Use Patients to search, register, and maintain the chart.",
    ar: "ملف المريض يحتوي على البيانات الديموغرافية ورقم الملف والمستندات وروابط المواعيد والزيارات والفواتير. استخدم المرضى للبحث والتسجيل وتحديث الملف.",
  },
  {
    pattern: /what (is|are) trn|what (is|are) vat|ضريبة القيمة|رقم ضريبي|ما هو trn/i,
    nav: ["admin"],
    en: "TRN is the tax registration number shown on tax invoices; VAT % is applied to taxable lines. Organization admins set both under Admin → Organization & settings; saving pushes defaults to all clinics.",
    ar: "TRN هو رقم التسجيل الضريبي على الفواتير؛ نسبة ضريبة القيمة المضافة تُطبّق على البنود الخاضعة للضريبة. مدير المؤسسة يضبطهما من الإدارة → المؤسسة والإعدادات، والحفظ يطبّق القيم على كل العيادات.",
  },
  {
    pattern: /nav tab|role permission|what can my role|صلاحيات الدور|تبويبات القائمة/i,
    nav: ["admin"],
    en: "Navigation tabs control which menu areas a user sees. Group admins assign per-user tabs and org-wide role defaults; clinic admins can restrict tabs within a role’s baseline. The assistant only discusses areas present in your current menu.",
    ar: "تبويبات القائمة تحدد ما يراه المستخدم في الشريط الجانبي. مدير المؤسسة يخصص تبويبات المستخدم وافتراضيات الدور؛ مدير العيادة يمكنه التقييد ضمن حدود الدور. المساعد يجيب فقط عن المجالات الظاهرة في قائمتك.",
  },
  {
    pattern: /profit|p&l|performance report|ما هو تقرير|تقرير الأرباح/i,
    nav: ["reports"],
    en: "Reports combine posted revenue and approved/pending expenses for a period. P&L shows net by currency; performance and acquisition reports help leadership review clinics and growth.",
    ar: "التقارير تجمع الإيرادات المسجلة والمصروفات المعتمدة/المعلقة للفترة. تقرير الأرباح يبيّن الصافي حسب العملة؛ تقارير الأداء واكتساب المرضى تدعم متابعة العيادات والنمو.",
  },
  {
    pattern: /integration api|webhook|external booking|تكامل api|ويب هوك/i,
    nav: ["admin"],
    en: "Integration clients let external systems book appointments or operations with a bearer token (not staff JWT). Admins create clients, scopes, and optional webhooks under Admin → Integration API clients.",
    ar: "عملاء التكامل يتيحون للأنظمة الخارجية حجز المواعيد أو العمليات برمز bearer وليس JWT الموظفين. يُنشَؤون من الإدارة → عملاء API التكامل مع النطاقات وويب هوك اختياري.",
  },
  {
    pattern: /support ticket|customer support module|تذكرة دعم/i,
    nav: ["customer_support"],
    en: "Customer support tickets track issues, often linked to audit or integration failures. Staff with the customer support tab can open, update status, and add timeline notes.",
    ar: "تذاكر دعم العملاء تتابع المشاكل، وغالباً ترتبط بالتدقيق أو أخطاء التكامل. من لديه تبويب دعم العملاء يمكنه فتح التذكرة وتحديث الحالة وإضافة ملاحظات.",
  },
  {
    pattern: /doctor revenue|my revenue|إيرادات الطبيب|إيراداتي/i,
    nav: ["doctor_revenue"],
    en: "Doctor revenue shows income attributed to your clinical work in allowed clinics. It is read-oriented for physicians and does not replace org-wide revenue reporting.",
    ar: "إيرادات الطبيب تعرض الدخل المنسوب لعملك السريري في العيادات المسموحة. للقراءة للطبيب ولا تغني عن تقارير الإيرادات على مستوى المؤسسة.",
  },
  {
    pattern: /what (is|are) (an? )?expense|how.*expense.*approv|ما هو المصروف/i,
    nav: ["expenses"],
    en: "Expenses track clinic costs with approval status. Finance and clinic roles record lines per clinic and period; payroll-linked expenses may appear when payroll is configured.",
    ar: "المصروفات تتابع التكاليف بحالات اعتماد. تُسجَّل لكل عيادة وفترة؛ قد تظهر مصروفات مرتبطة بالرواتب عند التفعيل.",
  },
  {
    pattern: /dashboard|kpi|overview|مؤشرات|لوحة/i,
    nav: ["dashboard"],
    en: "The organization dashboard summarizes KPIs: patients, encounters, revenue/expenses for the period, branches, and headcount — scoped to your role.",
    ar: "لوحة المؤسسة تلخص المؤشرات: المرضى والزيارات والإيرادات/المصروفات والفروع والموظفين — حسب دورك.",
  },
  {
    pattern: /operation(s)? booking|procedure scheduling|حجز عملية/i,
    nav: ["operations"],
    en: "Operations handles surgical/procedure bookings like appointments, with scheduling and clinical documentation hooks.",
    ar: "العمليات تدير حجوزات الإجراءات والجراحات مثل المواعيد.",
  },
];

/** Conceptual and FAQ answers — permission-checked per entry. */
export const QA_ENTRIES: QaEntry[] = [...QA_CORE, ...QA_EXTENDED];

export function isSmallTalkOrMeta(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|مرحبا|مرحباً|السلام|شكراً|شكرا)\b/u.test(m)) {
    return true;
  }
  return /what can you (do|help)|how can you help|who are you|ما الذي يمكنك|ماذا يمكنك|من أنت/i.test(message);
}

export function composeCapabilityOverview(navKeys: string[], locale: "en" | "ar"): string {
  const areas = navKeys
    .filter((k) => k !== "profile")
    .map((k) => NAV_GUIDANCE[k]?.[locale])
    .filter(Boolean);
  if (!areas.length) {
    return locale === "ar"
      ? "يمكنني الإجابة على أسئلة حول الملف الشخصي وإعدادات حسابك."
      : "I can answer questions about your profile and account settings.";
  }
  const list = areas.map((a) => `- ${a}`).join("\n");
  return locale === "ar"
    ? `## ما يمكنني فعله\n\nأجيب عن «ما هو…» و«كيف…» مع **بيانات حية** وأزرار انتقال ضمن:\n\n${list}`
    : `## What I can help with\n\n**Live data**, how-to steps, and navigation buttons within:\n\n${list}`;
}

export function findQaAnswer(message: string, navKeys: string[], locale: "en" | "ar"): string | null {
  if (!messageAllowedForNav(message, navKeys)) return null;

  for (const entry of QA_ENTRIES) {
    if (!entry.pattern.test(message)) continue;
    if (entry.nav.length && !entry.nav.some((k) => navKeys.includes(k))) continue;
    return entry[locale];
  }

  const m = message.toLowerCase();
  const questionLike =
    /\b(what|why|when|where|how|explain|describe|difference|mean|can i)\b/.test(m) ||
    /(ما|لماذا|متى|أين|كيف|اشرح|وضّح|هل يمكن)/u.test(message);

  if (questionLike) {
    for (const key of navKeys) {
      const g = NAV_GUIDANCE[key];
      if (!g) continue;
      const token = key.replace(/_/g, " ");
      if (m.includes(token) || m.includes(key)) {
        return g[locale];
      }
    }

    const required = requiredNavKeysForMessage(message);
    for (const key of required) {
      if (!navKeys.includes(key)) continue;
      const g = NAV_GUIDANCE[key];
      if (g) return g[locale];
    }

    for (const [topicKey, copy] of Object.entries(TOPIC_GUIDANCE)) {
      if (topicKey === "language") continue;
      if (topicKey === "trn_vat" && !navKeys.includes("admin")) continue;
      if (topicKey === "invoice" && !navKeys.includes("encounters") && !navKeys.includes("operations")) continue;
      if (topicKey === "ai_scribe" && !navKeys.includes("encounters")) continue;
      if (topicKey === "trn_vat" && /trn|vat|tax|ضريبة/.test(m)) return copy[locale];
      if (topicKey === "invoice" && /invoice|فاتورة/.test(m)) return copy[locale];
      if (topicKey === "ai_scribe" && /scribe|ملاحظات|تدوين/.test(m)) return copy[locale];
    }
  }

  return null;
}
