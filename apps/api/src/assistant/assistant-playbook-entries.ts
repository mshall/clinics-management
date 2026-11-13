import type { PlaybookEntry } from "./assistant-playbook";

/** Additional how-to flows — merged into PLAYBOOK at runtime. */
export const EXTENDED_PLAYBOOK: PlaybookEntry[] = [
  {
    id: "find_patient",
    nav: ["patients"],
    patterns: [/find patient|search patient|lookup patient|patient named|patient with mrn|ابحث عن مريض|مريض اسمه/i],
    navigateNavKey: "patients",
    en: {
      title: "Find a patient",
      navigateLabel: "Open Patients",
      steps: [
        "Ask me: “find patient [name/MRN/phone]” and I will list matches with buttons to the chart.",
        "Or open Patients and use the search filter on the list.",
      ],
    },
    ar: {
      title: "البحث عن مريض",
      navigateLabel: "فتح المرضى",
      steps: ["اسألني: «ابحث عن مريض [الاسم/MRN]» لأعرض أزراراً للملف.", "أو افتح المرضى واستخدم البحث."],
    },
  },
  {
    id: "edit_patient",
    nav: ["patients"],
    patterns: [/edit patient|update patient|patient demographics|تعديل مريض|تحديث بيانات مريض/i],
    navigateNavKey: "patients",
    en: {
      title: "Edit patient demographics",
      navigateLabel: "Open Patients",
      steps: [
        "Patients → open patient → Edit demographics.",
        "Phone uniqueness is enforced; national ID document optional.",
      ],
    },
    ar: {
      title: "تعديل بيانات المريض",
      navigateLabel: "فتح المرضى",
      steps: ["المرضى → فتح الملف → تعديل البيانات.", "الهاتف فريد؛ مستند الهوية اختياري."],
    },
  },
  {
    id: "finalize_encounter",
    nav: ["encounters"],
    patterns: [/finalize encounter|complete visit|close encounter|إنهاء زيارة|اكمال زيارة/i],
    navigateNavKey: "encounters",
    en: {
      title: "Finalize an encounter",
      navigateLabel: "Open Encounters",
      steps: [
        "Open the draft encounter → complete clinical and fee fields.",
        "Finalize — billing fields lock after finalization.",
        "Generate invoice from finalized visit if your role allows.",
      ],
    },
    ar: {
      title: "إنهاء زيارة",
      navigateLabel: "فتح الزيارات",
      steps: ["افتح مسودة الزيارة → أكمل البيانات.", "أنهِ الزيارة — تُقفل الحقول بعد الإنهاء.", "أنشئ فاتورة إن سمح دورك."],
    },
  },
  {
    id: "appointment_status",
    nav: ["appointments"],
    patterns: [/appointment status|cancel appointment|reschedule|no show|حالة الموعد|إلغاء موعد/i],
    navigateNavKey: "appointments",
    en: {
      title: "Manage appointment status",
      navigateLabel: "Open Appointments",
      steps: [
        "Appointments → open row → update status (scheduled, completed, cancelled, no-show).",
        "Reschedule by editing date/time within clinic hours.",
      ],
    },
    ar: {
      title: "إدارة حالة الموعد",
      navigateLabel: "فتح المواعيد",
      steps: ["المواعيد → افتح السجل → غيّر الحالة.", "أعد الجدولة بتعديل الوقت ضمن ساعات العيادة."],
    },
  },
  {
    id: "list_clinics",
    nav: ["clinics", "admin"],
    patterns: [/list clinics|clinics in org|branches|what clinics|قائمة العيادات|الفروع/i],
    en: {
      title: "Clinics in your organization",
      steps: ["Ask: “What are the list of clinics in this org?” for live names.", "Or Clinics & branches (Admin) to manage."],
    },
    ar: {
      title: "عيادات المؤسسة",
      steps: ["اسأل: «ما قائمة العيادات؟» للحصول على أسماء حية.", "أو العيادات والفروع من الإدارة."],
    },
  },
  {
    id: "add_clinic",
    nav: ["admin", "clinics"],
    patterns: [/add clinic|create clinic|new branch|إضافة عيادة|عيادة جديدة/i],
    navigateNavKey: "clinics",
    en: {
      title: "Add a clinic or branch",
      navigateLabel: "Open Clinics",
      steps: [
        "Admin → Clinics & branches → Add.",
        "Set specialty, hours, default currency, invoice branding.",
      ],
    },
    ar: {
      title: "إضافة عيادة أو فرع",
      navigateLabel: "فتح العيادات",
      steps: ["الإدارة → العيادات → إضافة.", "حدد التخصص والساعات والعملة والفواتير."],
    },
  },
  {
    id: "org_user",
    nav: ["admin"],
    patterns: [/org user|organization user|add user|invite user|nav tab|role permission|مستخدم مؤسسة|صلاحيات/i],
    navigateNavKey: "admin",
    en: {
      title: "Organization users & nav tabs",
      navigateLabel: "Open Admin",
      steps: [
        "Admin → Organization users → create or edit user.",
        "Assign role and per-user navigation tabs (or inherit role defaults).",
        "Group admins manage org-wide; clinic admins may restrict within policy.",
      ],
    },
    ar: {
      title: "مستخدمو المؤسسة والتبويبات",
      navigateLabel: "فتح الإدارة",
      steps: ["الإدارة → مستخدمو المؤسسة.", "عيّن الدور وتبويبات القائمة.", "مدير المجموعة يتحكم على مستوى المؤسسة."],
    },
  },
  {
    id: "attendance_leave",
    nav: ["hr"],
    patterns: [/attendance|leave request|time off|حضور|إجازة/i],
    navigateNavKey: "hr",
    en: {
      title: "Attendance & leave",
      navigateLabel: "Open HR",
      steps: [
        "HR → Attendance to record or review punches.",
        "HR → Leave requests to submit/approve leave by employee.",
      ],
    },
    ar: {
      title: "الحضور والإجازات",
      navigateLabel: "فتح الموارد البشرية",
      steps: ["الموارد البشرية → الحضور.", "الموارد البشرية → طلبات الإجازة."],
    },
  },
  {
    id: "employee_count",
    nav: ["hr", "admin"],
    patterns: [/how many employee|headcount|staff count|عدد الموظفين|كم موظف/i],
    en: {
      title: "Employee headcount",
      steps: ["Ask: “How many employees do we have?” for a live active count (HR/Admin access)."],
    },
    ar: {
      title: "عدد الموظفين",
      steps: ["اسأل: «كم عدد الموظفين؟» للحصول على عدد نشط حي."],
    },
  },
  {
    id: "tax_invoice",
    nav: ["encounters", "operations"],
    patterns: [/tax invoice|generate invoice|فاتورة ضريبية|إنشاء فاتورة/i],
    navigateNavKey: "encounters",
    en: {
      title: "Tax invoices",
      navigateLabel: "Open Encounters",
      steps: [
        "Finalize encounter or operation with fee lines.",
        "Generate invoice — TRN/VAT from Admin → Organization settings appear on tax invoices.",
      ],
    },
    ar: {
      title: "الفواتير الضريبية",
      navigateLabel: "فتح الزيارات",
      steps: ["أنهِ الزيارة بالرسوم.", "أنشئ الفاتورة — TRN وضريبة القيمة المضافة من إعدادات المؤسسة."],
    },
  },
  {
    id: "dashboard_kpi",
    nav: ["dashboard"],
    patterns: [/dashboard kpi|organization overview|how is the org doing|مؤشرات المؤسسة/i],
    navigateNavKey: "dashboard",
    en: {
      title: "Organization dashboard",
      navigateLabel: "Open Dashboard",
      steps: [
        "Dashboard shows period KPIs: patients, encounters, revenue, expenses, branches, headcount.",
        "Financial and HR tiles respect your role.",
      ],
    },
    ar: {
      title: "لوحة المؤسسة",
      navigateLabel: "فتح اللوحة",
      steps: ["تعرض مؤشرات الفترة: مرضى، زيارات، إيرادات، مصروفات، فروع، موظفون.", "حسب صلاحيات دورك."],
    },
  },
  {
    id: "platform_tenant",
    nav: ["platform_organizations"],
    patterns: [/platform tenant|create organization|new tenant|منظمة منصة|مستأجر/i],
    navigateNavKey: "platform_organizations",
    en: {
      title: "Platform organizations",
      navigateLabel: "Open Platform orgs",
      steps: [
        "Platform → Organizations to create tenants.",
        "Each tenant is an isolated clinic organization with its own users and data.",
      ],
    },
    ar: {
      title: "منظمات المنصة",
      navigateLabel: "فتح منظمات المنصة",
      steps: ["المنصة → المنظمات لإنشاء مستأجر.", "كل مستأجر مؤسسة معزولة."],
    },
  },
  {
    id: "platform_users",
    nav: ["platform_users"],
    patterns: [/platform user|super admin account|مستخدم منصة/i],
    navigateNavKey: "platform_users",
    en: {
      title: "Platform users",
      navigateLabel: "Open Platform users",
      steps: ["Platform → Users for platform-level administrator accounts."],
    },
    ar: {
      title: "مستخدمو المنصة",
      navigateLabel: "فتح مستخدمي المنصة",
      steps: ["المنصة → المستخدمون لحسابات مسؤولي المنصة."],
    },
  },
  {
    id: "change_language",
    nav: ["profile"],
    patterns: [/change language|arabic|english ui|تغيير اللغة|العربية|الإنجليزية/i],
    navigateNavKey: "profile",
    en: {
      title: "UI language",
      navigateLabel: "Open Profile",
      steps: [
        "Use the language control in the top bar (English / العربية).",
        "Profile also holds account settings.",
      ],
    },
    ar: {
      title: "لغة الواجهة",
      navigateLabel: "فتح الملف الشخصي",
      steps: ["غيّر اللغة من الشريط العلوي.", "الملف الشخصي لإعدادات الحساب."],
    },
  },
  {
    id: "expense_approve",
    nav: ["expenses"],
    patterns: [/approve expense|pending expense|اعتماد مصروف/i],
    navigateNavKey: "expenses",
    en: {
      title: "Expense approval",
      navigateLabel: "Open Expenses",
      steps: ["Expenses → filter by status → open row → approve or reject per policy."],
    },
    ar: {
      title: "اعتماد المصروفات",
      navigateLabel: "فتح المصروفات",
      steps: ["المصروفات → رشّح بالحالة → اعتماد أو رفض."],
    },
  },
  {
    id: "month_revenue",
    nav: ["revenue", "doctor_revenue", "reports"],
    patterns: [/revenue this month|income last month|expenses this month|إيراد هذا الشهر|مصروفات الشهر/i],
    en: {
      title: "Period revenue / expenses",
      steps: [
        "Ask with a period: “revenue this month”, “my income in November”, “organization revenue last month”.",
        "I return posted ledger totals (gross/net by currency) within your access.",
      ],
    },
    ar: {
      title: "إيرادات/مصروفات فترة",
      steps: ["اسأل مع الفترة: «إيراد هذا الشهر»، «دخلي في نوفمبر».", "أعرض مجاميع دفتر الإيرادات حسب صلاحياتك."],
    },
  },
];
