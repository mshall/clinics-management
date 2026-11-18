import { ClinicalSpecialty } from "@prisma/client";

export type DefaultFormField = {
  id: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox" | "date" | "computed";
  labelEn: string;
  labelAr: string;
  options?: string[];
  /** `computed` fields: derived in the UI from `source` (stored with the response for the record). */
  computed?: "EDD_FROM_LMP" | "GA_FROM_LMP";
  source?: string;
};

export type DefaultFormSection = {
  id: string;
  titleEn: string;
  titleAr: string;
  fields: DefaultFormField[];
};

/** Bump when built-in template content changes; system rows below this version are upgraded in place. */
export const SYSTEM_TEMPLATE_VERSION = 2;

export const SYSTEM_DEFAULT_FORM_SPECIALTIES: ClinicalSpecialty[] = [
  ClinicalSpecialty.POLYCLINIC,
  ClinicalSpecialty.GENERAL_MEDICINE,
  ClinicalSpecialty.PAIN_MANAGEMENT,
  ClinicalSpecialty.ORTHOPEDICS,
  ClinicalSpecialty.PEDIATRICS,
  ClinicalSpecialty.DERMATOLOGY,
  ClinicalSpecialty.DENTISTRY,
  ClinicalSpecialty.PHYSIO_THERAPY,
  ClinicalSpecialty.AESTHETICS,
  ClinicalSpecialty.CARDIOLOGY,
  ClinicalSpecialty.OBSTETRICS_GYNECOLOGY,
  ClinicalSpecialty.ENT,
  ClinicalSpecialty.OPHTHALMOLOGY,
  ClinicalSpecialty.PSYCHIATRY,
  ClinicalSpecialty.RADIOLOGY,
  ClinicalSpecialty.LABORATORY,
  ClinicalSpecialty.INTERNAL_MEDICINE,
  ClinicalSpecialty.FAMILY_MEDICINE,
  ClinicalSpecialty.UROLOGY,
];

function f(
  id: string,
  labelEn: string,
  labelAr: string,
  type: DefaultFormField["type"] = "textarea",
  options?: string[],
): DefaultFormField {
  return { id, type, labelEn, labelAr, ...(options ? { options } : {}) };
}

function n(id: string, labelEn: string, labelAr: string): DefaultFormField {
  return f(id, labelEn, labelAr, "number");
}

function t(id: string, labelEn: string, labelAr: string): DefaultFormField {
  return f(id, labelEn, labelAr, "text");
}

function sel(id: string, labelEn: string, labelAr: string, options: string[]): DefaultFormField {
  return f(id, labelEn, labelAr, "select", options);
}

function chk(id: string, labelEn: string, labelAr: string): DefaultFormField {
  return f(id, labelEn, labelAr, "checkbox");
}

function section(id: string, titleEn: string, titleAr: string, fields: DefaultFormField[]): DefaultFormSection {
  return { id, titleEn, titleAr, fields };
}

const SIDE = ["Left", "Right", "Bilateral"];

const baseHistory = (): DefaultFormSection =>
  section("history", "History & presenting complaint", "التاريخ والشكوى الرئيسية", [
    f("chief_complaint", "Chief complaint", "الشكوى الرئيسية"),
    f("history_present", "History of present illness", "تاريخ المرض الحالي"),
    f("past_medical", "Past medical / surgical history", "التاريخ الطبي والجراحي"),
    f("medications", "Current medications", "الأدوية الحالية"),
    f("allergies", "Allergies (confirm chart)", "الحساسية (تأكيد من الملف)"),
  ]);

const baseExam = (extra: DefaultFormField[]): DefaultFormSection =>
  section("examination", "Physical examination", "الفحص السريري", [
    f("general", "General appearance", "المظهر العام"),
    f("vitals_review", "Vitals review", "مراجعة العلامات الحيوية"),
    ...extra,
  ]);

const basePlan = (extra: DefaultFormField[] = []): DefaultFormSection =>
  section("plan", "Assessment & plan", "التقييم والخطة", [
    f("assessment", "Clinical assessment", "التقييم السريري"),
    f("investigations", "Investigations ordered", "الفحوصات المطلوبة"),
    f("treatment", "Treatment / prescriptions", "العلاج / الوصفات"),
    f("follow_up", "Follow-up & patient education", "المتابعة وتثقيف المريض"),
    ...extra,
  ]);

const baseSafety = (): DefaultFormSection =>
  section("safety", "Safety & consent", "السلامة والموافقة", [
    f("red_flags", "Red flags / escalation", "علامات الخطر / التصعيد"),
    sel("consent", "Consent discussed", "تمت مناقشة الموافقة", ["Yes", "N/A"]),
  ]);

export const SPECIALTY_LABELS: Record<ClinicalSpecialty, { en: string; ar: string }> = {
  POLYCLINIC: { en: "Polyclinic", ar: "عيادة متعددة التخصصات" },
  GENERAL_MEDICINE: { en: "General medicine", ar: "طب عام" },
  PAIN_MANAGEMENT: { en: "Pain management", ar: "إدارة الألم" },
  ORTHOPEDICS: { en: "Orthopedics", ar: "عظام" },
  PEDIATRICS: { en: "Pediatrics", ar: "أطفال" },
  DERMATOLOGY: { en: "Dermatology", ar: "جلدية" },
  DENTISTRY: { en: "Dentistry", ar: "أسنان" },
  PHYSIO_THERAPY: { en: "Physiotherapy", ar: "علاج طبيعي" },
  AESTHETICS: { en: "Aesthetics", ar: "تجميل" },
  CARDIOLOGY: { en: "Cardiology", ar: "قلب" },
  OBSTETRICS_GYNECOLOGY: { en: "OB / GYN", ar: "نساء وتوليد" },
  ENT: { en: "ENT", ar: "أنف وأذن وحنجرة" },
  OPHTHALMOLOGY: { en: "Ophthalmology", ar: "عيون" },
  PSYCHIATRY: { en: "Psychiatry", ar: "طب نفسي" },
  RADIOLOGY: { en: "Radiology", ar: "أشعة" },
  LABORATORY: { en: "Laboratory", ar: "مختبر" },
  INTERNAL_MEDICINE: { en: "Internal medicine", ar: "باطنية" },
  FAMILY_MEDICINE: { en: "Family medicine", ar: "طب الأسرة" },
  UROLOGY: { en: "Urology", ar: "مسالك بولية" },
  CUSTOM: { en: "Custom", ar: "مخصص" },
};

type SpecialtyParts = { exam: DefaultFormField[]; extra: DefaultFormSection[]; plan?: DefaultFormField[] };

function specialtyParts(specialty: ClinicalSpecialty): SpecialtyParts {
  switch (specialty) {
    case ClinicalSpecialty.PAIN_MANAGEMENT:
      return {
        exam: [
          f("pain_site", "Pain site / radiation", "موقع الألم / الانتشار"),
          n("pain_score", "Pain score (0–10)", "درجة الألم (0–10)"),
          f("functional_impact", "Functional impact", "التأثير على الوظائف"),
        ],
        extra: [
          section("interventions", "Pain interventions", "تدخلات الألم", [
            f("modalities", "Modalities (injection, RF, PT, …)", "الوسائل (حقن، تردد، علاج طبيعي…)"),
            f("opioid_risk", "Opioid risk review", "مراجعة مخاطر المواد الأفيونية"),
          ]),
        ],
      };
    case ClinicalSpecialty.ORTHOPEDICS:
      return {
        exam: [
          f("joint", "Joint / region examined", "المفصل / المنطقة"),
          sel("side", "Side", "الجانب", SIDE),
          f("inspection", "Inspection (swelling, deformity, wasting)", "الملاحظة (تورم، تشوه، ضمور)"),
          f("rom", "Range of motion", "مدى الحركة"),
          f("special_tests", "Special tests (e.g. Lachman, McMurray, SLR)", "اختبارات خاصة (لاكمان، ماكموري، رفع الساق)"),
          f("neurovascular", "Neurovascular status", "الحالة العصبية الوعائية"),
          n("pain_score", "Pain score (0–10)", "درجة الألم (0–10)"),
        ],
        extra: [
          section("ortho_history", "Injury & function", "الإصابة والوظيفة", [
            f("mechanism", "Mechanism of injury", "آلية الإصابة"),
            sel("weight_bearing", "Weight bearing", "تحمّل الوزن", ["Full", "Partial", "Non-weight bearing"]),
            f("imaging_review", "X-ray / MRI review", "مراجعة الأشعة / الرنين"),
          ]),
        ],
        plan: [
          f("immobilisation", "Immobilisation / brace / cast", "التثبيت / الدعامة / الجبيرة"),
          chk("physio_referral", "Physiotherapy referral", "تحويل للعلاج الطبيعي"),
        ],
      };
    case ClinicalSpecialty.PEDIATRICS:
      return {
        exam: [
          f("growth", "Growth & development notes", "النمو والتطور"),
          f("immunization", "Immunization status", "حالة التطعيم"),
          f("systems_peds", "Chest, abdomen, ENT, skin findings", "نتائج الصدر والبطن والأنف والأذن والجلد"),
        ],
        extra: [
          section("growth_chart", "Growth (plotted on the growth chart)", "النمو (يُرسم على منحنى النمو)", [
            n("weight_kg", "Weight (kg)", "الوزن (كجم)"),
            n("height_cm", "Length / height (cm)", "الطول (سم)"),
            n("head_circ_cm", "Head circumference (cm)", "محيط الرأس (سم)"),
            t("percentiles", "Percentiles (weight / height / HC)", "المئين (الوزن / الطول / محيط الرأس)"),
            f("milestones", "Developmental milestones", "مراحل التطور"),
            sel("feeding", "Feeding", "التغذية", ["Breast", "Formula", "Mixed", "Family diet"]),
          ]),
          section("guardian", "Guardian & safety", "ولي الأمر والسلامة", [
            t("guardian", "Guardian present", "ولي الأمر حاضر"),
            f("safeguarding", "Safeguarding concerns", "مخاوف الحماية"),
          ]),
        ],
      };
    case ClinicalSpecialty.DERMATOLOGY:
      return {
        exam: [
          f("lesion_desc", "Lesion description (site, size, colour)", "وصف الآفة (الموقع، الحجم، اللون)"),
          sel("morphology", "Primary morphology", "الشكل الأساسي", [
            "Macule",
            "Papule",
            "Plaque",
            "Nodule",
            "Vesicle / bulla",
            "Pustule",
            "Ulcer",
            "Scale",
          ]),
          t("distribution", "Distribution", "التوزيع"),
          n("bsa_pct", "Body surface area affected (%)", "نسبة مساحة الجلد المصابة (%)"),
          n("itch_score", "Itch score (0–10)", "درجة الحكة (0–10)"),
          sel("fitzpatrick", "Fitzpatrick skin type", "نوع البشرة (فيتزباتريك)", ["I", "II", "III", "IV", "V", "VI"]),
          f("dermoscopy", "Dermoscopy / punch plan", "الفحص الجلدي / خطة الخزعة"),
        ],
        extra: [
          section("derm_history", "Skin history", "تاريخ الجلد", [
            t("duration", "Duration", "المدة"),
            f("triggers", "Triggers (sun, cosmetics, food, stress)", "المحفزات (شمس، مستحضرات، طعام، توتر)"),
            f("previous_treatment", "Previous treatment & response", "العلاج السابق والاستجابة"),
          ]),
        ],
        plan: [chk("photo_consent", "Clinical photos taken with consent", "صور سريرية بموافقة المريض")],
      };
    case ClinicalSpecialty.DENTISTRY:
      return {
        exam: [],
        extra: [
          section("dental", "Dental examination", "فحص الأسنان", [
            t("tooth_number", "Tooth number(s) (FDI)", "رقم السن (FDI)"),
            sel("pain_type", "Pain", "الألم", ["None", "Sensitivity", "Spontaneous", "On biting", "Night pain"]),
            f("tooth_chart", "Tooth / quadrant notes", "ملاحظات السن / الربع"),
            f("caries", "Caries findings", "نتائج التسوس"),
            f("periodontal", "Periodontal assessment", "تقييم اللثة"),
            sel("oral_hygiene", "Oral hygiene", "نظافة الفم", ["Good", "Fair", "Poor"]),
            f("occlusion", "Occlusion", "الإطباق"),
            f("radiographs", "Radiographs (PA / OPG)", "الأشعة (ذروية / بانوراما)"),
          ]),
          section("treatment_dental", "Dental treatment plan", "خطة علاج الأسنان", [
            f("procedures", "Procedures today", "الإجراءات اليوم"),
            f("anesthesia", "Anesthesia / analgesia", "التخدير / المسكن"),
            f("next_visit", "Next visit plan", "خطة الزيارة القادمة"),
          ]),
        ],
      };
    case ClinicalSpecialty.PHYSIO_THERAPY:
      return {
        exam: [],
        extra: [
          section("pt_assessment", "PT assessment", "تقييم العلاج الطبيعي", [
            f("chief_region", "Chief region", "المنطقة الرئيسية"),
            f("posture_gait", "Posture & gait", "الوضعية والمشية"),
            f("rom_strength", "ROM & strength", "مدى الحركة والقوة"),
          ]),
          section("pt_plan", "PT plan", "خطة العلاج الطبيعي", [
            f("goals", "Functional goals", "الأهداف الوظيفية"),
            f("exercises", "Exercises / modalities", "التمارين / الوسائل"),
            n("sessions", "Sessions prescribed", "الجلسات الموصوفة"),
          ]),
        ],
      };
    case ClinicalSpecialty.OBSTETRICS_GYNECOLOGY:
      return {
        exam: [
          t("lmp", "LMP / gestational age", "آخر دورة / عمر الحمل"),
          f("ob_history", "Obstetric history", "التاريخ التوليدي"),
        ],
        extra: [
          section("pregnancy_dating", "Pregnancy dating", "حساب الحمل", [
            f("lmp_date", "LMP (first day of last period)", "أول يوم لآخر دورة", "date"),
            {
              ...f("edd", "EDD (Naegele, LMP + 280 days)", "موعد الولادة المتوقع (آخر دورة + ٢٨٠ يوم)", "computed"),
              computed: "EDD_FROM_LMP",
              source: "lmp_date",
            },
            {
              ...f("ga", "Gestational age today", "عمر الحمل اليوم", "computed"),
              computed: "GA_FROM_LMP",
              source: "lmp_date",
            },
            n("gravida", "Gravida", "عدد مرات الحمل"),
            n("para", "Para", "عدد الولادات"),
            n("abortions", "Abortions / miscarriages", "الإجهاض"),
          ]),
          section("antenatal", "Antenatal visit", "زيارة متابعة الحمل", [
            n("fundal_height_cm", "Fundal height (cm)", "ارتفاع قاع الرحم (سم)"),
            n("fhr", "Fetal heart rate (bpm)", "نبض الجنين (نبضة/دقيقة)"),
            sel("presentation", "Presentation", "المجيء", ["Cephalic", "Breech", "Transverse", "N/A"]),
            f("ultrasound", "Ultrasound findings", "نتائج السونار"),
          ]),
          section("gyn_exam", "GYN examination", "فحص نسائي", [
            f("pelvic", "Pelvic exam findings", "نتائج الفحص الحوضي"),
            f("pregnancy_risk", "Pregnancy risk factors", "عوامل خطر الحمل"),
            t("contraception", "Contraception", "وسيلة منع الحمل"),
            t("cervical_screening", "Last cervical screening", "آخر فحص لعنق الرحم"),
          ]),
        ],
      };
    case ClinicalSpecialty.CARDIOLOGY:
      return {
        exam: [
          f("cvs", "Cardiovascular exam", "فحص القلب والأوعية"),
          f("murmurs", "Heart sounds / murmurs", "أصوات القلب / النفخات"),
          t("jvp", "JVP", "ضغط الوريد الوداجي"),
          sel("edema", "Peripheral edema", "تورم الأطراف", ["None", "+", "++", "+++"]),
          f("ecg_echo", "ECG / echo summary", "ملخص تخطيط القلب / الإيكو"),
          n("lvef_pct", "LVEF (%)", "الكسر القذفي (%)"),
        ],
        extra: [
          section("cardiac_history", "Cardiac history", "التاريخ القلبي", [
            f("chest_pain", "Chest pain character", "طبيعة ألم الصدر"),
            sel("nyha", "NYHA class", "تصنيف NYHA", ["I", "II", "III", "IV"]),
            f("risk_factors", "Risk factors (smoking, DM, HTN, lipids, family history)", "عوامل الخطر (تدخين، سكر، ضغط، دهون، تاريخ عائلي)"),
          ]),
        ],
      };
    case ClinicalSpecialty.PSYCHIATRY:
      return {
        exam: [],
        extra: [
          section("mse", "Mental status", "الحالة العقلية", [
            f("appearance", "Appearance & behaviour", "المظهر والسلوك"),
            f("speech", "Speech", "الكلام"),
            f("mood", "Mood / affect", "المزاج / التأثير"),
            f("thought", "Thought content / risk", "محتوى التفكير / الخطر"),
            f("perception", "Perception (hallucinations)", "الإدراك (الهلاوس)"),
            f("cognition", "Cognition", "الإدراك المعرفي"),
            f("insight", "Insight & judgment", "البصيرة والحكم"),
          ]),
          section("psych_risk", "Risk & scales", "الخطورة والمقاييس", [
            sel("suicide_risk", "Suicide / self-harm risk", "خطر الانتحار / إيذاء النفس", ["Low", "Moderate", "High"]),
            n("phq9", "PHQ-9 score", "درجة PHQ-9"),
            n("gad7", "GAD-7 score", "درجة GAD-7"),
            f("substance_use", "Substance use", "تعاطي المواد"),
            f("safety_plan", "Safety plan", "خطة السلامة"),
          ]),
        ],
      };
    case ClinicalSpecialty.RADIOLOGY:
      return {
        exam: [],
        extra: [
          section("imaging", "Imaging request / report", "طلب / تقرير الأشعة", [
            f("modality", "Modality (X-ray, US, CT, MRI)", "النوع (أشعة، سونار، مقطعية…)"),
            f("clinical_indication", "Clinical indication", "المؤشر السريري"),
            f("findings", "Findings", "النتائج"),
            f("impression", "Impression", "الانطباع"),
          ]),
        ],
      };
    case ClinicalSpecialty.LABORATORY:
      return {
        exam: [],
        extra: [
          section("lab", "Laboratory", "المختبر", [
            f("tests_ordered", "Tests ordered", "الفحوصات المطلوبة"),
            f("specimen", "Specimen & fasting", "العينة والصيام"),
            f("critical", "Critical results communicated", "إبلاغ النتائج الحرجة"),
          ]),
        ],
      };
    case ClinicalSpecialty.ENT:
      return {
        exam: [
          f("ent_exam", "ENT examination", "فحص أنف وأذن وحنجرة"),
          f("otoscopy_right", "Otoscopy — right ear", "منظار الأذن — اليمنى"),
          f("otoscopy_left", "Otoscopy — left ear", "منظار الأذن — اليسرى"),
          f("hearing", "Hearing / tympanic membrane", "السمع / طبلة الأذن"),
          t("tuning_fork", "Tuning fork (Rinne / Weber)", "الشوكة الرنانة (رِنّي / ويبر)"),
          f("nose", "Nose / septum / endoscopy", "الأنف / الحاجز / المنظار"),
          f("throat", "Throat / tonsils", "الحلق / اللوزتين"),
          f("neck", "Neck nodes", "الغدد الليمفاوية بالرقبة"),
        ],
        extra: [],
        plan: [chk("vertigo", "Vertigo / balance assessment needed", "يحتاج تقييم الدوار / الاتزان")],
      };
    case ClinicalSpecialty.OPHTHALMOLOGY:
      return {
        exam: [
          t("visual_acuity", "Visual acuity", "حدة البصر"),
          t("va_right", "VA right (with / without correction)", "حدة البصر — اليمنى"),
          t("va_left", "VA left (with / without correction)", "حدة البصر — اليسرى"),
          n("iop_right", "IOP right (mmHg)", "ضغط العين — اليمنى (مم زئبق)"),
          n("iop_left", "IOP left (mmHg)", "ضغط العين — اليسرى (مم زئبق)"),
          f("pupils", "Pupils", "حدقة العين"),
          f("slit_lamp", "Slit lamp / fundus", "المشبك / قاع العين"),
          t("refraction", "Refraction", "مقاس النظر"),
        ],
        extra: [],
      };
    case ClinicalSpecialty.AESTHETICS:
      return {
        exam: [f("area", "Treatment area", "منطقة العلاج"), f("skin_type", "Fitzpatrick / skin type", "نوع البشرة")],
        extra: [
          section("aesthetic_plan", "Aesthetic plan", "خطة التجميل", [
            f("procedure", "Procedure & product", "الإجراء والمنتج"),
            f("consent_photo", "Consent & photos", "الموافقة والصور"),
          ]),
        ],
      };
    case ClinicalSpecialty.INTERNAL_MEDICINE:
      return {
        exam: [
          f("systems", "Focused systems review", "مراجعة الأجهزة المركزة"),
          f("exam_findings", "Examination findings", "نتائج الفحص"),
          f("chest", "Chest", "الصدر"),
          f("abdomen", "Abdomen", "البطن"),
        ],
        extra: [
          section("chronic_review", "Chronic disease review", "مراجعة الأمراض المزمنة", [
            n("hba1c", "Latest HbA1c (%)", "آخر سكر تراكمي (%)"),
            t("bp_control", "Blood pressure control", "التحكم في ضغط الدم"),
            t("renal", "Renal function (creatinine / eGFR)", "وظائف الكلى (كرياتينين / eGFR)"),
            t("lipids", "Lipid profile", "دهون الدم"),
            f("labs_review", "Other labs reviewed", "تحاليل أخرى تمت مراجعتها"),
          ]),
        ],
      };
    case ClinicalSpecialty.UROLOGY:
      return {
        exam: [
          f("abdomen_flank", "Abdomen / renal angle", "البطن / زاوية الكلى"),
          f("genital_exam", "External genitalia", "الأعضاء التناسلية الخارجية"),
          f("dre", "DRE / prostate", "الفحص الشرجي / البروستاتا"),
        ],
        extra: [
          section("uro_history", "Urinary symptoms", "أعراض المسالك البولية", [
            n("ipss", "IPSS score (0–35)", "درجة IPSS (0–35)"),
            chk("hematuria", "Hematuria", "دم في البول"),
            f("luts", "LUTS (frequency, urgency, nocturia, stream)", "أعراض المسالك السفلية (تكرار، إلحاح، تبول ليلي، قوة التدفق)"),
            f("stone_history", "Stone history", "تاريخ الحصوات"),
          ]),
          section("uro_investigations", "Urology investigations", "فحوصات المسالك", [
            t("urinalysis", "Urinalysis", "تحليل البول"),
            n("psa", "PSA (ng/mL)", "PSA (نانوجرام/مل)"),
            f("us_kub", "Ultrasound KUB / post-void residual", "سونار الكلى والمثانة / المتبقي بعد التبول"),
          ]),
        ],
      };
    default:
      return {
        exam: [
          f("systems", "Focused systems review", "مراجعة الأجهزة المركزة"),
          f("exam_findings", "Examination findings", "نتائج الفحص"),
        ],
        extra: [],
      };
  }
}

export function defaultFormTemplateMeta(specialty: ClinicalSpecialty): {
  name: string;
  description: string;
  sectionsJson: DefaultFormSection[];
} {
  const L = SPECIALTY_LABELS[specialty] ?? SPECIALTY_LABELS.GENERAL_MEDICINE;
  const { exam, extra, plan } = specialtyParts(specialty);
  const sections: DefaultFormSection[] = [
    baseHistory(),
    ...extra,
    ...(exam.length || !extra.length ? [baseExam(exam)] : []),
    basePlan(plan ?? []),
    baseSafety(),
  ];
  return {
    name: `Default · ${L.en}`,
    description: `قالب افتراضي · ${L.ar} — English & Arabic field labels.`,
    sectionsJson: sections,
  };
}

type TemplatePrisma = {
  clinicalFormTemplate: {
    findFirst: (args: unknown) => Promise<{ id: string; systemTemplateVersion?: number | null } | null>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
};

/**
 * Seeds one built-in template per specialty and upgrades older built-in rows in place.
 * Field ids are stable across versions so saved encounter responses keep rendering.
 */
export async function ensureTenantDefaultClinicalFormTemplates(prisma: TemplatePrisma, tenantId: string): Promise<void> {
  for (const specialty of SYSTEM_DEFAULT_FORM_SPECIALTIES) {
    const meta = defaultFormTemplateMeta(specialty);
    const exists = await prisma.clinicalFormTemplate.findFirst({
      where: { tenantId, specialty, isSystemDefault: true, clinicId: null },
      select: { id: true, systemTemplateVersion: true },
    });
    if (exists) {
      if ((exists.systemTemplateVersion ?? 1) >= SYSTEM_TEMPLATE_VERSION) continue;
      await prisma.clinicalFormTemplate.update({
        where: { id: exists.id },
        data: {
          name: meta.name,
          description: meta.description,
          sectionsJson: meta.sectionsJson,
          systemTemplateVersion: SYSTEM_TEMPLATE_VERSION,
        },
      });
      continue;
    }
    await prisma.clinicalFormTemplate.create({
      data: {
        tenantId,
        specialty,
        name: meta.name,
        description: meta.description,
        sectionsJson: meta.sectionsJson,
        isPublished: true,
        isSystemDefault: true,
        systemTemplateVersion: SYSTEM_TEMPLATE_VERSION,
        ownerUserId: null,
        clinicId: null,
      },
    });
  }
}
