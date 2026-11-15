import { ClinicalSpecialty } from "@prisma/client";

export type DefaultFormField = {
  id: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox";
  labelEn: string;
  labelAr: string;
  options?: string[];
};

export type DefaultFormSection = {
  id: string;
  titleEn: string;
  titleAr: string;
  fields: DefaultFormField[];
};

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

function section(id: string, titleEn: string, titleAr: string, fields: DefaultFormField[]): DefaultFormSection {
  return { id, titleEn, titleAr, fields };
}

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
    f(
      "consent",
      "Consent discussed",
      "تمت مناقشة الموافقة",
      "select",
      ["Yes", "N/A"],
    ),
  ]);

export function defaultFormTemplateMeta(specialty: ClinicalSpecialty): {
  name: string;
  description: string;
  sectionsJson: DefaultFormSection[];
} {
  const labels: Record<ClinicalSpecialty, { en: string; ar: string }> = {
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
    CUSTOM: { en: "Custom", ar: "مخصص" },
  };

  const L = labels[specialty] ?? labels.GENERAL_MEDICINE;

  let specialtyExam: DefaultFormField[] = [];
  let specialtyExtra: DefaultFormSection[] = [];

  switch (specialty) {
    case ClinicalSpecialty.PAIN_MANAGEMENT:
      specialtyExam = [
        f("pain_site", "Pain site / radiation", "موقع الألم / الانتشار"),
        f("pain_score", "Pain score (0–10)", "درجة الألم (0–10)", "number"),
        f("functional_impact", "Functional impact", "التأثير على الوظائف"),
      ];
      specialtyExtra = [
        section("interventions", "Pain interventions", "تدخلات الألم", [
          f("modalities", "Modalities (injection, RF, PT, …)", "الوسائل (حقن، تردد، علاج طبيعي…)"),
          f("opioid_risk", "Opioid risk review", "مراجعة مخاطر المواد الأفيونية"),
        ]),
      ];
      break;
    case ClinicalSpecialty.ORTHOPEDICS:
      specialtyExam = [
        f("joint", "Joint / region examined", "المفصل / المنطقة"),
        f("rom", "Range of motion", "مدى الحركة"),
        f("neurovascular", "Neurovascular status", "الحالة العصبية الوعائية"),
      ];
      break;
    case ClinicalSpecialty.PEDIATRICS:
      specialtyExam = [
        f("growth", "Growth & development notes", "النمو والتطور"),
        f("immunization", "Immunization status", "حالة التطعيم"),
      ];
      specialtyExtra = [
        section("guardian", "Guardian & safety", "ولي الأمر والسلامة", [
          f("guardian", "Guardian present", "ولي الأمر حاضر", "text"),
          f("safeguarding", "Safeguarding concerns", "مخاوف الحماية"),
        ]),
      ];
      break;
    case ClinicalSpecialty.DERMATOLOGY:
      specialtyExam = [
        f("lesion_desc", "Lesion description (site, size, colour)", "وصف الآفة (الموقع، الحجم، اللون)"),
        f("dermoscopy", "Dermoscopy / punch plan", "الفحص الجلدي / خطة الخزعة"),
      ];
      break;
    case ClinicalSpecialty.DENTISTRY:
      specialtyExtra = [
        section("dental", "Dental examination", "فحص الأسنان", [
          f("tooth_chart", "Tooth / quadrant notes", "ملاحظات السن / الربع"),
          f("periodontal", "Periodontal assessment", "تقييم اللثة"),
          f("occlusion", "Occlusion", "الإطباق"),
        ]),
        section("treatment_dental", "Dental treatment plan", "خطة علاج الأسنان", [
          f("procedures", "Procedures today", "الإجراءات اليوم"),
          f("anesthesia", "Anesthesia / analgesia", "التخدير / المسكن"),
        ]),
      ];
      specialtyExam = [];
      break;
    case ClinicalSpecialty.PHYSIO_THERAPY:
      specialtyExtra = [
        section("pt_assessment", "PT assessment", "تقييم العلاج الطبيعي", [
          f("chief_region", "Chief region", "المنطقة الرئيسية"),
          f("posture_gait", "Posture & gait", "الوضعية والمشية"),
          f("rom_strength", "ROM & strength", "مدى الحركة والقوة"),
        ]),
        section("pt_plan", "PT plan", "خطة العلاج الطبيعي", [
          f("goals", "Functional goals", "الأهداف الوظيفية"),
          f("exercises", "Exercises / modalities", "التمارين / الوسائل"),
          f("sessions", "Sessions prescribed", "الجلسات الموصوفة", "number"),
        ]),
      ];
      specialtyExam = [];
      break;
    case ClinicalSpecialty.OBSTETRICS_GYNECOLOGY:
      specialtyExam = [
        f("lmp", "LMP / gestational age", "آخر دورة / عمر الحمل", "text"),
        f("ob_history", "Obstetric history", "التاريخ التوليدي"),
      ];
      specialtyExtra = [
        section("gyn_exam", "GYN examination", "فحص نسائي", [
          f("pelvic", "Pelvic exam findings", "نتائج الفحص الحوضي"),
          f("pregnancy_risk", "Pregnancy risk factors", "عوامل خطر الحمل"),
        ]),
      ];
      break;
    case ClinicalSpecialty.CARDIOLOGY:
      specialtyExam = [
        f("cvs", "Cardiovascular exam", "فحص القلب والأوعية"),
        f("ecg_echo", "ECG / echo summary", "ملخص تخطيط القلب / الإيكو"),
      ];
      break;
    case ClinicalSpecialty.PSYCHIATRY:
      specialtyExtra = [
        section("mse", "Mental status", "الحالة العقلية", [
          f("mood", "Mood / affect", "المزاج / التأثير"),
          f("thought", "Thought content / risk", "محتوى التفكير / الخطر"),
          f("insight", "Insight & judgment", "البصيرة والحكم"),
        ]),
      ];
      specialtyExam = [];
      break;
    case ClinicalSpecialty.RADIOLOGY:
      specialtyExtra = [
        section("imaging", "Imaging request / report", "طلب / تقرير الأشعة", [
          f("modality", "Modality (X-ray, US, CT, MRI)", "النوع (أشعة، سونار، مقطعية…)"),
          f("clinical_indication", "Clinical indication", "المؤشر السريري"),
          f("findings", "Findings", "النتائج"),
          f("impression", "Impression", "الانطباع"),
        ]),
      ];
      specialtyExam = [];
      break;
    case ClinicalSpecialty.LABORATORY:
      specialtyExtra = [
        section("lab", "Laboratory", "المختبر", [
          f("tests_ordered", "Tests ordered", "الفحوصات المطلوبة"),
          f("specimen", "Specimen & fasting", "العينة والصيام"),
          f("critical", "Critical results communicated", "إبلاغ النتائج الحرجة"),
        ]),
      ];
      specialtyExam = [];
      break;
    case ClinicalSpecialty.ENT:
      specialtyExam = [
        f("ent_exam", "ENT examination", "فحص أنف وأذن وحنجرة"),
        f("hearing", "Hearing / tympanic membrane", "السمع / طبلة الأذن"),
      ];
      break;
    case ClinicalSpecialty.OPHTHALMOLOGY:
      specialtyExam = [
        f("visual_acuity", "Visual acuity", "حدة البصر", "text"),
        f("slit_lamp", "Slit lamp / fundus", "المشبك / قاع العين"),
      ];
      break;
    case ClinicalSpecialty.AESTHETICS:
      specialtyExam = [
        f("area", "Treatment area", "منطقة العلاج"),
        f("skin_type", "Fitzpatrick / skin type", "نوع البشرة"),
      ];
      specialtyExtra = [
        section("aesthetic_plan", "Aesthetic plan", "خطة التجميل", [
          f("procedure", "Procedure & product", "الإجراء والمنتج"),
          f("consent_photo", "Consent & photos", "الموافقة والصور"),
        ]),
      ];
      break;
    default:
      specialtyExam = [
        f("systems", "Focused systems review", "مراجعة الأجهزة المركزة"),
        f("exam_findings", "Examination findings", "نتائج الفحص"),
      ];
  }

  const sections: DefaultFormSection[] = [
    baseHistory(),
    ...(specialtyExtra.length ? specialtyExtra : []),
    ...(specialtyExam.length ? [baseExam(specialtyExam)] : specialtyExtra.length ? [] : [baseExam(specialtyExam)]),
    basePlan(),
    baseSafety(),
  ];

  return {
    name: `Default · ${L.en}`,
    description: `قالب افتراضي · ${L.ar} — English & Arabic field labels.`,
    sectionsJson: sections,
  };
}

export async function ensureTenantDefaultClinicalFormTemplates(
  prisma: {
    clinicalFormTemplate: {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
      create: (args: unknown) => Promise<unknown>;
    };
  },
  tenantId: string,
): Promise<void> {
  for (const specialty of SYSTEM_DEFAULT_FORM_SPECIALTIES) {
    const exists = await prisma.clinicalFormTemplate.findFirst({
      where: { tenantId, specialty, isSystemDefault: true, clinicId: null },
    });
    if (exists) continue;
    const meta = defaultFormTemplateMeta(specialty);
    await prisma.clinicalFormTemplate.create({
      data: {
        tenantId,
        specialty,
        name: meta.name,
        description: meta.description,
        sectionsJson: meta.sectionsJson,
        isPublished: true,
        isSystemDefault: true,
        ownerUserId: null,
        clinicId: null,
      },
    });
  }
}