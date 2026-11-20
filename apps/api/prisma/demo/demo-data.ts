/** Static demo content for the Kiorly Clinic demo seed (all fictional). */
export type DocSpec = {
  key: string; nameEn: string; nameAr: string; titleEn: string; titleAr: string; spec: string; clinic: string; fee: number; years: number;
  bioEn: string; bioAr: string; listing: "LIVE" | "PAUSED" | "PENDING_VERIFICATION" | "DRAFT"; gender?: string; offDays?: number[];
};
export type ClinicSpec = { key: string; nameEn: string; nameAr: string; city: string; addrEn: string; addrAr: string; lat: number; lng: number; phone: string };
export type TenantSpec = { key: string; name: string; nameAr: string; short: string; ownerEn: string; plan: "LITE" | "PRO" | "CLINIC"; trial?: boolean; patients: number; clinics: ClinicSpec[]; docs: DocSpec[] };

export const FIRST_M: [string, string][] = [["Ahmed", "أحمد"], ["Mohamed", "محمد"], ["Mahmoud", "محمود"], ["Mostafa", "مصطفى"], ["Karim", "كريم"], ["Omar", "عمر"], ["Youssef", "يوسف"], ["Tarek", "طارق"], ["Hossam", "حسام"], ["Amr", "عمرو"], ["Khaled", "خالد"], ["Ali", "علي"], ["Hany", "هاني"], ["Walid", "وليد"], ["Sherif", "شريف"]];
export const FIRST_F: [string, string][] = [["Fatma", "فاطمة"], ["Mariam", "مريم"], ["Nour", "نور"], ["Salma", "سلمى"], ["Heba", "هبة"], ["Dalia", "داليا"], ["Rana", "رنا"], ["Aya", "آية"], ["Mona", "منى"], ["Hoda", "هدى"], ["Sara", "سارة"], ["Nermine", "نرمين"], ["Yasmin", "ياسمين"], ["Reem", "ريم"], ["Dina", "دينا"]];
export const LAST: [string, string][] = [["Hassan", "حسن"], ["Ibrahim", "إبراهيم"], ["Fouad", "فؤاد"], ["El-Sayed", "السيد"], ["Mansour", "منصور"], ["Abdelrahman", "عبد الرحمن"], ["Nassar", "نصار"], ["Salem", "سالم"], ["Zaki", "زكي"], ["Farouk", "فاروق"], ["Gaber", "جابر"], ["Hegazy", "حجازي"], ["Shehata", "شحاتة"], ["Lotfy", "لطفي"], ["Mourad", "مراد"]];

/** Same people as the Passport demo accounts +20100000 1001..1012 (names mirror kiorex-account/config/seed-users.json). */
export const PERSONAS: { first: [string, string]; last: [string, string]; male: boolean }[] = [
  { first: ["Hoda", "هدى"], last: ["Mahmoud", "محمود"], male: false }, { first: ["Samir", "سمير"], last: ["Nassar", "نصار"], male: true },
  { first: ["Karim", "كريم"], last: ["Mostafa", "مصطفى"], male: true }, { first: ["Nourhan", "نورهان"], last: ["Fathy", "فتحي"], male: false },
  { first: ["Mahmoud", "محمود"], last: ["El-Sayed", "السيد"], male: true }, { first: ["Mariam", "مريم"], last: ["Adel", "عادل"], male: false },
  { first: ["Omar", "عمر"], last: ["Hegazy", "حجازي"], male: true }, { first: ["Dalia", "داليا"], last: ["Ibrahim", "إبراهيم"], male: false },
  { first: ["Tarek", "طارق"], last: ["Zaki", "زكي"], male: true }, { first: ["Heba", "هبة"], last: ["Salah", "صلاح"], male: false },
  { first: ["Youssef", "يوسف"], last: ["Ramadan", "رمضان"], male: true }, { first: ["Rana", "رنا"], last: ["Khaled", "خالد"], male: false },
];

const bio = (s: string) => ({ bioEn: `Demo profile (synthetic data): ${s}, seeing patients by appointment.`, bioAr: `ملف تجريبي (بيانات وهمية): ${s}، يستقبل المرضى بالموعد.` });
const doc = (key: string, nameEn: string, nameAr: string, spec: string, titleEn: string, titleAr: string, clinic: string, fee: number, years: number, listing: DocSpec["listing"] = "LIVE", extra: Partial<DocSpec> = {}): DocSpec =>
  ({ key, nameEn, nameAr, spec, titleEn, titleAr, clinic, fee, years, listing, ...bio(titleEn.toLowerCase()), ...extra });

export const TENANTS: TenantSpec[] = [
  {
    key: "na", name: "Nile Care Medical Center (DEMO)", nameAr: "مركز نايل كير الطبي (تجريبي)", short: "Nile Care", ownerEn: "Ahmed Fawzy", plan: "PRO", patients: 70,
    clinics: [
      { key: "maadi", nameEn: "Nile Care — Maadi", nameAr: "نايل كير — المعادي", city: "Cairo", addrEn: "9 Road 233, Degla, Maadi, Cairo", addrAr: "٩ شارع ٢٣٣، دجلة، المعادي، القاهرة", lat: 29.9602, lng: 31.2569, phone: "+201000003101" },
      { key: "heliopolis", nameEn: "Nile Care — Heliopolis", nameAr: "نايل كير — مصر الجديدة", city: "Cairo", addrEn: "21 Baghdad Street, Heliopolis, Cairo", addrAr: "٢١ شارع بغداد، مصر الجديدة، القاهرة", lat: 30.0911, lng: 31.3225, phone: "+201000003102" },
    ],
    docs: [
      doc("nadia", "Dr Nadia Fouad", "د. نادية فؤاد", "PEDIATRICS", "Consultant Paediatrician", "استشاري طب الأطفال", "maadi", 450, 16, "LIVE", { gender: "FEMALE" }),
      doc("walid", "Dr Walid Samy", "د. وليد سامي", "DERMATOLOGY", "Consultant Dermatologist", "استشاري الأمراض الجلدية", "maadi", 500, 14),
      doc("tamer", "Dr Tamer Shawky", "د. تامر شوقي", "CARDIOLOGY", "Consultant Cardiologist", "استشاري أمراض القلب", "heliopolis", 700, 20),
      doc("rania", "Dr Rania Abdelaziz", "د. رانيا عبد العزيز", "OBSTETRICS_GYNECOLOGY", "Consultant Ob-Gyn", "استشاري النساء والتوليد", "heliopolis", 550, 18, "LIVE", { gender: "FEMALE" }),
      doc("khaled", "Dr Khaled Mansour", "د. خالد منصور", "DENTISTRY", "Dental Surgeon", "جراح أسنان", "maadi", 400, 11),
      doc("hossam", "Dr Hossam Anwar", "د. حسام أنور", "ORTHOPEDICS", "Orthopaedic Surgeon", "جراح عظام", "heliopolis", 600, 15, "LIVE", { offDays: [5, 6] }),
      doc("ingy", "Dr Ingy Lashin", "د. إنجي لاشين", "ENT", "ENT Specialist", "أخصائي أنف وأذن وحنجرة", "maadi", 450, 9, "LIVE", { gender: "FEMALE" }),
      doc("sherif", "Dr Sherif Bakr", "د. شريف بكر", "INTERNAL_MEDICINE", "Consultant Internal Medicine", "استشاري الباطنة", "heliopolis", 500, 22),
    ],
  },
  {
    key: "df", name: "Delta Family Clinics (DEMO)", nameAr: "عيادات الدلتا العائلية (تجريبي)", short: "Delta", ownerEn: "Magdy Hamed", plan: "PRO", patients: 36,
    clinics: [{ key: "mansoura", nameEn: "Delta Family — Mansoura", nameAr: "الدلتا العائلية — المنصورة", city: "Mansoura", addrEn: "5 El Gomhoria Street, Mansoura", addrAr: "٥ شارع الجمهورية، المنصورة", lat: 31.0409, lng: 31.3785, phone: "+201000003201" }],
    docs: [
      doc("ola", "Dr Ola Gamal", "د. علا جمال", "PEDIATRICS", "Paediatrician", "أخصائي أطفال", "mansoura", 350, 8, "LIVE", { gender: "FEMALE" }),
      doc("medhat", "Dr Medhat Younes", "د. مدحت يونس", "FAMILY_MEDICINE", "Family Physician", "طبيب أسرة", "mansoura", 300, 12),
      doc("samah", "Dr Samah Aref", "د. سماح عارف", "OPHTHALMOLOGY", "Ophthalmologist", "أخصائي عيون", "mansoura", 400, 10, "PAUSED", { gender: "FEMALE" }),
    ],
  },
  {
    key: "ss", name: "Smile & Skin Studio (DEMO)", nameAr: "استوديو سمايل آند سكين (تجريبي)", short: "Smile Skin", ownerEn: "Lamia Hafez", plan: "CLINIC", trial: true, patients: 24,
    clinics: [{ key: "zayed", nameEn: "Smile & Skin — Sheikh Zayed", nameAr: "سمايل آند سكين — الشيخ زايد", city: "Giza", addrEn: "Arkan Plaza, Sheikh Zayed, Giza", addrAr: "أركان بلازا، الشيخ زايد، الجيزة", lat: 30.0131, lng: 30.9714, phone: "+201000003301" }],
    docs: [
      doc("lamia", "Dr Lamia Hafez", "د. لمياء حافظ", "DERMATOLOGY", "Dermatologist & Aesthetics", "أخصائي جلدية وتجميل", "zayed", 600, 13, "LIVE", { gender: "FEMALE" }),
      doc("adham", "Dr Adham Tawfik", "د. أدهم توفيق", "DENTISTRY", "Cosmetic Dentist", "طبيب أسنان تجميلي", "zayed", 550, 7, "PENDING_VERIFICATION"),
    ],
  },
];
