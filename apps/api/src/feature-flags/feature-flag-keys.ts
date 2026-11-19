/**
 * FF01 — canonical feature-flag registry for Kiorly Clinic (KX-08 §09, KX-05 §08).
 *
 * Every capability that the Kiorex super admin can switch off has one entry here, with class, scopes,
 * dependencies and AR/EN copy. `ff01-registry.node.test.ts` fails CI when code references a key that is not
 * registered, when the registry drifts from `kiorex-contracts/flags/catalogue.json`, or when a safety control
 * (ADR-025) is gated.
 */

/** The five keys that existed before Kiorex v2 — stable, used by plan entitlements and the local admin UI. */
export const FEATURE_FLAG_KEYS = [
  "ai_assistant",
  "whatsapp_reminders",
  "instapay",
  "fawry",
  "card_payments",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FlagScopeName = "global" | "market" | "org";
export type FlagClass = "Module" | "Commercial" | "Integration" | "AI" | "Launch-locked";
export type FlagProduct = "kiorly-clinic" | "kiorex" | "kiorex-account" | "kiorly-pharmacy" | "kiorly-lab";

export type FlagDefinition = {
  key: string;
  product: FlagProduct;
  scopes: readonly FlagScopeName[];
  class: FlagClass;
  dependsOn: readonly string[];
  launchLocked: boolean;
  /** Human-readable gate that must be recorded in the super admin before a launch-locked flag is effective. */
  gate: string | null;
  /** True for `clinic.specialty_templates.<code>` style families. */
  keyPattern?: boolean;
  descriptionEn: string;
  descriptionAr: string;
  whenOffEn: string;
  whenOffAr: string;
};

const GMO = ["global", "market", "org"] as const;
const GM = ["global", "market"] as const;

type ClinicInput = Omit<FlagDefinition, "product" | "launchLocked" | "gate"> &
  Partial<Pick<FlagDefinition, "launchLocked" | "gate">>;

function clinic(def: ClinicInput): FlagDefinition {
  return { product: "kiorly-clinic", launchLocked: false, gate: null, ...def };
}

/** Flags owned by Kiorly Clinic. */
export const CLINIC_FLAG_DEFINITIONS: readonly FlagDefinition[] = [
  clinic({
    key: "clinic.kiorex_listing",
    scopes: GMO,
    class: "Module",
    dependsOn: ["kiorex.marketplace"],
    descriptionEn: "Doctor and clinic listings on the Kiorex marketplace",
    descriptionAr: "قوائم الأطباء والعيادات على سوق كيوريكس",
    whenOffEn: "Listings paused on Kiorex; confirmed bookings honoured; booking link still works",
    whenOffAr: "تتوقف القوائم مؤقتًا على كيوريكس؛ تُحترم الحجوزات المؤكدة؛ يظل رابط الحجز يعمل",
  }),
  clinic({
    key: "clinic.commission_settlement",
    scopes: GM,
    class: "Commercial",
    dependsOn: ["clinic.kiorex_listing"],
    descriptionEn: "Kiorex commission charges and monthly settlement",
    descriptionAr: "رسوم عمولة كيوريكس والتسوية الشهرية",
    whenOffEn: "New commission charges stop; invoices are subscription only; confirmed charges still settle",
    whenOffAr: "تتوقف رسوم العمولة الجديدة؛ تقتصر الفواتير على الاشتراك؛ تُسوّى الرسوم المؤكدة",
  }),
  clinic({
    key: "clinic.kiorly_pay_deposits",
    scopes: GMO,
    class: "Commercial",
    dependsOn: [],
    descriptionEn: "Deposit requirements and deposit links for appointments",
    descriptionAr: "متطلبات العربون وروابط دفعه للمواعيد",
    whenOffEn: "No new deposit requirements or links; existing deposits refund or convert per policy",
    whenOffAr: "لا متطلبات أو روابط عربون جديدة؛ تُرد العرابين القائمة أو تُحوَّل وفق السياسة",
  }),
  clinic({
    key: "whatsapp_reminders",
    scopes: GMO,
    class: "Integration",
    dependsOn: [],
    descriptionEn: "Outbound WhatsApp appointment reminders",
    descriptionAr: "تذكيرات المواعيد الصادرة عبر واتساب",
    whenOffEn: "Reminders stop; manual call list shown",
    whenOffAr: "تتوقف التذكيرات؛ تظهر قائمة اتصال يدوية",
  }),
  clinic({
    key: "clinic.whatsapp_inbound",
    scopes: GMO,
    class: "Integration",
    dependsOn: ["whatsapp_reminders"],
    descriptionEn: "Inbound WhatsApp replies that confirm, cancel or reschedule appointments",
    descriptionAr: "ردود واتساب الواردة التي تؤكد المواعيد أو تلغيها أو تعيد جدولتها",
    whenOffEn: "Replies no longer change appointments; routed to the inbox",
    whenOffAr: "لا تغيّر الردود المواعيد؛ تُوجَّه إلى صندوق الوارد",
  }),
  clinic({
    key: "instapay",
    scopes: GMO,
    class: "Integration",
    dependsOn: [],
    descriptionEn: "InstaPay transfer collection at check-in and billing",
    descriptionAr: "تحصيل تحويلات إنستاباي عند الاستقبال والفوترة",
    whenOffEn: "Method hidden at cashier; cash and other methods remain",
    whenOffAr: "تُخفى الطريقة عند الكاشير؛ يبقى النقد وباقي الطرق",
  }),
  clinic({
    key: "fawry",
    scopes: GMO,
    class: "Integration",
    dependsOn: [],
    descriptionEn: "Fawry transfer collection",
    descriptionAr: "تحصيل تحويلات فوري",
    whenOffEn: "Method hidden at cashier; cash and other methods remain",
    whenOffAr: "تُخفى الطريقة عند الكاشير؛ يبقى النقد وباقي الطرق",
  }),
  clinic({
    key: "card_payments",
    scopes: GMO,
    class: "Integration",
    dependsOn: [],
    descriptionEn: "Card payment allocation at cashier",
    descriptionAr: "تخصيص مدفوعات البطاقات عند الكاشير",
    whenOffEn: "Method hidden at cashier; cash and other methods remain",
    whenOffAr: "تُخفى الطريقة عند الكاشير؛ يبقى النقد وباقي الطرق",
  }),
  clinic({
    key: "ai_assistant",
    scopes: GMO,
    class: "AI",
    dependsOn: [],
    descriptionEn: "In-product AI assistant (chat completions via the market AI provider)",
    descriptionAr: "المساعد الذكي داخل المنتج (عبر مزوّد الذكاء الاصطناعي للسوق)",
    whenOffEn: "Widget hidden; chat returns 403",
    whenOffAr: "يُخفى المساعد؛ تعيد المحادثة 403",
  }),
  clinic({
    key: "clinic.ai_scribe",
    scopes: GMO,
    class: "AI",
    dependsOn: [],
    descriptionEn: "AI scribe that drafts encounter notes from visit audio",
    descriptionAr: "الكاتب الذكي الذي يصوغ ملاحظات الزيارة من التسجيل الصوتي",
    whenOffEn: "Record button hidden; signed notes unaffected",
    whenOffAr: "يُخفى زر التسجيل؛ لا تتأثر الملاحظات الموقّعة",
  }),
  clinic({
    key: "clinic.whatsapp_ai_receptionist",
    scopes: GMO,
    class: "Launch-locked",
    dependsOn: ["clinic.whatsapp_inbound"],
    launchLocked: true,
    gate: "Meta approval + consent copy",
    descriptionEn: "WhatsApp AI receptionist (Egyptian Arabic)",
    descriptionAr: "موظف الاستقبال الذكي على واتساب (بالعامية المصرية)",
    whenOffEn: "Inbound messages go to the human inbox",
    whenOffAr: "تذهب الرسائل الواردة إلى صندوق الوارد البشري",
  }),
  clinic({
    key: "clinic.no_show_risk",
    scopes: GMO,
    class: "AI",
    dependsOn: [],
    descriptionEn: "No-show risk scoring on appointments",
    descriptionAr: "تقدير خطر عدم الحضور للمواعيد",
    whenOffEn: "Risk chip hidden",
    whenOffAr: "تُخفى شارة الخطر",
  }),
  clinic({
    key: "clinic.waitlist_autofill",
    scopes: GMO,
    class: "Module",
    dependsOn: ["whatsapp_reminders"],
    descriptionEn: "Automatic waitlist offers when a slot frees up",
    descriptionAr: "عروض قائمة الانتظار التلقائية عند توفر موعد",
    whenOffEn: "Waitlist kept; no automatic offers",
    whenOffAr: "تبقى قائمة الانتظار؛ لا عروض تلقائية",
  }),
  clinic({
    key: "clinic.record_share_patient_app",
    scopes: GMO,
    class: "Module",
    dependsOn: ["kiorex.record_vault"],
    descriptionEn: "Consent-based record sharing with the patient app",
    descriptionAr: "مشاركة السجل بموافقة المريض مع تطبيق المريض",
    whenOffEn: "No new shares; existing shares stay visible to the patient",
    whenOffAr: "لا مشاركات جديدة؛ تبقى المشاركات القائمة ظاهرة للمريض",
  }),
  clinic({
    key: "clinic.eprescription_handoff",
    scopes: GMO,
    class: "Module",
    dependsOn: ["pharmacy.module"],
    descriptionEn: "e-Prescription handoff to Kiorly Pharmacy",
    descriptionAr: "تحويل الوصفة الإلكترونية إلى صيدلية كيورلي",
    whenOffEn: "Prescriptions are printed or sent by WhatsApp only",
    whenOffAr: "تُطبع الوصفات أو تُرسل عبر واتساب فقط",
  }),
  clinic({
    key: "clinic.lab_order_handoff",
    scopes: GMO,
    class: "Module",
    dependsOn: ["lab.module"],
    descriptionEn: "Lab order handoff to Kiorly Lab and result import",
    descriptionAr: "تحويل طلبات التحاليل إلى معمل كيورلي واستيراد النتائج",
    whenOffEn: "Lab orders are kept as records only",
    whenOffAr: "تبقى طلبات التحاليل كسجلات فقط",
  }),
  clinic({
    key: "clinic.payers_tpa",
    scopes: GMO,
    class: "Module",
    dependsOn: [],
    descriptionEn: "Company contracts and TPA claims",
    descriptionAr: "عقود الشركات ومطالبات شركات إدارة التأمين",
    whenOffEn: "Contract prices kept; no new claims",
    whenOffAr: "تبقى أسعار العقود؛ لا مطالبات جديدة",
  }),
  clinic({
    key: "clinic.specialty_templates.<code>",
    scopes: GM,
    class: "Launch-locked",
    dependsOn: [],
    launchLocked: true,
    gate: "Specialty board sign-off (NH010)",
    keyPattern: true,
    descriptionEn: "Built-in specialty encounter template (one flag per specialty code)",
    descriptionAr: "قالب الزيارة التخصصي المدمج (علم لكل تخصص)",
    whenOffEn: "Template hidden from new encounters",
    whenOffAr: "يُخفى القالب من الزيارات الجديدة",
  }),
  clinic({
    key: "clinic.referral_rewards",
    scopes: GM,
    class: "Commercial",
    dependsOn: [],
    descriptionEn: "Clinic referral codes and rewards",
    descriptionAr: "أكواد الإحالة ومكافآتها للعيادات",
    whenOffEn: "No new codes; earned credits honoured",
    whenOffAr: "لا أكواد جديدة؛ تُحترم الأرصدة المكتسبة",
  }),
  clinic({
    key: "clinic.field_rep_onboarding",
    scopes: GM,
    class: "Commercial",
    dependsOn: [],
    descriptionEn: "Field sales-rep onboarding codes at signup",
    descriptionAr: "أكواد مندوبي المبيعات الميدانيين عند التسجيل",
    whenOffEn: "Rep codes rejected at signup; earned commissions honoured",
    whenOffAr: "تُرفض أكواد المندوبين عند التسجيل؛ تُحترم العمولات المكتسبة",
  }),
];

/**
 * Parent keys owned by other products. Kiorly Clinic does not receive them in its own snapshot, so they
 * are treated as inherited ON unless a snapshot explicitly carries them.
 */
export const EXTERNAL_PARENT_FLAG_KEYS = [
  "kiorex.marketplace",
  "kiorex.record_vault",
  "pharmacy.module",
  "lab.module",
  "account.provider_sso",
] as const;

/** Concrete (non-pattern) keys owned by Kiorly Clinic. */
export const CLINIC_FLAG_KEYS: readonly string[] = CLINIC_FLAG_DEFINITIONS.filter((d) => !d.keyPattern).map((d) => d.key);

/** Prefix of the per-specialty template flag family. */
export const SPECIALTY_TEMPLATE_FLAG_PREFIX = "clinic.specialty_templates.";

/** Concrete key for a specialty template flag, e.g. `clinic.specialty_templates.dermatology`. */
export function specialtyTemplateFlagKey(specialtyCode: string): string {
  return `${SPECIALTY_TEMPLATE_FLAG_PREFIX}${specialtyCode.trim().toLowerCase()}`;
}

const SPECIALTY_CODE_RE = /^[a-z][a-z0-9_]{1,40}$/;

export function getFlagDefinition(key: string): FlagDefinition | null {
  const exact = CLINIC_FLAG_DEFINITIONS.find((d) => d.key === key && !d.keyPattern);
  if (exact) return exact;
  if (key.startsWith(SPECIALTY_TEMPLATE_FLAG_PREFIX)) {
    const code = key.slice(SPECIALTY_TEMPLATE_FLAG_PREFIX.length);
    if (SPECIALTY_CODE_RE.test(code)) {
      const family = CLINIC_FLAG_DEFINITIONS.find((d) => d.keyPattern);
      return family ? { ...family, key } : null;
    }
  }
  return null;
}

/** True for any key the registry knows (concrete key or a member of a key-pattern family). */
export function isKnownFeatureFlagKey(key: string): boolean {
  return getFlagDefinition(key) != null;
}

/** True only for the five pre-v2 keys that have DB-backed global/market/org rows. */
export function isLegacyFeatureFlagKey(key: string): key is FeatureFlagKey {
  return (FEATURE_FLAG_KEYS as readonly string[]).includes(key);
}

export function isKnownOrExternalFlagKey(key: string): boolean {
  return isKnownFeatureFlagKey(key) || (EXTERNAL_PARENT_FLAG_KEYS as readonly string[]).includes(key);
}

/** English descriptions of the legacy keys (back-compat for the pre-v2 admin UI). */
export const FEATURE_FLAG_DESCRIPTIONS: Record<FeatureFlagKey, string> = Object.fromEntries(
  FEATURE_FLAG_KEYS.map((k) => [k, getFlagDefinition(k)!.descriptionEn]),
) as Record<FeatureFlagKey, string>;

export function flagDescription(key: string, locale: "en" | "ar" = "en"): string {
  const def = getFlagDefinition(key);
  if (!def) return key;
  return locale === "ar" ? def.descriptionAr : def.descriptionEn;
}
