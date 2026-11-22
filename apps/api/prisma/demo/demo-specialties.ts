/**
 * Kiorly demo tenant "sp" (Kiorex Specialties Network (DEMO)): two LIVE verified doctors for EVERY one of the 36 Kiorex specialties
 * (the GET /specialties catalogue), so a tester can search and book every specialty end to end. DEV ONLY, all names are synthetic.
 * The specialty strings are the Kiorex codes (lowercase), so the provider sync maps them 1:1 onto Kiorex `Provider.specialty`.
 * Bookings for these doctors live in demo-marketplace-bookings.json (keys sp01..), mirrored byte-identical in kiorex-platform.
 */
import type { ClinicSpec, DocSpec, TenantSpec } from "./demo-data";

/** code, EN label, AR label, EN title, AR title, base fee (EGP) */
export const SPECIALTIES: [string, string, string, string, string, number][] = [
  ["allergy_immunology", "Allergy & Immunology", "الحساسية والمناعة", "Consultant Allergy & Immunology", "استشاري الحساسية والمناعة", 550],
  ["anesthesiology", "Anaesthesiology", "التخدير", "Consultant Anaesthetist", "استشاري التخدير", 500],
  ["audiology", "Audiology & Speech", "السمعيات والتخاطب", "Audiology & Speech Specialist", "أخصائي السمعيات والتخاطب", 350],
  ["cardiology", "Cardiology", "القلب", "Consultant Cardiologist", "استشاري أمراض القلب", 700],
  ["cardiothoracic_surgery", "Cardiothoracic Surgery", "جراحة القلب والصدر", "Cardiothoracic Surgeon", "جراح قلب وصدر", 900],
  ["dentistry", "Dentistry", "الأسنان", "Dental Surgeon", "جراح أسنان", 400],
  ["dermatology", "Dermatology", "الجلدية", "Consultant Dermatologist", "استشاري الأمراض الجلدية", 500],
  ["diabetes_endocrinology", "Diabetes & Endocrinology", "السكر والغدد الصماء", "Consultant Diabetes & Endocrinology", "استشاري السكر والغدد الصماء", 600],
  ["emergency_medicine", "Emergency Medicine", "الطوارئ", "Emergency Medicine Specialist", "أخصائي طب الطوارئ", 400],
  ["ent", "ENT", "الأنف والأذن والحنجرة", "ENT Consultant", "استشاري أنف وأذن وحنجرة", 450],
  ["family_medicine", "Family Medicine", "طب الأسرة", "Family Physician", "طبيب أسرة", 300],
  ["gastroenterology", "Gastroenterology", "الجهاز الهضمي والكبد", "Consultant Gastroenterologist", "استشاري الجهاز الهضمي والكبد", 650],
  ["general_surgery", "General Surgery", "الجراحة العامة", "Consultant General Surgeon", "استشاري الجراحة العامة", 550],
  ["geriatrics", "Geriatrics", "طب المسنين", "Consultant Geriatrician", "استشاري طب المسنين", 500],
  ["haematology", "Haematology", "أمراض الدم", "Consultant Haematologist", "استشاري أمراض الدم", 650],
  ["infectious_diseases", "Infectious Diseases", "الأمراض المعدية", "Consultant Infectious Diseases", "استشاري الأمراض المعدية", 550],
  ["internal_medicine", "Internal Medicine", "الباطنة", "Consultant Internal Medicine", "استشاري الباطنة", 500],
  ["nephrology", "Nephrology", "أمراض الكلى", "Consultant Nephrologist", "استشاري أمراض الكلى", 650],
  ["neurology", "Neurology", "المخ والأعصاب", "Consultant Neurologist", "استشاري المخ والأعصاب", 650],
  ["neurosurgery", "Neurosurgery", "جراحة المخ والأعصاب", "Consultant Neurosurgeon", "استشاري جراحة المخ والأعصاب", 850],
  ["nutrition", "Nutrition & Dietetics", "التغذية", "Clinical Nutritionist", "أخصائي تغذية علاجية", 350],
  ["obgyn", "Obstetrics & Gynaecology", "النساء والتوليد", "Consultant Ob-Gyn", "استشاري النساء والتوليد", 550],
  ["oncology", "Oncology", "الأورام", "Consultant Oncologist", "استشاري الأورام", 800],
  ["ophthalmology", "Ophthalmology", "العيون", "Consultant Ophthalmologist", "استشاري طب وجراحة العيون", 450],
  ["orthopaedics", "Orthopaedics", "العظام", "Orthopaedic Surgeon", "جراح عظام", 600],
  ["paediatrics", "Paediatrics", "الأطفال", "Consultant Paediatrician", "استشاري طب الأطفال", 450],
  ["pain_management", "Pain Management", "علاج الألم", "Pain Management Consultant", "استشاري علاج الألم", 600],
  ["physiotherapy", "Physiotherapy", "العلاج الطبيعي", "Physiotherapy Specialist", "أخصائي علاج طبيعي", 350],
  ["plastic_surgery", "Plastic & Cosmetic Surgery", "جراحة التجميل", "Consultant Plastic Surgeon", "استشاري جراحة التجميل", 800],
  ["psychiatry", "Psychiatry", "الطب النفسي", "Consultant Psychiatrist", "استشاري الطب النفسي", 600],
  ["pulmonology", "Pulmonology & Chest", "الصدر والجهاز التنفسي", "Consultant Chest Physician", "استشاري الصدر", 550],
  ["radiology", "Radiology", "الأشعة", "Consultant Radiologist", "استشاري الأشعة", 400],
  ["rheumatology", "Rheumatology", "الروماتيزم", "Consultant Rheumatologist", "استشاري الروماتيزم", 600],
  ["sports_medicine", "Sports Medicine", "الطب الرياضي", "Sports Medicine Specialist", "أخصائي الطب الرياضي", 500],
  ["urology", "Urology", "المسالك البولية", "Consultant Urologist", "استشاري المسالك البولية", 600],
  ["vascular_surgery", "Vascular Surgery", "جراحة الأوعية الدموية", "Consultant Vascular Surgeon", "استشاري جراحة الأوعية الدموية", 750],
];

const M: [string, string][] = [["Adel", "عادل"], ["Alaa", "علاء"], ["Amir", "أمير"], ["Anas", "أنس"], ["Ashraf", "أشرف"], ["Ayman", "أيمن"], ["Bassem", "باسم"], ["Emad", "عماد"], ["Essam", "عصام"], ["Fady", "فادي"], ["Gamal", "جمال"], ["Hatem", "حاتم"], ["Hazem", "حازم"], ["Ihab", "إيهاب"], ["Ismail", "إسماعيل"], ["Kamal", "كمال"], ["Maged", "ماجد"], ["Marwan", "مروان"], ["Mohab", "مهاب"], ["Nabil", "نبيل"], ["Osama", "أسامة"], ["Raafat", "رأفت"], ["Ramy", "رامي"], ["Sameh", "سامح"], ["Seif", "سيف"], ["Wael", "وائل"], ["Yehia", "يحيى"], ["Zein", "زين"], ["Ziad", "زياد"], ["Magdy", "مجدي"], ["Sabry", "صبري"], ["Hesham", "هشام"], ["Moataz", "معتز"], ["Nader", "نادر"], ["Ragab", "رجب"], ["Abdallah", "عبد الله"]];
const F: [string, string][] = [["Amal", "أمل"], ["Asmaa", "أسماء"], ["Basma", "بسمة"], ["Eman", "إيمان"], ["Esraa", "إسراء"], ["Farida", "فريدة"], ["Ghada", "غادة"], ["Hanan", "حنان"], ["Hend", "هند"], ["Jihan", "جيهان"], ["Laila", "ليلى"], ["Lobna", "لبنى"], ["Maha", "مها"], ["Marwa", "مروة"], ["Mervat", "ميرفت"], ["Nada", "ندى"], ["Nahla", "نهلة"], ["Noha", "نهى"], ["Nesma", "نسمة"], ["Rasha", "رشا"], ["Rehab", "رحاب"], ["Reham", "ريهام"], ["Sahar", "سحر"], ["Samar", "سمر"], ["Shaimaa", "شيماء"], ["Shereen", "شيرين"], ["Soha", "سها"], ["Suzan", "سوزان"], ["Walaa", "ولاء"], ["Yasmine", "ياسمين"], ["Zeinab", "زينب"], ["Doaa", "دعاء"], ["Radwa", "رضوى"], ["Manal", "منال"], ["Lamis", "لميس"], ["Salwa", "سلوى"]];
const L: [string, string][] = [["Abbas", "عباس"], ["Abdelhamid", "عبد الحميد"], ["Amin", "أمين"], ["Aziz", "عزيز"], ["Badawy", "بدوي"], ["Barakat", "بركات"], ["Darwish", "درويش"], ["Diab", "دياب"], ["El-Banna", "البنا"], ["Eissa", "عيسى"], ["Fahmy", "فهمي"], ["Ghoneim", "غنيم"], ["Habib", "حبيب"], ["Helmy", "حلمي"], ["Kamel", "كامل"], ["Labib", "لبيب"], ["Maher", "ماهر"], ["Metwally", "متولي"], ["Morsy", "مرسي"], ["Mounir", "منير"], ["Nagy", "ناجي"], ["Okasha", "عكاشة"], ["Qandil", "قنديل"], ["Rashad", "رشاد"], ["Refaat", "رفعت"], ["Saad", "سعد"], ["Selim", "سليم"], ["Sharaf", "شرف"], ["Soliman", "سليمان"], ["Tantawy", "طنطاوي"], ["Wahba", "وهبة"], ["Yassin", "ياسين"], ["Zahran", "زهران"], ["Shalaby", "شلبي"], ["Awad", "عوض"], ["Gad", "جاد"], ["Hosny", "حسني"], ["Radi", "راضي"], ["Taha", "طه"], ["Younis", "يونس"]];

export const SP_CLINICS: ClinicSpec[] = [
  { key: "cairo", nameEn: "Kiorex Specialties — New Cairo", nameAr: "كيوركس التخصصية — القاهرة الجديدة", city: "Cairo", addrEn: "90th Street, Fifth Settlement, New Cairo", addrAr: "الشارع التسعين، التجمع الخامس، القاهرة الجديدة", lat: 30.0074, lng: 31.4913, phone: "+201000003401", governorate: "Cairo", area: "New Cairo" },
  { key: "giza", nameEn: "Kiorex Specialties — Dokki", nameAr: "كيوركس التخصصية — الدقي", city: "Giza", addrEn: "30 Tahrir Street, Dokki, Giza", addrAr: "٣٠ شارع التحرير، الدقي، الجيزة", lat: 30.0384, lng: 31.2117, phone: "+201000003402", governorate: "Giza", area: "Dokki" },
  { key: "alex", nameEn: "Kiorex Specialties — Smouha", nameAr: "كيوركس التخصصية — سموحة", city: "Alexandria", addrEn: "14 Victor Emmanuel Street, Smouha, Alexandria", addrAr: "١٤ شارع فيكتور عمانويل، سموحة، الإسكندرية", lat: 31.2156, lng: 29.9406, phone: "+201000003403", governorate: "Alexandria", area: "Smouha" },
];
/** Home-visit coverage per clinic (district codes) */
export const SP_COVERAGE: Record<string, string[]> = { cairo: ["new-cairo", "nasr-city", "heliopolis", "maadi"], giza: ["dokki", "mohandessin", "agouza"], alex: ["smouha", "sidi-gaber"] };
/** Specialties where the "a" doctor also takes home visits (physiotherapy: both) */
const HOME_SPECS = new Set(["family_medicine", "internal_medicine", "paediatrics", "geriatrics", "cardiology", "pulmonology", "diabetes_endocrinology", "neurology", "physiotherapy", "nutrition", "obgyn", "sports_medicine", "rheumatology"]);
const LANGS: string[][] = [["ar", "en"], ["ar", "en"], ["ar"], ["ar", "en", "fr"], ["ar", "en"], ["ar", "de", "en"]];

const docs: DocSpec[] = [];
const used = new Set<string>(); let mi = 0, fi = 0, n = 0;
SPECIALTIES.forEach(([code, en, ar, titleEn, titleAr, fee], k) => {
  const genders = ([["M", "F"], ["F", "M"], ["M", "M"], ["F", "F"]] as const)[k % 4];
  (["a", "b"] as const).forEach((suf, j) => {
    const male = genders[j] === "M"; const f = male ? M[mi++ % M.length] : F[fi++ % F.length]; const l = L[(n * 7 + 3) % L.length];
    const nameEn = `Dr ${f[0]} ${l[0]}`; if (used.has(nameEn)) throw new Error(`duplicate demo doctor name ${nameEn}`); used.add(nameEn);
    const clinic = SP_CLINICS[(k + j) % SP_CLINICS.length].key; const years = 8 + ((n * 5) % 17);
    docs.push({
      key: `${code.replace(/_/g, "")}${suf}`, nameEn, nameAr: `د. ${f[1]} ${l[1]}`, spec: code, titleEn, titleAr, clinic, fee: fee + (j ? -50 : 0) + (k % 3) * 50, years, listing: "LIVE",
      gender: male ? "MALE" : "FEMALE", languages: LANGS[n % LANGS.length], offDays: n % 6 === 5 ? [5, 6] : [5],
      bioEn: `Demo profile (synthetic data): ${titleEn}, ${years} years of practice in ${en.toLowerCase()}, seeing patients by appointment.`,
      bioAr: `ملف تجريبي (بيانات وهمية): ${titleAr}، ${years} سنة خبرة في ${ar}، يستقبل المرضى بالموعد.`,
      home: HOME_SPECS.has(code) && (j === 0 || code === "physiotherapy"),
    });
    n++;
  });
});

export const SP_TENANT: TenantSpec = {
  key: "sp", name: "Kiorex Specialties Network (DEMO)", nameAr: "شبكة كيوركس التخصصية (تجريبي)", short: "Specialties", ownerEn: "Samia Lotfy", plan: "PRO", patients: 40,
  clinics: SP_CLINICS, docs, lean: true, perDocFees: true,
};
