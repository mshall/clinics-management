import type { DemoRole } from "@/lib/roles";

export type GuideStep = {
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  path?: string;
};

export type GuideSection = {
  id: string;
  titleEn: string;
  titleAr: string;
  summaryEn: string;
  summaryAr: string;
  steps: GuideStep[];
  tipsEn?: string[];
  tipsAr?: string[];
};

export type RoleGuide = {
  headlineEn: string;
  headlineAr: string;
  subtitleEn: string;
  subtitleAr: string;
  sections: GuideSection[];
};

function s(
  titleEn: string,
  titleAr: string,
  summaryEn: string,
  summaryAr: string,
  steps: GuideStep[],
  tipsEn?: string[],
  tipsAr?: string[],
): GuideSection {
  return { id: titleEn.toLowerCase().replace(/\s+/g, "-"), titleEn, titleAr, summaryEn, summaryAr, steps, tipsEn, tipsAr };
}

const SHARED_KEYBOARD: GuideStep[] = [
  {
    titleEn: "Global patient search",
    titleAr: "بحث المرضى العام",
    bodyEn: "Press ⌘K (Mac) or Ctrl+K (Windows) from any screen to find patients by phone, national ID, MRN, or name.",
    bodyAr: "اضغط ⌘K أو Ctrl+K من أي شاشة للبحث عن المريض بالهاتف أو الرقم القومي أو MRN أو الاسم.",
    path: "/patients",
  },
];

const RECEPTIONIST: RoleGuide = {
  headlineEn: "Front desk & patient flow",
  headlineAr: "الاستقبال وتدفق المرضى",
  subtitleEn: "Book, check in, collect payment, and keep the waiting room moving.",
  subtitleAr: "احجز المواعيد، سجّل الوصول، اقبل الدفع، وأبقِ غرفة الانتظار منظمة.",
  sections: [
    s(
      "Start of shift",
      "بداية الوردية",
      "Open the tools you use all day.",
      "افتح الأدوات التي تستخدمها طوال اليوم.",
      [
        ...SHARED_KEYBOARD,
        {
          titleEn: "Live clinic board",
          titleAr: "لوحة العيادة المباشرة",
          bodyEn: "Appointments → Front desk board shows who is waiting, ticket numbers, and free rooms. Open the waiting-room screen on a TV.",
          bodyAr: "المواعيد → لوحة الاستقبال تعرض المنتظرين وأرقام التذاكر والغرف الفارغة. افتح شاشة غرفة الانتظار على التلفزيون.",
          path: "/front-desk/board",
        },
        {
          titleEn: "Register a new patient",
          titleAr: "تسجيل مريض جديد",
          bodyEn: "Patients → Register: capture EN/AR names, phone, national ID, home branch, and acquisition channel (for campaign tracking).",
          bodyAr: "المرضى → تسجيل: الاسم بالإنجليزية والعربية، الهاتف، الرقم القومي، الفرع، وقناة الاكتساب.",
          path: "/patients",
        },
      ],
      [
        "Chart header badges show allergies, balance owed, VIP, and chaperone flags on patient and appointment screens.",
      ],
      ["شارات رأس الملف تعرض الحساسية والرصيد وVIP ومرافق على شاشات المريض والموعد."],
    ),
    s(
      "Appointments",
      "المواعيد",
      "Schedule and complete check-in in under 30 seconds.",
      "جدولة المواعيد وتسجيل الوصول في أقل من 30 ثانية.",
      [
        {
          titleEn: "Book appointment",
          titleAr: "حجز موعد",
          bodyEn: "Appointments → New: pick clinic, patient, doctor, time, and fee. Use appointment types when configured.",
          bodyAr: "المواعيد → جديد: اختر العيادة والمريض والطبيب والوقت والرسوم.",
          path: "/appointments",
        },
        {
          titleEn: "Quick check-in",
          titleAr: "تسجيل وصول سريع",
          bodyEn: "Open the appointment → Quick check-in: sets CHECKED_IN, prints queue ticket, optional room, and can post payment to revenue in one step.",
          bodyAr: "افتح الموعد → تسجيل سريع: حالة CHECKED_IN، رقم تذكرة، غرفة اختيارية، ودفع اختياري.",
          path: "/appointments",
        },
        {
          titleEn: "No-show",
          titleAr: "عدم الحضور",
          bodyEn: "Mark no-show from scheduling tools; repeat no-shows can trigger deposit requirement on the patient record.",
          bodyAr: "سجّل عدم الحضور من أدوات الجدولة؛ التكرار قد يفرض عربوناً على المريض.",
        },
      ],
    ),
    s(
      "Billing & operations",
      "الفواتير والعمليات",
      "Collect money and support surgical bookings.",
      "تحصيل المدفوعات ودعم حجوزات العمليات.",
      [
        {
          titleEn: "Revenue ledger",
          titleAr: "دفتر الإيرادات",
          bodyEn: "Revenue lists posted collections. Check-in and completed visits/operations feed this ledger.",
          bodyAr: "الإيرادات تعرض التحصيلات المسجّلة من الوصول والزيارات والعمليات المكتملة.",
          path: "/revenue",
        },
        {
          titleEn: "Operations desk",
          titleAr: "مكتب العمليات",
          bodyEn: "Operations: track booked → pre-op → in progress → recovery → discharged; record down payment, installments, and balance on completion.",
          bodyAr: "العمليات: من الحجز إلى ما قبل العملية ثم أثناءها والتعافي والخروج؛ دفعة مقدمة وأقساط.",
          path: "/operations",
        },
      ],
    ),
  ],
};

const PHYSICIAN: RoleGuide = {
  headlineEn: "Clinical work",
  headlineAr: "العمل السريري",
  subtitleEn: "Encounters, documentation, safety, and follow-up.",
  subtitleAr: "الزيارات، التوثيق، السلامة، والمتابعة.",
  sections: [
    s(
      "Before the patient",
      "قبل المريض",
      "Review context in one place.",
      "راجع السياق في مكان واحد.",
      [
        {
          titleEn: "Pre-visit summary (AI)",
          titleAr: "ملخص ما قبل الزيارة",
          bodyEn: "Use the clinic AI pre-visit summary API or Patient 360 on the chart: last visits, meds, allergies, and alerts.",
          bodyAr: "استخدم ملخص ما قبل الزيارة أو Patient 360: آخر الزيارات والأدوية والحساسية والتنبيهات.",
          path: "/patients",
        },
        {
          titleEn: "Patient 360",
          titleAr: "ملف المريض 360",
          bodyEn: "Patient detail: summary, timeline, active problems, family links, vitals charts, and clinical photos.",
          bodyAr: "تفاصيل المريض: الملخص، الخط الزمني، المشاكل النشطة، العائلة، العلامات الحيوية.",
        },
      ],
    ),
    s(
      "During the visit",
      "أثناء الزيارة",
      "Document with templates and safety checks.",
      "وثّق باستخدام القوالب وفحوص السلامة.",
      [
        {
          titleEn: "Encounters",
          titleAr: "الزيارات",
          bodyEn: "Encounters: SOAP note, ICD diagnoses (EN/AR), medications with interaction alerts, vitals, labs/radiology uploads, finalize to lock.",
          bodyAr: "الزيارات: ملاحظة SOAP، تشخيصات ICD، أدوية مع تنبيهات التفاعل، علامات حيوية، مرفقات.",
          path: "/encounters",
        },
        {
          titleEn: "Clinical templates",
          titleAr: "القوالب السريرية",
          bodyEn: "Clinical templates: specialty forms, letters, shortcuts, and prescription QR for dispensing.",
          bodyAr: "القوالب السريرية: نماذج التخصص، الخطابات، الاختصارات، وQR الوصفة.",
          path: "/clinical/templates",
        },
        {
          titleEn: "AI scribe (approve)",
          titleAr: "المساعد السريري (اعتماد)",
          bodyEn: "Start scribe on an encounter, review draft note and Rx, then approve into the chart (production speech provider required).",
          bodyAr: "ابدأ المساعد على الزيارة، راجع المسودة، ثم اعتمدها في الملف.",
          path: "/encounters",
        },
      ],
      ["Amend finalized notes only through the amend flow; do not edit locked content in place."],
      ["عدّل الملاحظات المعتمدة عبر مسار التعديل فقط."],
    ),
    s(
      "After the visit",
      "بعد الزيارة",
      "Billing and follow-up.",
      "الفواتير والمتابعة.",
      [
        {
          titleEn: "Invoices & revenue",
          titleAr: "الفواتير والإيرادات",
          bodyEn: "Generate tax invoice from encounter when allowed; your attributed revenue appears under Doctor revenue.",
          bodyAr: "أنشئ فاتورة ضريبية من الزيارة؛ إيرادك يظهر في إيراد الطبيب.",
          path: "/doctor-revenue",
        },
        {
          titleEn: "Follow-up",
          titleAr: "المتابعة",
          bodyEn: "Set follow-up weeks and note on the encounter before or after finalize; scheduling can pick it up.",
          bodyAr: "حدد أسابيع المتابعة والملاحظة على الزيارة قبل أو بعد الاعتماد.",
        },
      ],
    ),
  ],
};

const NURSE: RoleGuide = {
  headlineEn: "Nursing & room support",
  headlineAr: "التمريض ودعم الغرف",
  subtitleEn: "Patients, vitals, appointments, and encounter support.",
  subtitleAr: "المرضى، العلامات الحيوية، المواعيد، ودعم الزيارة.",
  sections: [
    s(
      "Patient chart",
      "ملف المريض",
      "Safety-first on every screen.",
      "السلامة أولاً في كل شاشة.",
      [
        ...SHARED_KEYBOARD,
        {
          titleEn: "Allergies & alerts",
          titleAr: "الحساسية والتنبيهات",
          bodyEn: "Confirm allergies on the patient chart; header badges repeat alerts on encounters and appointments.",
          bodyAr: "راجع الحساسية في ملف المريض؛ التنبيهات تتكرر على الزيارات والمواعيد.",
          path: "/patients",
        },
        {
          titleEn: "Vitals",
          titleAr: "العلامات الحيوية",
          bodyEn: "Enter vitals on the encounter; history charts appear on Patient 360.",
          bodyAr: "أدخل العلامات على الزيارة؛ الرسوم تظهر في Patient 360.",
          path: "/encounters",
        },
      ],
    ),
    s(
      "Flow",
      "التدفق",
      "Support front desk and clinicians.",
      "ادعم الاستقبال والأطباء.",
      [
        {
          titleEn: "Appointments",
          titleAr: "المواعيد",
          bodyEn: "View today’s appointments; help with check-in status and room assignment when asked.",
          bodyAr: "اعرض مواعيد اليوم؛ ساعد في الوصول وتعيين الغرفة عند الطلب.",
          path: "/appointments",
        },
        {
          titleEn: "Encounters",
          titleAr: "الزيارات",
          bodyEn: "Open encounters for triage documentation; physicians finalize clinical decisions.",
          bodyAr: "افتح الزيارات للتوثيق الأولي؛ الطبيب يعتمد القرارات السريرية.",
          path: "/encounters",
        },
      ],
    ),
  ],
};

const CALL_CENTER: RoleGuide = {
  headlineEn: "Call center & outreach",
  headlineAr: "مركز الاتصال والتواصل",
  subtitleEn: "Find patients, book appointments, and log support.",
  subtitleAr: "ابحث عن المرضى، احجز المواعيد، وسجّل الدعم.",
  sections: [
    s(
      "Find & book",
      "البحث والحجز",
      "Speed tools for phone workflows.",
      "أدوات سريعة لمهام الهاتف.",
      [
        ...SHARED_KEYBOARD,
        {
          titleEn: "Appointments",
          titleAr: "المواعيد",
          bodyEn: "Create and reschedule appointments; watch no-show risk flags for extra reminders or deposit policy.",
          bodyAr: "أنشئ وأعد جدولة المواعيد؛ راقب مخاطر عدم الحضور للتذكير أو العربون.",
          path: "/appointments",
        },
        {
          titleEn: "Waitlist",
          titleAr: "قائمة الانتظار",
          bodyEn: "When a slot cancels, offer waitlist patients a slot from scheduling (if enabled for your branch).",
          bodyAr: "عند إلغاء موعد، اعرض خانة على قائمة الانتظار.",
        },
      ],
    ),
    s(
      "Support & messaging",
      "الدعم والرسائل",
      "Track issues and templates.",
      "تتبع المشاكل والقوالب.",
      [
        {
          titleEn: "Customer support",
          titleAr: "دعم العملاء",
          bodyEn: "Customer support: create tickets from patient issues; link audit logs when escalating.",
          bodyAr: "دعم العملاء: أنشئ تذاكر لمشاكل المرضى.",
          path: "/customer-support",
        },
        {
          titleEn: "Message templates",
          titleAr: "قوالب الرسائل",
          bodyEn: "Messaging API seeds WhatsApp/SMS templates (confirm, 24h/2h reminders, results ready) — queue until provider is connected.",
          bodyAr: "قوالب واتساب/رسائل للتأكيد والتذكير والنتائج — تُرسل عند ربط المزود.",
        },
      ],
    ),
  ],
};

const GROUP_ADMIN: RoleGuide = {
  headlineEn: "Organization administration",
  headlineAr: "إدارة المنظمة",
  subtitleEn: "Users, clinics, money, governance, and insights.",
  subtitleAr: "المستخدمون، العيادات، المالية، الحوكمة، والرؤى.",
  sections: [
    s(
      "Daily oversight",
      "الإشراف اليومي",
      "See the business pulse.",
      "تابع نبض العمل.",
      [
        {
          titleEn: "Dashboard",
          titleAr: "لوحة المعلومات",
          bodyEn: "Dashboard: reporting period KPIs plus Today (live) — appointments, waiting, seen, collected, no-shows.",
          bodyAr: "لوحة المعلومات: مؤشرات الفترة + اليوم المباشر.",
          path: "/",
        },
        {
          titleEn: "Reports",
          titleAr: "التقارير",
          bodyEn: "Reports: P&L, performance, clinic breakdown, patient acquisition — always respect the global date range in the header.",
          bodyAr: "التقارير: الأرباح، الأداء، تفصيل العيادات، اكتساب المرضى.",
          path: "/reports",
        },
      ],
    ),
    s(
      "Administration",
      "الإدارة",
      "Control access and data.",
      "تحكم في الوصول والبيانات.",
      [
        {
          titleEn: "Organization users",
          titleAr: "مستخدمو المنظمة",
          bodyEn: "Admin → Organization users: invite, roles, deactivate/archive, restore.",
          bodyAr: "الإدارة → مستخدمو المنظمة: الدعوة، الأدوار، التعطيل والأرشفة.",
          path: "/admin",
        },
        {
          titleEn: "RBAC & sidebar tabs",
          titleAr: "الصلاحيات وتبويبات القائمة",
          bodyEn: "Admin → Organization RBAC: per-user nav tabs; role defaults for each job title.",
          bodyAr: "الإدارة → صلاحيات المنظمة: تبويبات لكل مستخدم وافتراضيات لكل دور.",
          path: "/admin",
        },
        {
          titleEn: "Clinics & branches",
          titleAr: "العيادات والفروع",
          bodyEn: "Clinics: hierarchy, hours, tax/TRN, invoice branding, front-desk room labels.",
          bodyAr: "العيادات: التسلسل الهرمي، الأوقات، الضريبة، العلامة التجارية للفاتورة.",
          path: "/clinics",
        },
        {
          titleEn: "Governance",
          titleAr: "الحوكمة",
          bodyEn: "Admin → Governance: audit trail filters (action, resource, actor, date window).",
          bodyAr: "الإدارة → الحوكمة: سجل التدقيق والفلاتر.",
          path: "/admin",
        },
        {
          titleEn: "Insights",
          titleAr: "الرؤى",
          bodyEn: "Admin → Insights: 360 overview and staff performance for the selected period.",
          bodyAr: "الإدارة → الرؤى: نظرة شاملة وأداء الموظفين.",
          path: "/admin",
        },
      ],
    ),
    s(
      "Platform capabilities",
      "قدرات المنصة",
      "Billing and compliance foundations.",
      "أساسيات الفواتير والامتثال.",
      [
        {
          titleEn: "Service catalog",
          titleAr: "قائمة الخدمات",
          bodyEn: "Billing API: service codes, effective-dated prices, contract prices, split payments, cash close, Egypt ETA queue.",
          bodyAr: "واجهة الفواتير: رموز الخدمات، الأسعار، عقود الشركات، إغلاق الصندوق، ETA.",
        },
        {
          titleEn: "Documentation",
          titleAr: "التوثيق",
          bodyEn: "Repo Docs: FRONT_DESK, CLINICAL_WORKFLOW, PATIENT_360, CLINIC_PLATFORM_CAPABILITIES.",
          bodyAr: "مستندات المستودع: الاستقبال، السير السريري، Patient 360، قدرات المنصة.",
        },
      ],
    ),
  ],
};

const GROUP_SUPERVISOR: RoleGuide = {
  headlineEn: "Group supervision",
  headlineAr: "إشراف المجموعة",
  subtitleEn: "Oversight without full HR/clinic admin.",
  subtitleAr: "إشراف دون إدارة كاملة للموارد البشرية أو العيادات.",
  sections: [
    s(
      "Monitor",
      "المتابعة",
      "Clinical and financial line of sight.",
      "رؤية سريرية ومالية.",
      [
        { ...SHARED_KEYBOARD[0] },
        {
          titleEn: "Dashboard & reports",
          titleAr: "لوحة المعلومات والتقارير",
          bodyEn: "Use dashboard today view and reports for no-show trends and revenue by clinic.",
          bodyAr: "استخدم لوحة اليوم والتقارير لمتابعة عدم الحضور والإيراد.",
          path: "/reports",
        },
        {
          titleEn: "Customer support",
          titleAr: "دعم العملاء",
          bodyEn: "Review escalated support tickets and resolution hints.",
          bodyAr: "راجع تذاكر الدعم المصعدة.",
          path: "/customer-support",
        },
      ],
    ),
    s(
      "Admin access",
      "صلاحيات الإدارة",
      "Limited admin surfaces.",
      "أسطح إدارية محدودة.",
      [
        {
          titleEn: "Admin",
          titleAr: "الإدارة",
          bodyEn: "Admin panels available to your role: organization insights, audit, and user lists as configured.",
          bodyAr: "لوحات الإدارة حسب دورك: الرؤى، التدقيق، قوائم المستخدمين.",
          path: "/admin",
        },
      ],
    ),
  ],
};

const BRANCH_MANAGER = GROUP_ADMIN;
const FINANCE_OFFICER: RoleGuide = {
  headlineEn: "Finance & revenue",
  headlineAr: "المالية والإيرادات",
  subtitleEn: "Revenue, expenses, invoices, billing, and cash close.",
  subtitleAr: "الإيرادات، المصروفات، الفواتير، الفوترة، وإغلاق الصندوق.",
  sections: [
    s(
      "Core ledgers",
      "الدفاتر الأساسية",
      "Posted money only.",
      "الأموال المسجّلة فقط.",
      [
        {
          titleEn: "Revenue",
          titleAr: "الإيرادات",
          bodyEn: "Revenue: posted entries from visits, check-in, operations; void rules on cancellation.",
          bodyAr: "الإيرادات: قيود من الزيارات والوصول والعمليات.",
          path: "/revenue",
        },
        {
          titleEn: "Expenses",
          titleAr: "المصروفات",
          bodyEn: "Expenses: clinic opex with approval states; included in P&L reports.",
          bodyAr: "المصروفات: نفقات العيادة وحالات الموافقة.",
          path: "/expenses",
        },
        {
          titleEn: "Reports",
          titleAr: "التقارير",
          bodyEn: "Profit & loss and clinic breakdown by currency; align with header reporting period.",
          bodyAr: "الأرباح والخسائر وتفصيل العيادات حسب العملة.",
          path: "/reports",
        },
      ],
    ),
    s(
      "Billing extensions",
      "امتدادات الفواتير",
      "Catalog, payments, Egypt compliance.",
      "القائمة، المدفوعات، امتثال مصر.",
      [
        {
          titleEn: "Service catalog API",
          titleAr: "واجهة قائمة الخدمات",
          bodyEn: "Maintain codes and effective-dated prices; contract prices per payer company.",
          bodyAr: "صيانة الرموز والأسعار بتواريخ السريان وعقود الشركات.",
        },
        {
          titleEn: "Split payments",
          titleAr: "تقسيم الدفع",
          bodyEn: "Record cash + card allocations on one payment; triggers ETA receipt queue stub.",
          bodyAr: "سجّل نقد + بطاقة في دفعة واحدة؛ يضاف إلى طابور ETA.",
        },
        {
          titleEn: "Cash close",
          titleAr: "إغلاق الصندوق",
          bodyEn: "Daily cashier shift: expected vs counted by payment method per branch.",
          bodyAr: "وردية الصندوق: المتوقع مقابل المعدّ حسب طريقة الدفع.",
        },
      ],
    ),
  ],
};

const HR_OFFICER: RoleGuide = {
  headlineEn: "Human resources",
  headlineAr: "الموارد البشرية",
  subtitleEn: "Employees, privileges, payroll context.",
  subtitleAr: "الموظفون، الامتيازات، وسياق الرواتب.",
  sections: [
    s(
      "HR workspace",
      "مساحة الموارد البشرية",
      "Hire and maintain staff records.",
      "توظيف وصيانة سجلات الموظفين.",
      [
        {
          titleEn: "Employees",
          titleAr: "الموظفون",
          bodyEn: "HR: employees, clinic placement, specialties, commission percent, documents.",
          bodyAr: "الموارد البشرية: الموظفون، الفرع، التخصص، نسبة العمولة.",
          path: "/hr",
        },
        {
          titleEn: "Privileges",
          titleAr: "الامتيازات",
          bodyEn: "Clinic-scoped employee privileges extend HR nav when granted.",
          bodyAr: "امتيازات على مستوى العيادة توسّع صلاحيات HR.",
        },
        {
          titleEn: "Scheduling conflicts",
          titleAr: "تعارضات الجدولة",
          bodyEn: "Cannot deactivate physicians with open appointments or active operations — resolve bookings first.",
          bodyAr: "لا يمكن تعطيل طبيب لديه مواعيد أو عمليات نشطة — أغلق الحجوزات أولاً.",
        },
      ],
    ),
  ],
};

const CLINIC_ADMIN: RoleGuide = {
  headlineEn: "Clinic administration",
  headlineAr: "إدارة العيادة",
  subtitleEn: "Your branch: staff, schedule, money, and settings.",
  subtitleAr: "فرعك: الموظفون، الجدولة، المالية، والإعدادات.",
  sections: [
    ...GROUP_ADMIN.sections.slice(0, 2),
    s(
      "Clinic-scoped tools",
      "أدوات على مستوى العيادة",
      "Day-to-day branch control.",
      "تحكم يومي بالفرع.",
      [
        {
          titleEn: "Clinic settings",
          titleAr: "إعدادات العيادة",
          bodyEn: "Clinics → your branch: hours, invoice/prescription branding, room labels for front desk board.",
          bodyAr: "العيادات → فرعك: الأوقات، العلامة، تسميات الغرف.",
          path: "/clinics",
        },
        {
          titleEn: "Clinic nav tabs",
          titleAr: "تبويبات العيادة",
          bodyEn: "Admin → Clinic nav tabs: restrict sidebar per user within clinic admin rules.",
          bodyAr: "الإدارة → تبويبات العيادة: تقييد القائمة لكل مستخدم.",
          path: "/admin",
        },
      ],
    ),
  ],
};

const CLINIC_ASSISTANT: RoleGuide = {
  headlineEn: "Clinic assistant",
  headlineAr: "مساعد العيادة",
  subtitleEn: "Patients, appointments, encounters, and basic finance.",
  subtitleAr: "المرضى، المواعيد، الزيارات، والمالية الأساسية.",
  sections: [
    RECEPTIONIST.sections[0],
    RECEPTIONIST.sections[1],
    s(
      "Finance assist",
      "مساعدة مالية",
      "Support billing staff.",
      "ادعم فريق الفواتير.",
      [
        {
          titleEn: "Revenue & expenses",
          titleAr: "الإيرادات والمصروفات",
          bodyEn: "Post or review revenue/expense entries your role allows.",
          bodyAr: "سجّل أو راجع قيود الإيرادات والمصروفات المسموحة لدورك.",
          path: "/revenue",
        },
      ],
    ),
  ],
};

const PLATFORM_SUPER_ADMIN: RoleGuide = {
  headlineEn: "Platform operations",
  headlineAr: "عمليات المنصة",
  subtitleEn: "Multi-tenant control on Kiorly hosting.",
  subtitleAr: "التحكم متعدد المستأجرين على استضافة Kiorly.",
  sections: [
    s(
      "Platform console",
      "وحدة المنصة",
      "Organizations, users, clinics.",
      "المنظمات، المستخدمون، العيادات.",
      [
        {
          titleEn: "Overview",
          titleAr: "نظرة عامة",
          bodyEn: "Platform overview: health of hosted tenants.",
          bodyAr: "نظرة عامة على صحة المستأجرين.",
          path: "/platform",
        },
        {
          titleEn: "Organizations",
          titleAr: "المنظمات",
          bodyEn: "Create and manage tenant organizations.",
          bodyAr: "إنشاء وإدارة منظمات المستأجرين.",
          path: "/platform/organizations",
        },
        {
          titleEn: "Users & clinics",
          titleAr: "المستخدمون والعيادات",
          bodyEn: "Cross-tenant users and clinic directory for support.",
          bodyAr: "مستخدمون وعيادات عبر المستأجرين للدعم.",
          path: "/platform/users",
        },
      ],
      ["Platform super admin has no patient data unless impersonation is added — use tenant logins for clinical demos."],
      ["المشرف العام لا يرى بيانات المرضى — استخدم حسابات المستأجر للعروض السريرية."],
    ),
  ],
};

export const ROLE_GUIDES: Record<DemoRole, RoleGuide> = {
  platform_super_admin: PLATFORM_SUPER_ADMIN,
  group_admin: GROUP_ADMIN,
  group_supervisor: GROUP_SUPERVISOR,
  branch_manager: BRANCH_MANAGER,
  finance_officer: FINANCE_OFFICER,
  hr_officer: HR_OFFICER,
  physician: PHYSICIAN,
  nurse: NURSE,
  receptionist: RECEPTIONIST,
  call_center: CALL_CENTER,
  clinic_admin: CLINIC_ADMIN,
  clinic_assistant: CLINIC_ASSISTANT,
};

export function guideForRole(role: DemoRole | undefined): RoleGuide {
  if (!role) return PHYSICIAN;
  return ROLE_GUIDES[role] ?? PHYSICIAN;
}
