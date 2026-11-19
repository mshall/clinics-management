import type { GuideSection, GuideStep, GuideVisualKind } from "@/features/guide/guide-types";
import type { NavItemKey } from "@/lib/nav-policy";
import { NAV_ITEM_PATH } from "@/lib/nav-policy";

function sec(
  id: string,
  titleEn: string,
  titleAr: string,
  summaryEn: string,
  summaryAr: string,
  steps: GuideStep[],
  visualDefault: GuideVisualKind,
): GuideSection {
  return {
    id,
    featured: true,
    titleEn,
    titleAr,
    summaryEn,
    summaryAr,
    steps: steps.map((st) => ({ visual: visualDefault, ...st })),
  };
}

function st(
  titleEn: string,
  titleAr: string,
  bodyEn: string,
  bodyAr: string,
  detailEn: string,
  detailAr: string,
  path?: string,
): GuideStep {
  return { titleEn, titleAr, bodyEn, bodyAr, detailEn, detailAr, path };
}

const PATIENTS = sec(
  "feature-patients",
  "Patients module — full walkthrough",
  "وحدة المرضى — دليل كامل",
  "Register, search, chart review, and family links.",
  "التسجيل، البحث، مراجعة الملف، وروابط العائلة.",
  [
    st(
      "Open the patient registry",
      "افتح سجل المرضى",
      "Go to Patients in the sidebar or press ⌘K / Ctrl+K and search by MRN or phone.",
      "انتقل إلى المرضى من القائمة أو اضغط ⌘K / Ctrl+K وابحث برقم الملف أو الهاتف.",
      "The list respects your clinic scope. Use column filters for quick triage. Archived patients stay searchable for admins.",
      "القائمة تحترم نطاق عيادتك. استخدم الفلاتر للفرز السريع. المرضى المؤرشفون يبقون قابلين للبحث للمسؤولين.",
      NAV_ITEM_PATH.patients,
    ),
    st(
      "Register a new patient",
      "تسجيل مريض جديد",
      "Click Register and complete English/Arabic name, phone, national ID, home branch, and acquisition channel.",
      "اضغط تسجيل وأكمل الاسم بالإنجليزية والعربية والهاتف والرقم القومي والفرع وقناة الاكتساب.",
      "Home branch drives default clinic context for appointments. Acquisition channel feeds marketing reports.",
      "الفرع الرئيسي يحدد سياق العيادة الافتراضي للمواعيد. قناة الاكتساب تغذي تقارير التسويق.",
      NAV_ITEM_PATH.patients,
    ),
    st(
      "Patient chart & 360 summary",
      "ملف المريض والملخص 360",
      "Open a row to see summary, operations, encounters, documents, and outstanding balance by currency.",
      "افتح الصف لترى الملخص والعمليات والزيارات والمستندات والرصيد المستحق حسب العملة.",
      "Header badges show allergies, VIP, chaperone, and balance hints on related screens.",
      "شارات الرأس تعرض الحساسية وVIP والمرافق وتلميحات الرصيد في الشاشات المرتبطة.",
      NAV_ITEM_PATH.patients,
    ),
    st(
      "Documents & clinical photos",
      "المستندات والصور السريرية",
      "Attach IDs, consents, and clinical photos from the patient header gallery.",
      "أرفق الهوية والموافقات والصور السريرية من معرض الرأس في ملف المريض.",
      "Photos are role-gated; clinicians see clinical imagery, front desk sees administrative documents.",
      "الصور محمية بالأدوار؛ الأطباء يرون الصور السريرية والاستقبال يرى المستندات الإدارية.",
      NAV_ITEM_PATH.patients,
    ),
  ],
  "chart",
);

const APPOINTMENTS = sec(
  "feature-appointments",
  "Appointments & front desk",
  "المواعيد ومكتب الاستقبال",
  "Schedule, check in, board, and waiting room.",
  "الجدولة، تسجيل الوصول، اللوحة، وغرفة الانتظار.",
  [
    st(
      "Create an appointment",
      "إنشاء موعد",
      "Appointments → New: clinic, patient, physician, slot, fee, and appointment type when configured.",
      "المواعيد → جديد: العيادة، المريض، الطبيب، الموعد، الرسوم، ونوع الموعد عند التفعيل.",
      "Fees can post at check-in. Deposit rules apply when the patient has repeat no-shows.",
      "يمكن تحصيل الرسوم عند الوصول. قواعد العربون تُطبق عند تكرار عدم الحضور.",
      NAV_ITEM_PATH.appointments,
    ),
    st(
      "Front desk board",
      "لوحة الاستقبال",
      "Open Front desk board for live queue, ticket numbers, rooms, and stage progression.",
      "افتح لوحة الاستقبال للطابور المباشر وأرقام التذاكر والغرف وتقدم المراحل.",
      "Display the waiting-room view on a TV; staff drag cards or use quick actions from the appointment.",
      "اعرض شاشة غرفة الانتظار على التلفزيون؛ اسحب البطاقات أو استخدم إجراءات سريعة من الموعد.",
      "/front-desk/board",
    ),
    st(
      "Quick check-in & payment",
      "تسجيل وصول سريع ودفع",
      "From the appointment: Quick check-in sets CHECKED_IN, prints queue ticket, assigns room, and can collect visit fee.",
      "من الموعد: تسجيل الوصول السريع يضبط CHECKED_IN ويطبع التذكرة ويعين الغرفة وقد يحصّل رسوم الزيارة.",
      "InstaPay/Fawry transfers need reference IDs; cash posts immediately to revenue.",
      "تحويلات إنستاباي/فوري تحتاج مرجعاً؛ النقد يُسجّل فوراً في الإيرادات.",
      NAV_ITEM_PATH.appointments,
    ),
    st(
      "Start visit → encounter",
      "بدء الزيارة → ملف سريري",
      "When the physician is ready, start visit links the appointment to a draft encounter.",
      "عند جاهزية الطبيب، ابدأ الزيارة لربط الموعد بزيارة مسودة.",
      "Nurses can prep vitals on the encounter before the physician finalizes.",
      "يمكن للتمريض إدخال العلامات الحيوية قبل اعتماد الطبيب.",
      NAV_ITEM_PATH.encounters,
    ),
  ],
  "board",
);

const ENCOUNTERS = sec(
  "feature-encounters",
  "Encounters (clinical visits)",
  "الزيارات السريرية",
  "SOAP, diagnoses, meds, finalize, and amend.",
  "SOAP، التشخيصات، الأدوية، الاعتماد، والتعديل.",
  [
    st(
      "Open or continue draft",
      "افتح أو تابع المسودة",
      "Encounters list shows draft, amended, and finalized visits. Open a draft to continue documentation.",
      "قائمة الزيارات تعرض المسودات والمعدّلة والمعتمدة. افتح مسودة لمتابعة التوثيق.",
      "Only assigned physicians edit their encounters unless your role has broader access.",
      "الطبيب المعيّن فقط يحرر زياراته ما لم يمنح دورك صلاحية أوسع.",
      NAV_ITEM_PATH.encounters,
    ),
    st(
      "SOAP & ICD diagnoses",
      "SOAP وتشخيصات ICD",
      "Document subjective/objective/assessment/plan; pick ICD-10 codes with English and Arabic labels.",
      "وثّق SOAP؛ اختر أكواد ICD-10 بالإنجليزية والعربية.",
      "Clinical templates per specialty speed repetitive notes; pick a template from the toolbar.",
      "قوالب التخصصات تسرّع الملاحظات المتكررة؛ اختر قالباً من شريط الأدوات.",
      NAV_ITEM_PATH.encounters,
    ),
    st(
      "Medications & interaction checks",
      "الأدوية وفحص التفاعلات",
      "Add prescriptions with dosage and frequency; interaction alerts surface against documented allergies.",
      "أضف الوصفات بالجرعة والتكرار؛ تنبيهات التفاعل تظهر مقابل الحساسية المسجّلة.",
      "Finalize locks the chart; use Amend for controlled post-visit corrections.",
      "الاعتماد يقفل الملف؛ استخدم التعديل للتصحيحات المنضبطة بعد الزيارة.",
      NAV_ITEM_PATH.encounters,
    ),
    st(
      "Visit fee & balance",
      "رسوم الزيارة والرصيد",
      "Adjust visit fee if needed; collect remaining balance before discharge when receivable exists.",
      "عدّل رسوم الزيارة عند الحاجة؛ حصّل المتبقي قبل الخروج عند وجود مستحق.",
      "Balance currency follows clinic/org settings, shown on the encounter detail panel.",
      "عملة الرصيد تتبع إعدادات العيادة/المنظمة وتظهر في تفاصيل الزيارة.",
      NAV_ITEM_PATH.encounters,
    ),
  ],
  "clinical",
);

const OPERATIONS = sec(
  "feature-operations",
  "Operations (surgical bookings)",
  "العمليات (حجوزات جراحية)",
  "Book, fees, stages, and discharge rules.",
  "الحجز، الرسوم، المراحل، وقواعد الخروج.",
  [
    st(
      "Book without fees (call center)",
      "حجز بدون رسوم (مركز اتصال)",
      "Call center can schedule surgeon, date, and documents without entering payment amounts.",
      "مركز الاتصال يستطيع جدولة الطبيب والتاريخ والمستندات دون إدخال مبالغ.",
      "Finance or admin later adds total cost and down payment; money fields stay hidden for call center.",
      "المالية أو الإدارة تضيف التكلفة والدفعة لاحقاً؛ حقول المال مخفية لمركز الاتصال.",
      NAV_ITEM_PATH.operations,
    ),
    st(
      "Record down payment",
      "تسجيل دفعة مقدمة",
      "Staff with finance permissions enter total and down payment on create or edit.",
      "الموظفون المخوّلون مالياً يدخلون الإجمالي والدفعة عند الإنشاء أو التعديل.",
      "You cannot move to In progress until down payment is greater than zero.",
      "لا يمكن الانتقال إلى «قيد التنفيذ» دون دفعة مقدمة أكبر من صفر.",
      NAV_ITEM_PATH.operations,
    ),
    st(
      "Stage pipeline",
      "مسار المراحل",
      "Advance one stage at a time: Booked → Pre-op → In progress → Recovery → Discharged.",
      "تقدّم مرحلة واحدة في كل مرة: محجوز → ما قبل العملية → قيد التنفيذ → تعافي → خروج.",
      "Discharge requires full fee recorded and remaining balance collected.",
      "الخروج يتطلب تسجيل الرسوم الكاملة وتحصيل المتبقي.",
      NAV_ITEM_PATH.operations,
    ),
    st(
      "Who sees operation money",
      "من يرى أموال العمليات",
      "Group admin, supervisor, clinic admin, finance, and the assigned surgeon see amounts; others see clinical details only.",
      "مدير المنظمة والمشرف ومدير العيادة والمالية والجراح المعيّن يرون المبالغ؛ الباقي يرى التفاصيل السريرية فقط.",
      "Use Operations filters by status and clinic to audit open balances.",
      "استخدم فلاتر العمليات حسب الحالة والعيادة لمراجعة الأرصدة المفتوحة.",
      NAV_ITEM_PATH.operations,
    ),
  ],
  "operations",
);

const REVENUE = sec(
  "feature-revenue",
  "Revenue ledger",
  "دفتر الإيرادات",
  "Posted collections and receivables.",
  "التحصيلات المسجّلة والمستحقات.",
  [
    st(
      "Posted vs receivable",
      "المسجّل مقابل المستحق",
      "Posted rows reflect collected money; receivable rows are outstanding until paid.",
      "الصفوف المسجّلة تعكس المبالغ المحصّلة؛ المستحق بقي غير مدفوع.",
      "Revenue totals in reports include posted amounts only for the selected period.",
      "مجاميع الإيراد في التقارير تشمل المسجّل فقط للفترة المختارة.",
      NAV_ITEM_PATH.revenue,
    ),
    st(
      "Outstanding balances panel",
      "لوحة الأرصدة المستحقة",
      "Use Revenue → Outstanding balances to collect visit or operation remainders.",
      "استخدم الإيرادات → الأرصدة المستحقة لتحصيل متبقي الزيارة أو العملية.",
      "Each row shows patient, currency, and clinic for cashier follow-up.",
      "كل صف يعرض المريض والعملة والعيادة لمتابعة الصندوق.",
      NAV_ITEM_PATH.revenue,
    ),
    st(
      "Taxes are yours to file",
      "الضرائب مسؤوليتك",
      "Kiorly prints payment records and invoices with your configured VAT line and exports CSV/PDF for your accountant. It never reports to a tax authority.",
      "تطبع Kiorly سجلات الدفع والفواتير بسطر ضريبة القيمة المضافة المُعدّ وتصدّر CSV/PDF لمحاسبك، ولا تُبلّغ أي جهة ضريبية.",
      "You and your accountant file your own taxes with your own systems. See Docs: No tax-authority reporting.",
      "أنت ومحاسبك تقدّمان إقراراتكما الضريبية بأنظمتكما. راجع الوثيقة: لا إبلاغ للجهات الضريبية.",
      NAV_ITEM_PATH.revenue,
    ),
  ],
  "payment",
);

const EXPENSES = sec(
  "feature-expenses",
  "Expenses",
  "المصروفات",
  "Clinic opex and approvals.",
  "نفقات العيادة والموافقات.",
  [
    st(
      "Create expense",
      "إنشاء مصروف",
      "Expenses → New: category, amount, clinic, attachments, and approval flow when required.",
      "المصروفات → جديد: الفئة، المبلغ، العيادة، المرفقات، وسير الموافقة عند الحاجة.",
      "Payroll lines from HR may auto-create monthly expense rows.",
      "بنود الرواتب من الموارد البشرية قد تنشئ مصروفات شهرية تلقائياً.",
      NAV_ITEM_PATH.expenses,
    ),
    st(
      "Approval states",
      "حالات الموافقة",
      "Track draft, submitted, approved, and paid; finance officers reconcile against bank.",
      "تتبع المسودة والمقدّم والمعتمد والمدفوع؛ المالية تطابق مع البنك.",
      "P&L reports pull approved expenses for the header date range.",
      "تقارير الأرباح والخسائر تسحب المصروفات المعتمدة لنطاق التاريخ في الرأس.",
      NAV_ITEM_PATH.expenses,
    ),
  ],
  "payment",
);

const REPORTS = sec(
  "feature-reports",
  "Reports & analytics",
  "التقارير والتحليلات",
  "P&L, performance, and acquisition.",
  "الأرباح والأداء والاكتساب.",
  [
    st(
      "Set reporting period",
      "تعيين فترة التقرير",
      "Use the global date range in the header; all report widgets honor the same window.",
      "استخدم نطاق التاريخ العام في الرأس؛ كل عناصر التقرير تحترم نفس الفترة.",
      "Compare clinics side by side when you have organization-wide access.",
      "قارن العيادات جنباً إلى جنب عند امتلاك صلاحية على مستوى المنظمة.",
      NAV_ITEM_PATH.reports,
    ),
    st(
      "Profit & loss",
      "الأرباح والخسائر",
      "Revenue minus expenses by currency with clinic drill-down.",
      "الإيرادات ناقص المصروفات حسب العملة مع تفصيل العيادة.",
      "Export or screenshot for board packs; totals exclude open receivables.",
      "صدّر أو التقط صورة للمجالس؛ المجاميع تستثني المستحقات المفتوحة.",
      NAV_ITEM_PATH.reports,
    ),
    st(
      "Patient acquisition",
      "اكتساب المرضى",
      "See new patients by channel and campaign tags captured at registration.",
      "شاهد المرضى الجدد حسب القناة ووسوم الحملة المسجّلة عند التسجيل.",
      "Cross-check with marketing spend in expenses for ROI conversations.",
      "قارن مع إنفاق التسويق في المصروفات لحساب العائد.",
      NAV_ITEM_PATH.reports,
    ),
  ],
  "reports",
);

const ADMIN = sec(
  "feature-admin",
  "Administration",
  "الإدارة",
  "Users, RBAC, settings, governance.",
  "المستخدمون، الصلاحيات، الإعدادات، الحوكمة.",
  [
    st(
      "Organization users",
      "مستخدمو المنظمة",
      "Invite users, set roles, assign clinics, and open Permissions tab for extra sidebar modules.",
      "ادعُ المستخدمين، عيّن الأدوار والعيادات، وافتح تبويب الصلاحيات لوحدات إضافية.",
      "Upgrade/downgrade role from Account tab; customize per-user tabs without changing role.",
      "ارفع/خفض الدور من تبويب الحساب؛ خصّص تبويبات المستخدم دون تغيير الدور.",
      NAV_ITEM_PATH.admin,
    ),
    st(
      "Role-based access (RBAC)",
      "الصلاحيات حسب الدور",
      "Set defaults per role, then grant extras (e.g. HR, Revenue) to individuals.",
      "اضبط الافتراضي لكل دور ثم امنح إضافات (مثل الموارد البشرية أو الإيرادات) لأفراد.",
      "Clinic HR assignment is required when enabling HR tab for non-HR officers.",
      "تعيين موارد بشرية للعيادة مطلوب عند تفعيل تبويب HR لغير مسؤول HR.",
      NAV_ITEM_PATH.admin,
    ),
    st(
      "Governance & audit",
      "الحوكمة والتدقيق",
      "Filter audit logs by actor, resource, and date for compliance reviews.",
      "رشّح سجل التدقيق حسب الفاعل والمورد والتاريخ لمراجعات الامتثال.",
      "Integration clients and API keys are managed under Organization settings.",
      "عملاء التكامل ومفاتيح API تُدار ضمن إعدادات المنظمة.",
      NAV_ITEM_PATH.admin,
    ),
  ],
  "admin",
);

const HR = sec(
  "feature-hr",
  "Human resources",
  "الموارد البشرية",
  "Employees, hiring, payroll context.",
  "الموظفون، التوظيف، وسياق الرواتب.",
  [
    st(
      "Employee records",
      "سجلات الموظفين",
      "Maintain demographics, clinics, specialties, and documents.",
      "حافظ على البيانات والعيادات والتخصصات والمستندات.",
      "Link login accounts to employees for salary and provisioning.",
      "اربط حسابات الدخول بالموظفين للرواتب والتجهيز.",
      NAV_ITEM_PATH.hr,
    ),
    st(
      "Provision login",
      "تجهيز حساب دخول",
      "HR creates credentials within assignable roles; cannot create group admins.",
      "الموارد البشرية تنشئ بيانات الدخول ضمن الأدوار المسموحة؛ لا يمكن إنشاء مدير منظمة.",
      "Physicians with open bookings cannot be deactivated until resolved.",
      "لا يمكن تعطيل الأطباء ذوي الحجوزات المفتوحة حتى تُحل.",
      NAV_ITEM_PATH.hr,
    ),
  ],
  "admin",
);

const CLINICS = sec(
  "feature-clinics",
  "Clinics & branches",
  "العيادات والفروع",
  "Settings, templates.",
  "الإعدادات، القوالب.",
  [
    st(
      "Branch settings",
      "إعدادات الفرع",
      "Hours, TRN, invoice branding, room labels, and visit fee defaults.",
      "الأوقات، الرقم الضريبي، علامة الفاتورة، تسميات الغرف، ورسوم الزيارة الافتراضية.",
      "Clinical custom templates are added per clinic for physicians.",
      "قوالب سريرية مخصصة تُضاف لكل عيادة للأطباء.",
      NAV_ITEM_PATH.clinics,
    ),
    st(
      "Printed payment records",
      "سجلات الدفع المطبوعة",
      "Payment slips and invoices are the clinic's own records with your configured VAT line; export CSV/PDF for your accountant.",
      "قسائم الدفع والفواتير سجلات العيادة الخاصة بسطر ضريبة القيمة المضافة المُعدّ؛ صدّر CSV/PDF لمحاسبك.",
      "Kiorly never reports to a tax authority; you file your own taxes.",
      "لا تُبلّغ Kiorly أي جهة ضريبية؛ تقدّم إقراراتك بنفسك.",
      NAV_ITEM_PATH.clinics,
    ),
  ],
  "navigate",
);

const CUSTOMER_SUPPORT = sec(
  "feature-customer-support",
  "Customer support",
  "دعم العملاء",
  "Tickets and patient issues.",
  "التذاكر ومشاكل المرضى.",
  [
    st(
      "Create ticket",
      "إنشاء تذكرة",
      "Log issue, link patient, set priority, and assign owner.",
      "سجّل المشكلة، اربط المريض، حدّد الأولوية، وعيّن المسؤول.",
      "Call center and supervisors collaborate on the same queue.",
      "مركز الاتصال والمشرفون يتعاونون على نفس الطابور.",
      NAV_ITEM_PATH.customer_support,
    ),
    st(
      "Resolve & document",
      "الحل والتوثيق",
      "Move status to resolved; notes stay in audit for coaching.",
      "انقل الحالة إلى محلولة؛ الملاحظات تبقى في التدقيق للتدريب.",
      "Escalate to admin when policy exceptions need approval.",
      "صعّد للإدارة عند الحاجة لاستثناءات سياسية.",
      NAV_ITEM_PATH.customer_support,
    ),
  ],
  "support",
);

const DOCTOR_REVENUE = sec(
  "feature-doctor-revenue",
  "Doctor revenue",
  "إيراد الطبيب",
  "Personal attribution and payouts.",
  "النسبة الشخصية والصرف.",
  [
    st(
      "View attributed revenue",
      "عرض الإيراد المنسوب",
      "See visits and operations credited to you for the reporting period.",
      "شاهد الزيارات والعمليات المنسوبة إليك للفترة المحددة.",
      "Commission rules come from HR employee profile when configured.",
      "قواعد العمولة تأتي من ملف الموظف في الموارد البشرية عند الإعداد.",
      NAV_ITEM_PATH.doctor_revenue,
    ),
  ],
  "payment",
);

const DASHBOARD = sec(
  "feature-dashboard",
  "Dashboard",
  "لوحة المعلومات",
  "Today's pulse and KPIs.",
  "نبض اليوم ومؤشرات الأداء.",
  [
    st(
      "Today vs period",
      "اليوم مقابل الفترة",
      "Top cards show live today metrics; lower sections honor the reporting period.",
      "البطاقات العلوية تعرض مؤشرات اليوم المباشرة؛ الأقسام السفلية تحترم فترة التقرير.",
      "Use this view at morning huddle for waiting count and collections.",
      "استخدم العرض في الاجتماع الصباحي لعدد المنتظرين والتحصيل.",
      NAV_ITEM_PATH.dashboard,
    ),
  ],
  "dashboard",
);

const PLATFORM = sec(
  "feature-platform",
  "Platform console",
  "وحدة المنصة",
  "Multi-tenant hosting operations.",
  "عمليات الاستضافة متعددة المستأجرين.",
  [
    st(
      "Tenant health",
      "صحة المستأجرين",
      "Monitor organizations, markets, and platform-wide alerts.",
      "راقب المنظمات والأسواق وتنبيهات المنصة.",
      "Use tenant logins for clinical demos—platform admin does not see PHI by default.",
      "استخدم حسابات المستأجر للعروض السريرية — مشرف المنصة لا يرى بيانات المرضى افتراضياً.",
      NAV_ITEM_PATH.platform,
    ),
  ],
  "navigate",
);

export const FEATURE_SECTION_BY_NAV: Partial<Record<NavItemKey, GuideSection>> = {
  dashboard: DASHBOARD,
  patients: PATIENTS,
  appointments: APPOINTMENTS,
  encounters: ENCOUNTERS,
  operations: OPERATIONS,
  revenue: REVENUE,
  expenses: EXPENSES,
  reports: REPORTS,
  admin: ADMIN,
  hr: HR,
  clinics: CLINICS,
  customer_support: CUSTOMER_SUPPORT,
  doctor_revenue: DOCTOR_REVENUE,
  platform: PLATFORM,
};