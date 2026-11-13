/** Guidance snippets keyed by nav tab — bilingual. */
export const NAV_GUIDANCE: Record<string, { en: string; ar: string }> = {
  admin: {
    en: "Administration: manage clinics, organization users, TRN/VAT under Organization & settings, integrations, and governance.",
    ar: "الإدارة: إدارة العيادات ومستخدمي المؤسسة وضريبة القيمة المضافة/TRN من إعدادات المؤسسة والتكاملات والحوكمة.",
  },
  hr: {
    en: "HR: add employees, provision logins (including physicians and org roles), attendance, and leave.",
    ar: "الموارد البشرية: إضافة الموظفين وحسابات الدخول والحضور والإجازات.",
  },
  patients: {
    en: "Patients: register demographics, documents, and MRN; filter by patient ID in the list.",
    ar: "المرضى: تسجيل البيانات والمستندات ورقم الملف؛ يمكن التصفية برقم المريض.",
  },
  encounters: {
    en: "Encounters: start a visit, document chief complaint, fees, diagnoses, medications, and finalize.",
    ar: "الزيارات: بدء الزيارة وتوثيق الشكوى والرسوم والتشخيصات والأدوية وإنهاء الزيارة.",
  },
  appointments: {
    en: "Appointments: book against clinic hours, assign clinician, check statuses.",
    ar: "المواعيد: الحجز ضمن أوقات العيادة وتعيين الطبيب ومتابعة الحالات.",
  },
  clinics: {
    en: "Clinics & branches: create clinics with specialty, hours, and invoice branding per location.",
    ar: "العيادات والفروع: إنشاء العيادات مع التخصص وساعات العمل وإعدادات الفواتير.",
  },
  revenue: {
    en: "Revenue: record income lines linked to patients and clinics; mind VAT on invoices.",
    ar: "الإيرادات: تسجيل الإيرادات وربطها بالمرضى والعيادات؛ انتبه لضريبة الفواتير.",
  },
  expenses: {
    en: "Expenses: track clinic costs and payroll-linked expenses where configured.",
    ar: "المصروفات: تتبع تكاليف العيادة ومصروفات الرواتب عند التفعيل.",
  },
  reports: {
    en: "Reports: P&L, performance, and patient acquisition analytics.",
    ar: "التقارير: الأرباح والأداء وتحليلات اكتساب المرضى.",
  },
  customer_support: {
    en: "Customer support: tickets tied to audit and integration issues.",
    ar: "دعم العملاء: تذاكر مرتبطة بالتدقيق ومشاكل التكامل.",
  },
  doctor_revenue: {
    en: "My revenue: physician-specific revenue view for your assigned work.",
    ar: "إيراداتي: عرض إيرادات الطبيب للعمل المسند إليك.",
  },
  operations: {
    en: "Operations: surgical/procedure bookings similar to appointments.",
    ar: "العمليات: حجوزات العمليات والإجراءات مثل المواعيد.",
  },
  dashboard: {
    en: "Dashboard: organization overview KPIs.",
    ar: "لوحة المؤسسة: مؤشرات الأداء للمؤسسة.",
  },
};

export const TOPIC_GUIDANCE: Record<string, { en: string; ar: string }> = {
  trn_vat: {
    en: "Set organization-wide TRN and VAT % under Admin → Organization & settings → Save to apply to all clinics.",
    ar: "اضبط TRN ونسبة ضريبة القيمة المضافة من الإدارة → المؤسسة والإعدادات → حفظ لتطبيقها على كل العيادات.",
  },
  invoice: {
    en: "Generate invoices from encounters or operations; tax invoices show TRN, subtotal ex-VAT, VAT line, and total.",
    ar: "أنشئ الفواتير من الزيارات أو العمليات؛ الفواتير الضريبية تعرض TRN والمجموع قبل الضريبة وضريبة القيمة المضافة والإجمالي.",
  },
  ai_scribe: {
    en: "Ambient scribe (Arabic/English visit transcription into draft notes) is on the product roadmap. Use Encounters today to document visits manually.",
    ar: "المساعد السريري الصوتي (تحويل الزيارة بالعربية/الإنجليزية إلى مسودة ملاحظات) في خارطة الطريق. استخدم الزيارات لتوثيق الزيارة حالياً.",
  },
  language: {
    en: "You can switch UI language with the language control in the top bar; I reply in the language you write in.",
    ar: "يمكنك تغيير لغة الواجهة من الشريط العلوي؛ أرد بنفس لغة رسالتك.",
  },
};
