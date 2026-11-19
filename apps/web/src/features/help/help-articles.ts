/** GT-03 — task-based help-centre articles (top support questions) + search. */

import { HELP_VIDEOS } from "./help-content";

export type HelpPlanTier = "LITE" | "PRO" | "CLINIC" | "GROUP" | "ALL";

export type HelpArticle = {
  id: string;
  /** Stable support-question id used in acceptance tests. */
  questionId: string;
  tiers: HelpPlanTier[];
  category: "gettingStarted" | "scheduling" | "clinical" | "billing" | "team" | "kiorex" | "account";
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  /** Optional golden-flow Arabic video id from HELP_VIDEOS. */
  videoId?: (typeof HELP_VIDEOS)[number];
  tagsEn: string[];
  tagsAr: string[];
};

/**
 * Top 20 clinic support questions answered by bilingual task articles.
 * Tiers mark which plan the task is most relevant on (`ALL` = every plan).
 */
export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "signup-trial",
    questionId: "q01-signup-trial",
    tiers: ["ALL"],
    category: "gettingStarted",
    titleEn: "How do I sign up and start a trial?",
    titleAr: "كيف أسجّل وأبدأ الفترة التجريبية؟",
    bodyEn:
      "Open the public signup page, enter clinic and owner details, choose a plan, and verify your phone/email. The trial starts immediately; complete the onboarding checklist (clinic hours, first doctor, first appointment) before inviting the team.",
    bodyAr:
      "افتح صفحة التسجيل العامة، أدخل بيانات العيادة والمالك، اختر الباقة، ثم أكّد الهاتف/البريد. تبدأ التجربة فورًا؛ أكمل قائمة الإعداد (ساعات العمل، أول طبيب، أول موعد) قبل دعوة الفريق.",
    tagsEn: ["signup", "trial", "onboarding"],
    tagsAr: ["تسجيل", "تجربة", "إعداد"],
  },
  {
    id: "invite-team",
    questionId: "q02-invite-team",
    tiers: ["ALL"],
    category: "team",
    titleEn: "How do I invite staff and set roles?",
    titleAr: "كيف أدعو الموظفين وأحدد الأدوار؟",
    bodyEn:
      "Go to Team → Invite. Enter the email or WhatsApp number, pick roles (owner, physician, receptionist, …), and send. The invitee opens the link, sets a password, and lands on the role guide. You can revoke unused invites from the same screen.",
    bodyAr:
      "اذهب إلى الفريق ← دعوة. أدخل البريد أو واتساب، اختر الأدوار (مالك، طبيب، استقبال، …) وأرسل. يفتح المدعو الرابط ويضع كلمة مرور ثم يرى دليل الدور. يمكنك إلغاء الدعوات غير المستخدمة من الشاشة نفسها.",
    videoId: "inviteTeam",
    tagsEn: ["invite", "roles", "team"],
    tagsAr: ["دعوة", "أدوار", "فريق"],
  },
  {
    id: "import-patients",
    questionId: "q03-import-patients",
    tiers: ["ALL"],
    category: "gettingStarted",
    titleEn: "How do I import patients from Excel?",
    titleAr: "كيف أستورد المرضى من إكسل؟",
    bodyEn:
      "Onboarding → Import patients. Download the template, fill name/phone/national ID columns, upload, review matches, then commit. Duplicates are flagged by phone or national ID; sample rows never create revenue or WhatsApp messages.",
    bodyAr:
      "الإعداد ← استيراد المرضى. نزّل القالب، املأ الاسم/الهاتف/الرقم القومي، ارفع الملف، راجع المطابقات ثم اعتمد. تُعلَّم التكرارات بالهاتف أو الرقم القومي؛ الصفوف التجريبية لا تنشئ إيرادًا أو رسائل واتساب.",
    videoId: "importPatients",
    tagsEn: ["import", "excel", "patients"],
    tagsAr: ["استيراد", "إكسل", "مرضى"],
  },
  {
    id: "book-appointment",
    questionId: "q04-book-appointment",
    tiers: ["ALL"],
    category: "scheduling",
    titleEn: "How do I book an appointment?",
    titleAr: "كيف أحجز موعدًا؟",
    bodyEn:
      "Appointments → pick doctor and free slot → search or add the patient by phone → confirm type and fee. Marketplace bookings appear with a Kiorex badge; clinic-link bookings are commission-free.",
    bodyAr:
      "المواعيد ← اختر الطبيب والوقت المتاح ← ابحث أو أضف المريض بالهاتف ← أكّد النوع والرسوم. حجوزات السوق تظهر بشارة كيوركس؛ روابط العيادة بدون عمولة.",
    videoId: "bookAppointment",
    tagsEn: ["book", "appointment", "schedule"],
    tagsAr: ["حجز", "موعد", "جدول"],
  },
  {
    id: "check-in-pay",
    questionId: "q05-check-in-pay",
    tiers: ["ALL"],
    category: "billing",
    titleEn: "How do I check in a patient and take payment?",
    titleAr: "كيف أسجّل وصول المريض وأحصّل الدفع؟",
    bodyEn:
      "Front desk board or waiting room → Check in → choose cash, card or transfer (paste Transaction ID for Instant Pay). Payment posts revenue through the single path; print the receipt for the patient.",
    bodyAr:
      "لوحة الاستقبال أو غرفة الانتظار ← تسجيل الوصول ← اختر نقدًا أو بطاقة أو تحويل (الصق رقم العملية لإنستاباي). يُسجَّل الإيراد عبر المسار الوحيد؛ اطبع الإيصال للمريض.",
    videoId: "checkInAndPay",
    tagsEn: ["check-in", "payment", "receipt"],
    tagsAr: ["وصول", "دفع", "إيصال"],
  },
  {
    id: "write-visit",
    questionId: "q06-write-visit",
    tiers: ["ALL"],
    category: "clinical",
    titleEn: "How do I write and finalize a visit note?",
    titleAr: "كيف أكتب ملاحظة الزيارة وأعتمدها؟",
    bodyEn:
      "Open the encounter from the appointment or Patients → write SOAP, diagnoses and Rx → Finalize to sign. Signed notes stay readable forever; amendments append a trail. Clinical records are never locked by billing state.",
    bodyAr:
      "افتح الزيارة من الموعد أو المرضى ← اكتب SOAP والتشخيص والوصفة ← اعتمد للتوقيع. الملاحظات الموقّعة تبقى قابلة للقراءة دائمًا؛ التعديلات تُضاف كسجل. السجلات السريرية لا تُقفل بسبب الفوترة.",
    videoId: "writeVisit",
    tagsEn: ["visit", "SOAP", "finalize"],
    tagsAr: ["زيارة", "ملاحظة", "اعتماد"],
  },
  {
    id: "prescription-whatsapp",
    questionId: "q07-prescription-whatsapp",
    tiers: ["PRO", "CLINIC", "GROUP"],
    category: "clinical",
    titleEn: "How does the patient get the prescription on WhatsApp?",
    titleAr: "كيف يستلم المريض الوصفة على واتساب؟",
    bodyEn:
      "After you finalize the Rx, staff can send prescription_ready (WhatsApp template). Until Meta approves the template, print or share the PDF/QR link from the encounter. Patients need a phone and messaging consent.",
    bodyAr:
      "بعد اعتماد الوصفة يمكن إرسال قالب prescription_ready. إلى أن تعتمد ميتا القالب، اطبع أو شارك رابط PDF/QR من الزيارة. يحتاج المريض هاتفًا وموافقة مراسلة.",
    tagsEn: ["prescription", "whatsapp", "pdf"],
    tagsAr: ["وصفة", "واتساب", "pdf"],
  },
  {
    id: "no-show-deposit",
    questionId: "q08-no-show-deposit",
    tiers: ["PRO", "CLINIC", "GROUP"],
    category: "scheduling",
    titleEn: "When do we ask for a deposit on high no-show risk?",
    titleAr: "متى نطلب عربونًا لخطر عدم الحضور؟",
    bodyEn:
      "Pro+ shows a rule-based no-show risk chip. When policy requires a deposit, send a payment link from the appointment; mark paid at the desk or via Kiorex Pay. Unpaid links expire per market pack rules.",
    bodyAr:
      "برو+ تُظهر شارة خطر عدم الحضور بالقواعد. عند طلب العربون أرسل رابط الدفع من الموعد؛ أكّد الدفع في الاستقبال أو عبر كيوركس باي. الروابط غير المدفوعة تنتهي حسب إعدادات السوق.",
    tagsEn: ["deposit", "no-show", "risk"],
    tagsAr: ["عربون", "غياب", "خطر"],
  },
  {
    id: "waitlist-autofill",
    questionId: "q09-waitlist-autofill",
    tiers: ["PRO", "CLINIC", "GROUP"],
    category: "scheduling",
    titleEn: "How does waitlist auto-fill work when a slot frees?",
    titleAr: "كيف يعمل ملء قائمة الانتظار عند فراغ موعد؟",
    bodyEn:
      "Cancel an appointment to free the slot; the waitlist offers it over WhatsApp to the oldest eligible patient. Accept books them; decline moves to the next. Desk can also book the freed slot manually.",
    bodyAr:
      "إلغاء الموعد يحرر الوقت؛ تُعرض القائمة على واتساب لأقدم مريض مؤهل. القبول يحجزه؛ الرفض ينتقل للتالي. يمكن للاستقبال الحجز يدويًا أيضًا.",
    tagsEn: ["waitlist", "cancel", "autofill"],
    tagsAr: ["انتظار", "إلغاء", "تعبئة"],
  },
  {
    id: "cash-drawer",
    questionId: "q10-cash-drawer",
    tiers: ["PRO", "CLINIC", "GROUP"],
    category: "billing",
    titleEn: "How do I open and close the cash drawer (Z-report)?",
    titleAr: "كيف أفتح وأغلق درج النقدية (تقرير Z)؟",
    bodyEn:
      "Front desk → Cash drawer → Open with float → take cash payments during the shift → Close with a blind count. Variances above the market threshold need review. Print A4 or thermal Z-report.",
    bodyAr:
      "الاستقبال ← درج النقدية ← افتح برصيد ابتدائي ← حصّل النقد خلال الوردية ← أغلق بعدًّ أعمى. الفروقات فوق حد السوق تحتاج مراجعة. اطبع تقرير Z ورق A4 أو حراري.",
    tagsEn: ["cash", "shift", "z-report"],
    tagsAr: ["نقد", "وردية", "تقرير-z"],
  },
  {
    id: "refunds-packages",
    questionId: "q11-refunds-packages",
    tiers: ["PRO", "CLINIC", "GROUP"],
    category: "billing",
    titleEn: "How do refunds and patient packages work?",
    titleAr: "كيف تعمل الاستردادات وباقات المرضى؟",
    bodyEn:
      "Patient chart → Packages & refunds. Refunds create a negative revenue row via the single path and may need approval above the pack threshold. Package sales are liabilities until sessions are consumed.",
    bodyAr:
      "ملف المريض ← الباقات والاسترداد. الاسترداد يُنشئ صف إيراد سالب عبر المسار الوحيد وقد يحتاج موافقة فوق حد الباقة. بيع الباقة التزام حتى تُستهلك الجلسات.",
    tagsEn: ["refund", "package", "credit-note"],
    tagsAr: ["استرداد", "باقة", "إشعار"],
  },
  {
    id: "doctor-share",
    questionId: "q12-doctor-share",
    tiers: ["CLINIC", "GROUP"],
    category: "billing",
    titleEn: "How are doctor revenue shares calculated?",
    titleAr: "كيف تُحسب حصص إيراد الطبيب؟",
    bodyEn:
      "Revenue → statements. Rules match by doctor, visit type, category and branch. Collected posted revenue only; approve then mark paid. Doctors see their own statement; never edits the ledger.",
    bodyAr:
      "الإيراد ← الكشوف. القواعد تطابق الطبيب ونوع الزيارة والفئة والفرع. إيراد محصّل ومُرحَّل فقط؛ وافق ثم علّم كمدفوع. يرى الطبيب كشفه فقط دون تعديل الدفتر.",
    tagsEn: ["commission", "revenue-share", "statement"],
    tagsAr: ["عمولة", "حصة", "كشف"],
  },
  {
    id: "kiorex-listing",
    questionId: "q13-kiorex-listing",
    tiers: ["LITE", "PRO", "CLINIC", "GROUP"],
    category: "kiorex",
    titleEn: "How do I list on Kiorex and what is the commission?",
    titleAr: "كيف أنشر على كيوركس وما العمولة؟",
    bodyEn:
      "Kiorex tab → complete provider profile and marketplace listing. Commission is market-pack based and appears on the monthly statement; clinic booking links stay commission-free. Use the marketing calculator to see patients needed to offset SaaS.",
    bodyAr:
      "تبويب كيوركس ← أكمل ملف المزود والقائمة. العمولة من حزمة السوق وتظهر في الكشف الشهري؛ روابط حجز العيادة بدون عمولة. استخدم حاسبة التسويق لمعرفة عدد المرضى لتعويض الاشتراك.",
    tagsEn: ["kiorex", "commission", "listing"],
    tagsAr: ["كيوركس", "عمولة", "قائمة"],
  },
  {
    id: "upgrade-plan",
    questionId: "q14-upgrade-plan",
    tiers: ["ALL"],
    category: "account",
    titleEn: "How do I upgrade my plan or buy seats?",
    titleAr: "كيف أرقّي الباقة أو أشتري مقاعد؟",
    bodyEn:
      "Admin / billing → change plan or add clinician seats. Entitlement-gated screens show Upgrade when a feature needs a higher plan (HTTP 402). Annual prices are shown as monthly equivalents on marketing pages.",
    bodyAr:
      "الإدارة / الفوترة ← غيّر الباقة أو أضف مقاعد أطباء. الشاشات المقيّدة تظهر ترقية عند الحاجة (HTTP 402). الأسعار السنوية تظهر كمكافئ شهري في صفحات التسويق.",
    tagsEn: ["upgrade", "seats", "billing"],
    tagsAr: ["ترقية", "مقاعد", "فوترة"],
  },
  {
    id: "mfa-security",
    questionId: "q15-mfa-security",
    tiers: ["ALL"],
    category: "account",
    titleEn: "How do I turn on MFA for physicians?",
    titleAr: "كيف أفعّل المصادقة الثنائية للأطباء؟",
    bodyEn:
      "Profile → Security → enable MFA (TOTP or WhatsApp OTP for physicians). Production-like environments enforce MFA after a grace period; billing is blocked until enrolled.",
    bodyAr:
      "الملف ← الأمان ← فعّل المصادقة الثنائية (TOTP أو واتساب للأطباء). البيئات الشبيهة بالإنتاج تفرضها بعد فترة سماح؛ تُحجب الفوترة حتى التسجيل.",
    tagsEn: ["mfa", "security", "otp"],
    tagsAr: ["مصادقة", "أمان", "otp"],
  },
  {
    id: "export-privacy",
    questionId: "q16-export-privacy",
    tiers: ["ALL"],
    category: "account",
    titleEn: "How do I export patient or tenant data?",
    titleAr: "كيف أصدّر بيانات المريض أو المستأجر؟",
    bodyEn:
      "Privacy → request a tenant or patient export. Exports work even when the subscription is suspended. Offboarding and legal hold follow the same screen.",
    bodyAr:
      "الخصوصية ← اطلب تصدير المستأجر أو المريض. التصدير يعمل حتى مع تعليق الاشتراك. الإغلاق والحجز القانوني من الشاشة نفسها.",
    tagsEn: ["export", "privacy", "gdpr"],
    tagsAr: ["تصدير", "خصوصية", "بيانات"],
  },
  {
    id: "support-access",
    questionId: "q17-support-access",
    tiers: ["ALL"],
    category: "account",
    titleEn: "How does Kiorly support access my clinic with consent?",
    titleAr: "كيف يصل دعم كيورلي لعيادتي بموافقة؟",
    bodyEn:
      "When you open a support ticket that needs staff eyes on data, approve a time-boxed Support Access session. PHI is masked in audit logs; revoke anytime from Customer support.",
    bodyAr:
      "عند تذكرة تحتاج اطلاع الدعم، وافق على جلسة وصول محدودة زمنيًا. تُخفى البيانات الحساسة في سجلات التدقيق؛ يمكن الإلغاء في أي وقت من دعم العملاء.",
    tagsEn: ["support", "consent", "access"],
    tagsAr: ["دعم", "موافقة", "وصول"],
  },
  {
    id: "reports-export",
    questionId: "q18-reports-export",
    tiers: ["PRO", "CLINIC", "GROUP"],
    category: "billing",
    titleEn: "How do I download operations or Kiorex reports?",
    titleAr: "كيف أحمّل تقارير التشغيل أو كيوركس؟",
    bodyEn:
      "Reports → pick Operations or Kiorex period → Export xlsx/PDF. Money columns respect role visibility. Optional weekly schedule digests go to email/WhatsApp for owners who opted in. Hand the export to your accountant: Kiorly never reports to a tax authority, you and your accountant file your own taxes (Docs: NO_TAX_AUTHORITY_REPORTING.md).",
    bodyAr:
      "التقارير ← اختر التشغيل أو فترة كيوركس ← صدّر xlsx/PDF. أعمدة المال تحترم صلاحية الدور. ملخص الجدول الأسبوعي اختياري للبريد/واتساب للملاك المشتركين. سلّم الملف لمحاسبك: لا تُبلّغ Kiorly أي جهة ضريبية، وأنت ومحاسبك تقدّمان إقراراتكما بأنفسكما (الوثيقة: NO_TAX_AUTHORITY_REPORTING.md).",
    tagsEn: ["reports", "export", "kiorex", "tax", "accountant"],
    tagsAr: ["تقارير", "تصدير", "كيوركس", "ضريبة", "محاسب"],
  },
  {
    id: "ai-scribe",
    questionId: "q19-ai-scribe",
    tiers: ["CLINIC", "GROUP"],
    category: "clinical",
    titleEn: "How does the AI scribe draft a visit note?",
    titleAr: "كيف يكتب المساعد الذكي مسودة الزيارة؟",
    bodyEn:
      "On Clinic+ with the AI scribe add-on, record audio in the encounter, approve the draft SOAP/Rx, then purge or retain audio per consent. Minutes meter against your quota; Lite shows an upgrade hint.",
    bodyAr:
      "في عيادة+ مع إضافة الكاتب الذكي، سجّل الصوت في الزيارة، اعتمد مسودة SOAP/الوصفة، ثم احذف أو احتفظ بالصوت حسب الموافقة. الدقائق تُحسب من الحصة؛ لايت يعرض تلميح ترقية.",
    tagsEn: ["ai", "scribe", "audio"],
    tagsAr: ["ذكاء", "كاتب", "صوت"],
  },
  {
    id: "sample-patient",
    questionId: "q20-sample-patient",
    tiers: ["ALL"],
    category: "gettingStarted",
    titleEn: "What is the sample patient and is it safe to practise on?",
    titleAr: "ما المريض التجريبي وهل هو آمن للتدريب؟",
    bodyEn:
      "Help → Try with sample patient creates a clearly marked demo chart and fee-free appointment. It never posts revenue, commissions or WhatsApp; remove it anytime from Help. Use it with the first-run tour.",
    bodyAr:
      "المساعدة ← جرّب بمريض تجريبي ينشئ ملفًا مُعلَّمًا وموعدًا بدون رسوم. لا يُرحَّل إيراد ولا عمولة ولا واتساب؛ احذفه في أي وقت من المساعدة. استخدمه مع الجولة الأولى.",
    tagsEn: ["sample", "demo", "tour"],
    tagsAr: ["تجريبي", "تدريب", "جولة"],
  },
];

export const TOP_SUPPORT_QUESTION_IDS = HELP_ARTICLES.map((a) => a.questionId);

export function articlesForTier(tier: HelpPlanTier | string | null | undefined): HelpArticle[] {
  if (!tier || tier === "ALL") return HELP_ARTICLES;
  const key = String(tier).toUpperCase();
  return HELP_ARTICLES.filter((a) => a.tiers.includes("ALL") || a.tiers.includes(key as HelpPlanTier));
}

export function searchHelpArticles(
  query: string,
  opts?: { tier?: HelpPlanTier | string | null; locale?: "en" | "ar" },
): HelpArticle[] {
  const base = articlesForTier(opts?.tier);
  const q = query.trim().toLowerCase();
  if (!q) return base;
  const ar = opts?.locale === "ar";
  return base.filter((a) => {
    const hay = [
      a.id,
      a.questionId,
      a.category,
      a.titleEn,
      a.titleAr,
      a.bodyEn,
      a.bodyAr,
      ...(ar ? a.tagsAr : a.tagsEn),
      ...a.tagsEn,
      ...a.tagsAr,
    ]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((token) => hay.includes(token));
  });
}

export function articleById(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}
