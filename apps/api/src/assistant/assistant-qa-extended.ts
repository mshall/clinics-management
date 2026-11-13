import type { QaEntry } from "./assistant-qa";

export const QA_EXTENDED: QaEntry[] = [
  {
    pattern: /finalize|draft encounter|locked visit|زيارة مسودة|إنهاء/i,
    nav: ["encounters"],
    en: "Draft encounters are editable; finalization locks clinical and billing fields. Reopen policies depend on role — typically admins only after finalize.",
    ar: "مسودات الزيارات قابلة للتعديل؛ الإنهاء يقفل الحقول. إعادة الفتح حسب السياسة وغالباً للإدارة.",
  },
  {
    pattern: /mrn|medical record number|رقم الملف/i,
    nav: ["patients"],
    en: "MRN is the unique patient file number in the tenant (e.g. MRN-10001). It is assigned on registration and used in search and integrations.",
    ar: "رقم الملف معرف فريد للمريض في المؤسسة ويُستخدم في البحث والتكاملات.",
  },
  {
    pattern: /clinic hour|working hour|ساعات العمل/i,
    nav: ["clinics", "admin"],
    en: "Clinic hours constrain appointment booking. Edit under Clinics & branches → clinic detail → hours.",
    ar: "ساعات العيادة تقيد الحجز. تُعدّل من تفاصيل العيادة.",
  },
  {
    pattern: /commission|physician fee|نسبة الطبيب/i,
    nav: ["hr", "doctor_revenue"],
    en: "Physician commission may be stored on the employee record; attributed revenue appears in Doctor revenue from posted encounters.",
    ar: "قد تُخزَّن نسبة الطبيب في سجل الموظف؛ الإيراد المنسوب يظهر في إيراداتي من الزيارات المسجلة.",
  },
  {
    pattern: /acquisition|referral channel|قناة اكتساب/i,
    nav: ["patients", "reports"],
    en: "Patient acquisition channel (social, referral, etc.) is captured on registration and feeds acquisition analytics in Reports.",
    ar: "قناة اكتساب المريض تُسجّل عند التسجيل وتظهر في تحليلات الاكتساب.",
  },
  {
    pattern: /audit|governance|who changed|سجل تدقيق/i,
    nav: ["admin"],
    en: "Audit and governance views (where enabled) show who changed sensitive settings; customer support may link tickets to audit events.",
    ar: "عرض التدقيق يوضح تغييرات الإعدادات الحساسة؛ قد ترتبط التذاكر بأحداث التدقيق.",
  },
  {
    pattern: /soft delete|archive user|archived patient|أرشفة/i,
    nav: ["admin", "patients"],
    en: "Users and patients can be archived (soft delete) rather than destroyed; archived lists are separate tabs where your role allows.",
    ar: "يمكن أرشفة المستخدمين والمرضى؛ قوائم الأرشيف منفصلة حسب الصلاحية.",
  },
  {
    pattern: /what can i do|my permissions|what is my role|ماذا يمكنني|صلاحياتي/i,
    nav: [],
    en: "Your menu tabs define what I can explain and which live data I can show. Ask “what is…” or “how do I…” about any visible module, or use the suggested prompts.",
    ar: "تبويبات قائمتك تحدد ما أستطيع شرحه وعرضه. اسأل عن أي وحدة ظاهرة أو استخدم الاقتراحات.",
  },
];
