/** Shared ICD-10 snippets and interaction rules (tenantId null = platform defaults). */

export const DEFAULT_ICD10: {
  icd10Code: string;
  descriptionEn: string;
  descriptionAr: string;
  keywords: string;
}[] = [
  { icd10Code: "J06.9", descriptionEn: "Acute upper respiratory infection", descriptionAr: "عدوى الجهاز التنفسي العلوي", keywords: "cold uri flu" },
  { icd10Code: "J02.9", descriptionEn: "Acute pharyngitis", descriptionAr: "التهاب البلعوم الحاد", keywords: "sore throat pharyngitis" },
  { icd10Code: "R51", descriptionEn: "Headache", descriptionAr: "صداع", keywords: "headache cephalalgia" },
  { icd10Code: "E11.9", descriptionEn: "Type 2 diabetes mellitus", descriptionAr: "داء السكري النوع الثاني", keywords: "diabetes dm t2dm" },
  { icd10Code: "I10", descriptionEn: "Essential hypertension", descriptionAr: "ارتفاع ضغط الدم الأساسي", keywords: "hypertension htn bp" },
  { icd10Code: "M54.5", descriptionEn: "Low back pain", descriptionAr: "ألم أسفل الظهر", keywords: "back pain lbp" },
  { icd10Code: "K21.9", descriptionEn: "Gastro-esophageal reflux", descriptionAr: "ارتجاع مريئي معدي", keywords: "gerd reflux" },
  { icd10Code: "J45.909", descriptionEn: "Asthma unspecified", descriptionAr: "ربو", keywords: "asthma wheeze" },
  { icd10Code: "N39.0", descriptionEn: "Urinary tract infection", descriptionAr: "عدوى المسالك البولية", keywords: "uti cystitis" },
  { icd10Code: "L30.9", descriptionEn: "Dermatitis unspecified", descriptionAr: "التهاب الجلد", keywords: "dermatitis rash eczema" },
  { icd10Code: "K52.9", descriptionEn: "Gastroenteritis", descriptionAr: "التهاب المعدة والأمعاء", keywords: "gastroenteritis diarrhea" },
  { icd10Code: "Z00.00", descriptionEn: "General adult medical examination", descriptionAr: "فحص طبي عام", keywords: "checkup wellness" },
  { icd10Code: "O80", descriptionEn: "Single spontaneous delivery", descriptionAr: "ولادة طبيعية", keywords: "delivery labour gynae" },
  { icd10Code: "K02.9", descriptionEn: "Dental caries", descriptionAr: "تسوس الأسنان", keywords: "caries dental tooth" },
  { icd10Code: "M25.50", descriptionEn: "Joint pain unspecified", descriptionAr: "ألم مفصل", keywords: "arthralgia joint physio" },
];

export const DEFAULT_DRUG_INTERACTIONS: {
  drugA: string;
  drugB: string;
  severity: string;
  messageEn: string;
  messageAr: string;
}[] = [
  {
    drugA: "warfarin",
    drugB: "aspirin",
    severity: "high",
    messageEn: "Increased bleeding risk when combining warfarin and aspirin.",
    messageAr: "خطر نزيف أعلى عند الجمع بين الوارفارين والأسبرين.",
  },
  {
    drugA: "metformin",
    drugB: "contrast",
    severity: "moderate",
    messageEn: "Hold metformin around iodinated contrast when kidney risk is present.",
    messageAr: "أوقف الميتفورمين حول صبغة اليود عند وجود خطر كلوي.",
  },
  {
    drugA: "ibuprofen",
    drugB: "lisinopril",
    severity: "moderate",
    messageEn: "NSAIDs may reduce ACE inhibitor efficacy and worsen renal function.",
    messageAr: "مضادات الالتهاب قد تقلل فاعلية مثبطات ACE وتؤثر على الكلى.",
  },
];
