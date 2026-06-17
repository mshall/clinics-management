import {
  AppointmentStatus,
  AttendanceStatus,
  EmploymentType,
  EncounterStatus,
  type Encounter,
  ExpenseStatus,
  Gender,
  LeaveStatus,
  LeaveType,
  Locale,
  PrismaClient,
  RevenueStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Extra synthetic rows for load / edge-case testing (keeps first 15 named demo patients stable). */
const BULK_EXTRA_PATIENTS = 285;
const ENCOUNTER_SEED_COUNT = 360;
const APPOINTMENT_SEED_COUNT = 260;
const AUDIT_SEED_COUNT = 220;

const ICD = [
  { code: "I10", en: "Essential hypertension", ar: "ارتفاع ضغط الدم الأساسي" },
  { code: "E11.9", en: "Type 2 diabetes without complications", ar: "سكري النوع 2 بدون مضاعفات" },
  { code: "J00", en: "Acute nasopharyngitis [common cold]", ar: "التهاب الأنف والبلعوم الحاد" },
  { code: "K21.9", en: "Gastro-esophageal reflux disease", ar: "مرض ارتجاع المريء" },
  { code: "M54.5", en: "Low back pain", ar: "ألم أسفل الظهر" },
  { code: "J45.9", en: "Asthma, unspecified", ar: "ربو غير محدد" },
  { code: "N39.0", en: "Urinary tract infection", ar: "عدوى المسالك البولية" },
  { code: "H10.9", en: "Conjunctivitis, unspecified", ar: "التهاب الملتحمة" },
  { code: "R50.9", en: "Fever, unspecified", ar: "حمى غير محددة" },
  { code: "B34.9", en: "Viral infection, unspecified", ar: "عدوى فيروسية" },
  { code: "L20.9", en: "Atopic dermatitis", ar: "التهاب الجلد التأتبي" },
  { code: "F41.9", en: "Anxiety disorder, unspecified", ar: "اضطراب قلق" },
  { code: "G43.9", en: "Migraine, unspecified", ar: "الصداع النصفي" },
  { code: "I25.10", en: "Atherosclerotic heart disease", ar: "تصلب الشرايين التاجية" },
  { code: "J44.1", en: "COPD with acute exacerbation", ar: "الانسداد الرئوي الحاد" },
];

const ROLES_CYCLE = [
  UserRole.GROUP_ADMIN,
  UserRole.PHYSICIAN,
  UserRole.PHYSICIAN,
  UserRole.BRANCH_MANAGER,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.HR_OFFICER,
  UserRole.FINANCE_OFFICER,
  UserRole.PHYSICIAN,
  UserRole.NURSE,
  UserRole.BRANCH_MANAGER,
  UserRole.PHYSICIAN,
  UserRole.RECEPTIONIST,
  UserRole.NURSE,
  UserRole.FINANCE_OFFICER,
];

const KIORLY_TENANT_NAME = "Kiorly Clinic Group (Demo)";
const DR_AHMED_TENANT_NAME = "Dr Ahmed Shall Group";

type UserSeed = {
  tenantId: string | null;
  email: string;
  displayName: string;
  role: UserRole;
};

async function ensureUser(passwordHash: string, data: UserSeed) {
  const existing = await prisma.user.findFirst({
    where: { email: data.email, tenantId: data.tenantId },
  });
  if (existing) {
    const ensureDemoPasswords =
      process.env.PRISMA_SEED_ENSURE_DEMO_PASSWORDS === "true" ||
      process.env.NODE_ENV !== "production";
    if (ensureDemoPasswords) {
      let matchesDemo = false;
      try {
        matchesDemo = bcrypt.compareSync("demo", existing.passwordHash);
      } catch {
        matchesDemo = false;
      }
      if (!matchesDemo) {
        return prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash },
        });
      }
    }
    return existing;
  }
  return prisma.user.create({ data: { ...data, passwordHash } });
}

async function ensureSuperAdmin(passwordHash: string) {
  return ensureUser(passwordHash, {
    tenantId: null,
    email: "superadmin@kiorly.com",
    displayName: "Platform Super Administrator",
    role: UserRole.PLATFORM_SUPER_ADMIN,
  });
}

/** True when any tenant/user/clinic/patient row exists — used to skip destructive fresh seed on AWS re-deploy. */
async function hasAnyDatabaseContent(): Promise<boolean> {
  const [tenants, users, clinics, patients] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.clinic.count(),
    prisma.patient.count(),
  ]);
  return tenants > 0 || users > 0 || clinics > 0 || patients > 0;
}

/** Ensure Kiorly demo login accounts when the demo tenant already exists; never updates existing users. */
async function ensureKiorlyDemoUsers(passwordHash: string, tenantId: string) {
  const kiorlyUsers: UserSeed[] = [
    { tenantId, email: "admin@kiorly.com", displayName: "Group Administrator", role: UserRole.GROUP_ADMIN },
    { tenantId, email: "physician@kiorly.com", displayName: "Dr. Demo Physician", role: UserRole.PHYSICIAN },
    { tenantId, email: "doctor2@kiorly.com", displayName: "Dr. Second Physician", role: UserRole.PHYSICIAN },
    { tenantId, email: "clinicadmin@kiorly.com", displayName: "Demo Clinic Administrator", role: UserRole.CLINIC_ADMIN },
    { tenantId, email: "assistant@kiorly.com", displayName: "Demo Clinic Assistant", role: UserRole.CLINIC_ASSISTANT },
    { tenantId, email: "nurse@kiorly.com", displayName: "Demo Nurse", role: UserRole.NURSE },
    { tenantId, email: "receptionist@kiorly.com", displayName: "Demo Receptionist", role: UserRole.RECEPTIONIST },
    { tenantId, email: "callcenter@kiorly.com", displayName: "Demo Call Center", role: UserRole.CALL_CENTER },
    { tenantId, email: "finance@kiorly.com", displayName: "Demo Finance Officer", role: UserRole.FINANCE_OFFICER },
    { tenantId, email: "branchmgr@kiorly.com", displayName: "Demo Branch Manager", role: UserRole.BRANCH_MANAGER },
  ];
  for (let i = 0; i < 15; i += 1) {
    if (i === 0 || i === 1) continue;
    kiorlyUsers.push({
      tenantId,
      email: `staff${i + 1}@kiorly.com`,
      displayName: `Demo User ${i + 1}`,
      role: ROLES_CYCLE[i] ?? UserRole.RECEPTIONIST,
    });
  }

  const ensured = await Promise.all(kiorlyUsers.map((u) => ensureUser(passwordHash, u)));

  const hq = await prisma.clinic.findFirst({
    where: { tenantId, licenseNumber: "DHA-DEMO-001" },
  });
  const firstBranch = hq
    ? await prisma.clinic.findFirst({
        where: { tenantId, parentClinicId: hq.id },
        orderBy: { nameEn: "asc" },
      })
    : null;
  const clinicAdmin = ensured.find((u) => u.email === "clinicadmin@kiorly.com");
  const branchMgr = ensured.find((u) => u.email === "branchmgr@kiorly.com");
  const scopeRows: { tenantId: string; userId: string; clinicId: string }[] = [];
  if (clinicAdmin && hq) scopeRows.push({ tenantId, userId: clinicAdmin.id, clinicId: hq.id });
  if (clinicAdmin && firstBranch) scopeRows.push({ tenantId, userId: clinicAdmin.id, clinicId: firstBranch.id });
  if (branchMgr && hq) scopeRows.push({ tenantId, userId: branchMgr.id, clinicId: hq.id });
  if (scopeRows.length) {
    await prisma.clinicAdminScope.createMany({ data: scopeRows, skipDuplicates: true });
  }
}

type DrAhmedClinicSpec = {
  slug: string;
  label: string;
  nameEn: string;
  nameAr: string;
  country: string;
  city: string;
  addressEn: string;
  addressAr: string;
  locationUrl: string;
  phone: string;
  email: string;
  licenseNumber: string;
  defaultLanguage: Locale;
};

async function ensureEmployee(
  tenantId: string,
  clinicId: string,
  employeeNumber: string,
  data: {
    firstNameEn: string;
    lastNameEn: string;
    email: string | null;
    phone: string;
    jobTitle: string;
    employmentType: EmploymentType;
    hireDate: Date;
    salaryBase: number;
    userId?: string | null;
  }
) {
  const existing = await prisma.employee.findFirst({
    where: { tenantId, employeeNumber },
  });
  if (existing) return existing;
  return prisma.employee.create({
    data: {
      tenantId,
      clinicId,
      employeeNumber,
      ...data,
    },
  });
}

async function ensureClinicStaff(
  passwordHash: string,
  tenantId: string,
  clinic: { id: string },
  spec: DrAhmedClinicSpec
) {
  const { slug, label } = spec;
  const slugUpper = slug.toUpperCase();

  const branchMgr = await ensureUser(passwordHash, {
    tenantId,
    email: `branchmgr.${slug}@drahmedshall.com`,
    displayName: `${label} — Branch Manager`,
    role: UserRole.BRANCH_MANAGER,
  });
  const clinicAdmin = await ensureUser(passwordHash, {
    tenantId,
    email: `clinicadmin.${slug}@drahmedshall.com`,
    displayName: `${label} — Clinic Admin`,
    role: UserRole.CLINIC_ADMIN,
  });
  const assistant = await ensureUser(passwordHash, {
    tenantId,
    email: `assistant.${slug}@drahmedshall.com`,
    displayName: `${label} — Clinic Assistant`,
    role: UserRole.CLINIC_ASSISTANT,
  });
  const nurse = await ensureUser(passwordHash, {
    tenantId,
    email: `nurse.${slug}@drahmedshall.com`,
    displayName: `${label} — Nurse`,
    role: UserRole.NURSE,
  });
  const receptionist = await ensureUser(passwordHash, {
    tenantId,
    email: `receptionist.${slug}@drahmedshall.com`,
    displayName: `${label} — Receptionist`,
    role: UserRole.RECEPTIONIST,
  });
  const physician = await ensureUser(passwordHash, {
    tenantId,
    email: `physician.${slug}@drahmedshall.com`,
    displayName: `Prof. Dr. Ahmed El Shall — ${label}`,
    role: UserRole.PHYSICIAN,
  });

  await prisma.clinicAdminScope.createMany({
    data: [
      { tenantId, userId: branchMgr.id, clinicId: clinic.id },
      { tenantId, userId: clinicAdmin.id, clinicId: clinic.id },
    ],
    skipDuplicates: true,
  });

  await Promise.all([
    ensureEmployee(tenantId, clinic.id, `AES-BM-${slugUpper}`, {
      firstNameEn: label,
      lastNameEn: "Branch Manager",
      email: branchMgr.email,
      phone: spec.phone,
      jobTitle: "Branch Manager",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2018, 0, 1),
      salaryBase: 18000,
      userId: branchMgr.id,
    }),
    ensureEmployee(tenantId, clinic.id, `AES-CA-${slugUpper}`, {
      firstNameEn: label,
      lastNameEn: "Clinic Admin",
      email: clinicAdmin.email,
      phone: spec.phone,
      jobTitle: "Clinic Administrator",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2018, 3, 1),
      salaryBase: 16000,
      userId: clinicAdmin.id,
    }),
    ensureEmployee(tenantId, clinic.id, `AES-AST-${slugUpper}`, {
      firstNameEn: label,
      lastNameEn: "Assistant",
      email: assistant.email,
      phone: spec.phone,
      jobTitle: "Clinic Assistant",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2019, 0, 1),
      salaryBase: 9000,
      userId: assistant.id,
    }),
    ensureEmployee(tenantId, clinic.id, `AES-NRS-${slugUpper}`, {
      firstNameEn: label,
      lastNameEn: "Nurse",
      email: nurse.email,
      phone: spec.phone,
      jobTitle: "Registered Nurse",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2019, 6, 1),
      salaryBase: 11000,
      userId: nurse.id,
    }),
    ensureEmployee(tenantId, clinic.id, `AES-REC-${slugUpper}`, {
      firstNameEn: label,
      lastNameEn: "Reception",
      email: receptionist.email,
      phone: spec.phone,
      jobTitle: "Receptionist",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2019, 9, 1),
      salaryBase: 8500,
      userId: receptionist.id,
    }),
    ensureEmployee(tenantId, clinic.id, `AES-PHYS-${slugUpper}`, {
      firstNameEn: "Ahmed",
      lastNameEn: "El Shall",
      email: physician.email,
      phone: spec.phone,
      jobTitle: "Consultant — Chronic Pain & Spine (Non-surgical)",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2010, 0, 1),
      salaryBase: 0,
      userId: physician.id,
    }),
  ]);
}

async function ensureDemoPatientsForClinic(
  tenantId: string,
  clinicId: string,
  slug: string,
  spec: DrAhmedClinicSpec
) {
  const target = 5;
  const existing = await prisma.patient.count({ where: { tenantId, homeBranchId: clinicId } });
  if (existing >= target) return;

  const firstNames = ["Fatma", "Mahmoud", "Nadia", "Karim", "Salma"];
  const lastNames = ["Mostafa", "Abdel Rahman", "Fouad", "Gamal", "Salem"];
  const firstNamesAr = ["فاطمة", "محمود", "نادية", "كريم", "سلمى"];
  const lastNamesAr = ["مصطفى", "عبد الرحمن", "فؤاد", "جمال", "سالم"];

  for (let i = existing; i < target; i += 1) {
    const idx = i + 1;
    const mrn = `AES-${slug.toUpperCase()}-${String(idx).padStart(3, "0")}`;
    const already = await prisma.patient.findFirst({ where: { tenantId, mrn } });
    if (already) continue;
    await prisma.patient.create({
      data: {
        tenantId,
        mrn,
        firstNameEn: firstNames[i] ?? `Patient${idx}`,
        lastNameEn: lastNames[i] ?? spec.label,
        firstNameAr: firstNamesAr[i] ?? null,
        lastNameAr: lastNamesAr[i] ?? null,
        dob: new Date(1970 + i * 3, (i % 12) + 1, (i % 27) + 1),
        gender: i % 2 === 0 ? Gender.F : Gender.M,
        phone: spec.phone,
        email: `patient.${slug}${idx}@demo.example.com`,
        nationalId: `EG-${slug}-${String(2800101000000 + idx)}`,
        homeBranchId: clinicId,
      },
    });
  }
}

async function seedDrAhmedGroup(passwordHash: string) {
  const drAhmedTenant = await (async () => {
    const existing = await prisma.tenant.findFirst({ where: { name: DR_AHMED_TENANT_NAME } });
    if (existing) return existing;
    return prisma.tenant.create({
      data: {
        name: DR_AHMED_TENANT_NAME,
        nameAr: "مجموعة د. أحمد الشال — استشاري علاج الآلام المزمنة والمفاصل والعمود الفقري",
        baseCurrency: "EGP",
        defaultLocale: Locale.ar,
      },
    });
  })();

  const clinicSpecs: DrAhmedClinicSpec[] = [
    {
      slug: "hel",
      label: "Heliopolis",
      nameEn: "Heliopolis Clinic — Obour Buildings",
      nameAr: "عيادة مصر الجديدة — عمارات العبور",
      country: "EG",
      city: "Heliopolis",
      addressEn:
        "35 Obour Buildings, 5th Floor, near Wholesale Market, in front of Metro El-Ma'arad (Land of Exhibitions). Sun–Wed: patients from 4:00 PM, Dr. Ahmed from 5:00 PM. First-come, first-served. Please bring all prior test results.",
      addressAr:
        "٣٥ عمارات العبور، الدور الخامس، بجوار جملة ماركت، أمام محطة مترو أرض المعارض. الأحد–الأربعاء: حضور المرضى ٤ مساءً، الدكتور ٥ مساءً. الدخول بأسبقية الحضور. نرجو إحضار كافة الفحوصات.",
      locationUrl: "https://maps.app.goo.gl/NAaZw15GZHSwWYkM9",
      phone: "+201019234886",
      email: "heliopolis@dr-ahmedelshall.com",
      licenseNumber: "EG-AES-HEL-001",
      defaultLanguage: Locale.ar,
    },
    {
      slug: "cmc",
      label: "Fifth Settlement",
      nameEn: "Fifth Settlement Clinic — CMC",
      nameAr: "عيادة التجمع الخامس — CMC",
      country: "EG",
      city: "New Cairo",
      addressEn:
        "CMC Building, Clinic 309, 3rd Floor, behind Al-Gouna Hospital, N Teseen St, First New Cairo, Cairo Governorate 11835. Mon: patients from 7:00 PM, Dr. Ahmed from 8:00 PM. First-come, first-served.",
      addressAr:
        "مبنى CMC، عيادة ٣٠٩، الدور الثالث، خلف مستشفى الجوي، شارع التسعين، التجمع الخامس. يوم الاثنين: حضور المرضى من ٧ مساءً، الدكتور ٨ مساءً. الدخول بأسبقية الحضور.",
      locationUrl: "https://maps.app.goo.gl/edg1c4Ex6FBR5v6W8",
      phone: "+201010027404",
      email: "cmc@dr-ahmedelshall.com",
      licenseNumber: "EG-AES-CMC-001",
      defaultLanguage: Locale.ar,
    },
    {
      slug: "moh",
      label: "Mohandessin",
      nameEn: "Mohandessin Clinic",
      nameAr: "عيادة المهندسين",
      country: "EG",
      city: "Mohandessin",
      addressEn:
        "42 Syria Street, 4th Floor, above Spinneys, Egyptian Vascular Center. Thu: clinic opens 12:00 PM, Dr. Ahmed from 12:00 PM. First-come, first-served.",
      addressAr:
        "٤٢ ش سوريا، الدور الرابع، أعلى سبينيز، المركز المصري للأوعية. الخميس: تفتح العيادة من ١٢ ظهراً، حضور الدكتور ١٢ ظ. الدخول بأسبقية الحضور.",
      locationUrl: "https://maps.google.com/?q=42+Syria+St,+Mohandessin,+Giza",
      phone: "+201019234886",
      email: "mohandessin@dr-ahmedelshall.com",
      licenseNumber: "EG-AES-MOH-001",
      defaultLanguage: Locale.ar,
    },
    {
      slug: "dok",
      label: "Dokki",
      nameEn: "Capital Hospital Dokki — Contract Clinic",
      nameAr: "مستشفى العاصمة بالدقي — (تعاقدات)",
      country: "EG",
      city: "Dokki",
      addressEn:
        "Capital Hospital Dokki, 1st Floor, El Ahrar Street (off Ahmed Abdel Aziz Street). Tue: patients 4:00–6:00 PM. First-come, first-served. Please bring all prior test results.",
      addressAr:
        "مستشفى العاصمة بالدقي، الدور الأول، شارع الأحرار المتفرع من شارع البطل أحمد عبد العزيز. يوم الثلاثاء: حضور المرضى ٤–٦ مساءً. الدخول بأسبقية الحضور.",
      locationUrl: "https://maps.app.goo.gl/ZJ8tXKZdoFrSKn419",
      phone: "+201010027404",
      email: "dokki@dr-ahmedelshall.com",
      licenseNumber: "EG-AES-DOK-001",
      defaultLanguage: Locale.ar,
    },
  ];

  const drAhmedClinics = await Promise.all(
    clinicSpecs.map(async (spec) => {
      const { slug: _slug, label: _label, ...clinicData } = spec;
      const existing = await prisma.clinic.findFirst({
        where: { tenantId: drAhmedTenant.id, licenseNumber: spec.licenseNumber },
      });
      if (existing) return existing;
      return prisma.clinic.create({ data: { tenantId: drAhmedTenant.id, ...clinicData } });
    })
  );

  await ensureUser(passwordHash, {
    tenantId: drAhmedTenant.id,
    email: "admin@drahmedshall.com",
    displayName: "Dr Ahmed Shall Group Admin",
    role: UserRole.GROUP_ADMIN,
  });

  await ensureUser(passwordHash, {
    tenantId: drAhmedTenant.id,
    email: "supervisor@drahmedshall.com",
    displayName: "Dr Ahmed Shall — Group Supervisor",
    role: UserRole.GROUP_SUPERVISOR,
  });

  await ensureUser(passwordHash, {
    tenantId: drAhmedTenant.id,
    email: "dr.ahmed@drahmedshall.com",
    displayName: "Prof. Dr. Ahmed El Shall",
    role: UserRole.PHYSICIAN,
  });

  await Promise.all([
    ensureUser(passwordHash, {
      tenantId: drAhmedTenant.id,
      email: "callcenter@drahmedshall.com",
      displayName: "Dr Ahmed Shall — Call Center",
      role: UserRole.CALL_CENTER,
    }),
    ensureUser(passwordHash, {
      tenantId: drAhmedTenant.id,
      email: "finance@drahmedshall.com",
      displayName: "Dr Ahmed Shall — Finance Officer",
      role: UserRole.FINANCE_OFFICER,
    }),
    ensureUser(passwordHash, {
      tenantId: drAhmedTenant.id,
      email: "hr@drahmedshall.com",
      displayName: "Dr Ahmed Shall — HR Officer",
      role: UserRole.HR_OFFICER,
    }),
  ]);

  for (let i = 0; i < clinicSpecs.length; i += 1) {
    const spec = clinicSpecs[i]!;
    const clinic = drAhmedClinics[i]!;
    await ensureClinicStaff(passwordHash, drAhmedTenant.id, clinic, spec);
    await ensureDemoPatientsForClinic(drAhmedTenant.id, clinic.id, spec.slug, spec);
  }

  return { tenant: drAhmedTenant, clinics: drAhmedClinics };
}

async function ensureIncrementalSeed(passwordHash: string) {
  await ensureSuperAdmin(passwordHash);

  const kiorlyTenant = await prisma.tenant.findFirst({ where: { name: KIORLY_TENANT_NAME } });
  if (kiorlyTenant) {
    await ensureKiorlyDemoUsers(passwordHash, kiorlyTenant.id);
  }

  const { tenant, clinics } = await seedDrAhmedGroup(passwordHash);
  console.log(
    "Seed OK (incremental — existing rows preserved, only missing demo records added) — Dr Ahmed Shall Group:",
    tenant.id,
    `(${clinics.length} clinics, per-clinic staff ensured)`,
    kiorlyTenant ? `| Kiorly demo users ensured for tenant ${kiorlyTenant.id}` : "",
    "| org logins (password: demo): admin@drahmedshall.com, supervisor@drahmedshall.com, dr.ahmed@drahmedshall.com, callcenter@drahmedshall.com, finance@drahmedshall.com, hr@drahmedshall.com",
    "| per clinic (hel/cmc/moh/dok): branchmgr.{slug}, clinicadmin.{slug}, assistant.{slug}, nurse.{slug}, receptionist.{slug}, physician.{slug} @drahmedshall.com"
  );
}

async function seedFreshDatabase(passwordHash: string) {
  if (await hasAnyDatabaseContent()) {
    console.log("Seed: database is not empty — skipping fresh seed, running incremental ensure only.");
    await ensureIncrementalSeed(passwordHash);
    return;
  }

  const tenants = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      prisma.tenant.create({
        data: {
          name:
            i === 0
              ? KIORLY_TENANT_NAME
              : i === 1
                ? DR_AHMED_TENANT_NAME
                : `Shell Organization ${i + 1}`,
          nameAr:
            i === 0
              ? "مجموعة كيورلي للعيادات (تجريبي)"
              : i === 1
                ? "مجموعة د. أحمد الشال — استشاري علاج الآلام المزمنة والمفاصل والعمود الفقري"
                : `منظمة ${i + 1}`,
          baseCurrency: i === 1 ? "EGP" : "AED",
          defaultLocale: i === 1 ? "ar" : "en",
        },
      })
    )
  );
  const t0 = tenants[0]!;
  const { tenant: drAhmedTenant, clinics: drAhmedClinics } = await seedDrAhmedGroup(passwordHash);

  const hq = await prisma.clinic.create({
    data: {
      tenantId: t0.id,
      nameEn: "Kiorly Medical Center — Dubai HQ",
      nameAr: "مركز أحمد الطبي — دبي",
      country: "AE",
      city: "Dubai",
      addressEn: "Healthcare City, Building 1",
      addressAr: "المدينة الطبية، مبنى 1",
      locationUrl: "https://maps.google.com/?q=25.2048,55.2708",
      phone: "+97140000001",
      email: "dubai@kiorly.com",
      licenseNumber: "DHA-DEMO-001",
      defaultLanguage: Locale.en,
    },
  });

  const branches = await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      prisma.clinic.create({
        data: {
          tenantId: t0.id,
          parentClinicId: hq.id,
          nameEn: `Kiorly Clinic Branch ${i + 1}`,
          nameAr: `فرع أحمد ${i + 1}`,
          country: "AE",
          city: i % 2 === 0 ? "Sharjah" : "Abu Dhabi",
          addressEn: `District ${i + 1}, Street ${i + 2}`,
          addressAr: `منطقة ${i + 1}`,
          locationUrl: "https://maps.google.com/?q=25.0,55.2",
          phone: `+971600${String(10000 + i).slice(1)}`,
          email: `branch${i + 1}@kiorly.com`,
          licenseNumber: `MOH-DEMO-${200 + i}`,
          defaultLanguage: i % 3 === 0 ? Locale.ar : Locale.en,
        },
      })
    )
  );
  const clinics = [hq, ...branches];

  const users = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      prisma.user.create({
        data: {
          tenantId: t0.id,
          email: i === 0 ? "admin@kiorly.com" : i === 1 ? "physician@kiorly.com" : `staff${i + 1}@kiorly.com`,
          passwordHash,
          displayName:
            i === 0
              ? "Group Administrator"
              : i === 1
                ? "Dr. Demo Physician"
                : `Demo User ${i + 1}`,
          role: ROLES_CYCLE[i] ?? UserRole.RECEPTIONIST,
        },
      })
    )
  );
  const physician = users.find((u) => u.email === "physician@kiorly.com")!;
  const physician2 = await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "doctor2@kiorly.com",
      passwordHash,
      displayName: "Dr. Second Physician",
      role: UserRole.PHYSICIAN,
    },
  });

  const clinicAdminUser = await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "clinicadmin@kiorly.com",
      passwordHash,
      displayName: "Demo Clinic Administrator",
      role: UserRole.CLINIC_ADMIN,
    },
  });
  await prisma.clinicAdminScope.createMany({
    data: [
      { tenantId: t0.id, userId: clinicAdminUser.id, clinicId: hq.id },
      { tenantId: t0.id, userId: clinicAdminUser.id, clinicId: branches[0]!.id },
    ],
  });

  await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "assistant@kiorly.com",
      passwordHash,
      displayName: "Demo Clinic Assistant",
      role: UserRole.CLINIC_ASSISTANT,
    },
  });

  await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "nurse@kiorly.com",
      passwordHash,
      displayName: "Demo Nurse",
      role: UserRole.NURSE,
    },
  });
  await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "receptionist@kiorly.com",
      passwordHash,
      displayName: "Demo Receptionist",
      role: UserRole.RECEPTIONIST,
    },
  });
  await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "callcenter@kiorly.com",
      passwordHash,
      displayName: "Demo Call Center",
      role: UserRole.CALL_CENTER,
    },
  });
  await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "finance@kiorly.com",
      passwordHash,
      displayName: "Demo Finance Officer",
      role: UserRole.FINANCE_OFFICER,
    },
  });
  const branchMgrUser = await prisma.user.create({
    data: {
      tenantId: t0.id,
      email: "branchmgr@kiorly.com",
      passwordHash,
      displayName: "Demo Branch Manager",
      role: UserRole.BRANCH_MANAGER,
    },
  });
  await prisma.clinicAdminScope.create({
    data: { tenantId: t0.id, userId: branchMgrUser.id, clinicId: hq.id },
  });

  const usersForAudit = [...users, clinicAdminUser, physician2];

  const genders = [Gender.F, Gender.M, Gender.F, Gender.M, Gender.OTHER, Gender.F, Gender.M, Gender.UNKNOWN, Gender.F, Gender.M, Gender.F, Gender.M, Gender.F, Gender.M, Gender.F];

  const patients = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      prisma.patient.create({
        data: {
          tenantId: t0.id,
          mrn: `MRN-${String(10001 + i).padStart(5, "0")}`,
          firstNameEn: ["Layla", "Omar", "Sara", "Khalid", "Noor", "Youssef", "Hana", "Ali", "Mariam", "Faisal", "Rania", "Tariq", "Dina", "Hassan", "Amira"][i] ?? `First${i}`,
          lastNameEn: ["Hassan", "Al Farsi", "Khalil", "Rahman", "Said", "Nasser", "Ibrahim", "Farouk", "Zaki", "Qureshi", "Malik", "Osman", "El Sherif", "Abbas", "Darwish"][i] ?? `Last${i}`,
          firstNameAr: ["ليلى", "عمر", "سارة", "خالد", "نور", "يوسف", "هناء", "علي", "مريم", "فيصل", "رانيا", "طارق", "دينا", "حسن", "أميرة"][i] ?? null,
          lastNameAr: ["حسن", "الفارسي", "خليل", "رحمن", "سعيد", "ناصر", "إبراهيم", "فاروق", "زكي", "قريشي", "مالك", "عثمان", "الشريف", "عباس", "درويش"][i] ?? null,
          dob: new Date(1975 + (i % 30), (i % 12) + 1, (i % 27) + 1),
          gender: genders[i] ?? Gender.UNKNOWN,
          phone: `+97150${String(1000000 + i * 1111).slice(1)}`,
          email: `patient${i + 1}@demo.example.com`,
          nationalId: `784-1985-${String(1000000 + i).padStart(7, "0")}-1`,
          homeBranchId: clinics[i % clinics.length]!.id,
        },
      })
    )
  );

  const bulkPatientRows = Array.from({ length: BULK_EXTRA_PATIENTS }, (_, k) => {
    const i = 15 + k;
    const idx = i + 1;
    return {
      tenantId: t0.id,
      mrn: `MRN-${String(10001 + i).padStart(5, "0")}`,
      firstNameEn: `BulkFirst${idx}`,
      lastNameEn: `BulkLast${idx}`,
      firstNameAr: i % 5 === 0 ? `ب${idx}` : null,
      lastNameAr: i % 7 === 0 ? `ع${idx}` : null,
      dob: new Date(1965 + (i % 40), (i % 12) + 1, (i % 27) + 1),
      gender: genders[i % genders.length] ?? Gender.UNKNOWN,
      phone: `+97151${String(1000000 + i).slice(1)}`,
      email: `bulkpatient${idx}@demo.example.com`,
      nationalId: `784-1990-${String(1000000 + i).padStart(7, "0")}-1`,
      homeBranchId: clinics[i % clinics.length]!.id,
    };
  });
  await prisma.patient.createMany({ data: bulkPatientRows });

  const employees = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      prisma.employee.create({
        data: {
          tenantId: t0.id,
          clinicId: clinics[i % clinics.length]!.id,
          employeeNumber: `EMP-${String(i + 1).padStart(5, "0")}`,
          firstNameEn: ["Mona", "Samir", "Lina", "Karim", "Nadia", "Walid", "Reem", "Ziad", "Salma", "Bassam", "Ghada", "Imad", "Yasmin", "Maher", "Hiba"][i] ?? `Emp${i}`,
          lastNameEn: ["Farid", "Antoun", "Haddad", "Sabbagh", "Khoury", "Mansour", "Awad", "Tannous", "Barakat", "Najjar", "Saad", "Rizk", "Fadel", "Hamdan", "Chehab"][i] ?? `Last${i}`,
          email: `employee${i + 1}@kiorly.com`,
          phone: `+97155${String(200000 + i).slice(1)}`,
          jobTitle: ["Nurse", "Receptionist", "HR Specialist", "Lab Tech", "Radiographer", "Pharmacist", "Physiotherapist", "Admin", "Cashier", "Coordinator", "Driver", "Cleaner", "IT", "Security", "Biomed"][i] ?? "Staff",
          employmentType: [EmploymentType.FULL_TIME, EmploymentType.PART_TIME, EmploymentType.CONTRACTOR, EmploymentType.LOCUM][i % 4]!,
          hireDate: new Date(2018 + (i % 5), (i % 12) + 1, 1),
          salaryBase: 8000 + i * 450,
          userId: i < 5 ? users[i + 2]?.id ?? null : null,
        },
      })
    )
  );

  await prisma.employee.create({
    data: {
      tenantId: t0.id,
      clinicId: branches[2]!.id,
      employeeNumber: "EMP-PHYS-SEED",
      firstNameEn: "Demo",
      lastNameEn: "Physician",
      email: physician.email,
      phone: "+971501112200",
      jobTitle: "Attending Physician",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2019, 3, 1),
      salaryBase: 52000,
      userId: physician.id,
    },
  });
  await prisma.employee.create({
    data: {
      tenantId: t0.id,
      clinicId: branches[7]!.id,
      employeeNumber: "EMP-PHYS2-SEED",
      firstNameEn: "Second",
      lastNameEn: "Physician",
      email: physician2.email,
      phone: "+971501112201",
      jobTitle: "Attending Physician",
      employmentType: EmploymentType.FULL_TIME,
      hireDate: new Date(2020, 6, 15),
      salaryBase: 51000,
      userId: physician2.id,
    },
  });

  const patientIdsOrdered = (
    await prisma.patient.findMany({
      where: { tenantId: t0.id },
      select: { id: true },
      orderBy: { mrn: "asc" },
    })
  ).map((p) => p.id);

  const now = new Date();
  const BATCH = 45;
  const encounters: Encounter[] = [];
  for (let start = 0; start < ENCOUNTER_SEED_COUNT; start += BATCH) {
    const slice = await Promise.all(
      Array.from({ length: Math.min(BATCH, ENCOUNTER_SEED_COUNT - start) }, (_, j) => {
        const i = start + j;
        const day = Math.min(28, (i % 28) + 1);
        const createdAt = new Date(now.getFullYear(), now.getMonth(), day, 9 + (i % 5), (i * 7) % 60, 0);
        return prisma.encounter.create({
          data: {
            tenantId: t0.id,
            clinicId: clinics[i % clinics.length]!.id,
            patientId: patientIdsOrdered[i % patientIdsOrdered.length]!,
            clinicianId: i % 2 === 0 ? physician.id : physician2.id,
            status: i % 4 === 0 ? EncounterStatus.DRAFT : EncounterStatus.FINALIZED,
            noMedications: i % 4 === 0,
            heartRate: 68 + (i % 40),
            spo2: 97 + (i % 3),
            bpSystolic: 118 + (i % 30),
            bpDiastolic: 76 + (i % 4),
            temperature: 36.6 + (i % 5) * 0.1,
            visitType: ["Follow-up", "Consultation", "Walk-in", "Telehealth", "Annual physical"][i % 5]!,
            chiefComplaint: `Chief complaint seed ${i + 1}`,
            subjective: i % 4 === 0 ? "Patient reports symptoms for 3 days." : "Stable on current medications.",
            objective: "Vitals stable. Examination unremarkable except as noted.",
            assessment: "Clinical picture consistent with working diagnosis.",
            plan: "Medications adjusted as needed. Follow-up in 2–4 weeks.",
            vitalsJson: { bp: `${120 + (i % 20)}/${80 + (i % 5)}`, hr: 68 + (i % 40), tempC: 36.5 + (i % 3) * 0.1, spo2: 98 },
            finalizedAt: i % 4 === 0 ? null : new Date(now.getTime() - (i % 120) * 86400000),
            createdAt,
          },
        });
      })
    );
    encounters.push(...slice);
  }

  const diagBatch = 80;
  for (let start = 0; start < encounters.length; start += diagBatch) {
    await Promise.all(
      encounters.slice(start, start + diagBatch).map((enc, j) => {
        const i = start + j;
        const icd = ICD[i % ICD.length]!;
        return prisma.diagnosis.create({
          data: {
            tenantId: t0.id,
            encounterId: enc.id,
            icd10Code: icd.code,
            descriptionEn: icd.en,
            descriptionAr: icd.ar,
            isPrimary: true,
          },
        });
      })
    );
  }

  const medBatch = 80;
  for (let start = 0; start < encounters.length; start += medBatch) {
    await Promise.all(
      encounters.slice(start, start + medBatch).map((enc, j) => {
        const i = start + j;
        if (i % 4 === 0) return Promise.resolve();
        return prisma.encounterMedication.create({
          data: {
            tenantId: t0.id,
            encounterId: enc.id,
            drugName: ["Metformin", "Lisinopril", "Atorvastatin", "Omeprazole", "Salbutamol inhaler"][i % 5]!,
            dosage: "As directed",
            frequency: "BID",
          },
        });
      })
    );
  }

  /** Editable demo encounters (draft, current week) for QA — visible to all roles in default 12-month range. */
  const demoWeekBase = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0, 0);
  const demoDraftSpecs = [
    { clinicianId: physician.id, patientIdx: 0, visitType: "Consultation", chief: "Demo editable encounter — physician" },
    { clinicianId: physician.id, patientIdx: 1, visitType: "Follow-up", chief: "Demo editable encounter — add medications & prescription" },
    { clinicianId: physician2.id, patientIdx: 2, visitType: "Walk-in", chief: "Demo editable encounter — doctor2" },
    { clinicianId: physician.id, patientIdx: 3, visitType: "Telehealth", chief: "Demo editable encounter — prescription test" },
  ];
  for (let i = 0; i < demoDraftSpecs.length; i++) {
    const spec = demoDraftSpecs[i]!;
    const createdAt = new Date(demoWeekBase.getTime() - i * 86400000);
    const enc = await prisma.encounter.create({
      data: {
        tenantId: t0.id,
        clinicId: hq.id,
        patientId: patientIdsOrdered[spec.patientIdx % patientIdsOrdered.length]!,
        clinicianId: spec.clinicianId,
        status: EncounterStatus.DRAFT,
        noMedications: false,
        visitType: spec.visitType,
        chiefComplaint: spec.chief,
        subjective: "Demo patient for editing SOAP, vitals, and medications.",
        objective: "Examination unremarkable.",
        assessment: "Working diagnosis for demo.",
        plan: "Medications as listed. Follow up as needed.",
        createdAt,
        updatedAt: createdAt,
      },
    });
    encounters.push(enc);
    await prisma.encounterMedication.createMany({
      data: [
        { tenantId: t0.id, encounterId: enc.id, drugName: "Paracetamol 500mg", dosage: "1 tablet", frequency: "TID" },
        { tenantId: t0.id, encounterId: enc.id, drugName: "Ibuprofen 400mg", dosage: "1 tablet", frequency: "BID" },
      ],
    });
  }

  const y = now.getFullYear();
  const m = now.getMonth();

  /** Always within the calendar month of `now` (local) so the default reporting range shows data. */
  const postedThisMonth = (day: number, hour: number, minute: number) =>
    new Date(y, m, Math.min(28, Math.max(1, day)), hour % 24, minute % 60, 0, 0);

  /** Ledger rows tied to encounters — physician-scoped revenue uses `encounter.clinicianId`. */
  const encounterRevenue = encounters.flatMap((enc, i) => {
    const basePosted = postedThisMonth(1 + (i % 27), 9 + (i % 6), 10 + (i % 40));
    const visitNet = 380 + i * 22;
    const rows = [
      {
        tenantId: t0.id,
        clinicId: enc.clinicId,
        encounterId: enc.id,
        category: "VISIT_FEE",
        description: `Visit fee · ${enc.visitType}`,
        grossAmount: visitNet,
        taxAmount: 0,
        netAmount: visitNet,
        currency: "AED",
        postedAt: basePosted,
        status: RevenueStatus.POSTED,
      },
    ];
    if (enc.status === EncounterStatus.FINALIZED) {
      const addNet = 120 + (i % 4) * 35;
      rows.push({
        tenantId: t0.id,
        clinicId: enc.clinicId,
        encounterId: enc.id,
        category: "PROCEDURE",
        description: `Procedure / ancillaries · encounter ${i + 1}`,
        grossAmount: addNet,
        taxAmount: 0,
        netAmount: addNet,
        currency: "AED",
        postedAt: new Date(basePosted.getTime() + 90 * 60_000),
        status: RevenueStatus.POSTED,
      });
    }
    return rows;
  });

  /** Extra encounter-linked rows in prior months so changing the reporting bar still shows data. */
  const crossMonthEncounterRevenue: {
    tenantId: string;
    clinicId: string;
    encounterId: string;
    category: string;
    description: string;
    grossAmount: number;
    taxAmount: number;
    netAmount: number;
    currency: string;
    postedAt: Date;
    status: RevenueStatus;
  }[] = [];
  for (const doc of [physician, physician2]) {
    const theirs = encounters.filter((e) => e.clinicianId === doc.id && e.status === EncounterStatus.FINALIZED);
    const enc0 = theirs[0];
    if (!enc0) continue;
    for (const monthOffset of [0, -1, -2] as const) {
      crossMonthEncounterRevenue.push({
        tenantId: t0.id,
        clinicId: enc0.clinicId,
        encounterId: enc0.id,
        category: "ADD_ON",
        description: `Demo add-on (seed) · ${doc.email} · month offset ${monthOffset}`,
        grossAmount: 265,
        taxAmount: 0,
        netAmount: 265,
        currency: "AED",
        postedAt: new Date(y, m + monthOffset, 16, 13, 20, 0, 0),
        status: RevenueStatus.POSTED,
      });
    }
  }

  /** No encounter — visible on the org revenue ledger (finance / branch manager / group admin). */
  const orgWideOrphans: {
    tenantId: string;
    clinicId: string;
    encounterId: string | null;
    category: string;
    description: string;
    grossAmount: number;
    taxAmount: number;
    netAmount: number;
    currency: string;
    postedAt: Date;
    status: RevenueStatus;
  }[] = [];
  for (const monthOffset of [0, -1, -2, -3] as const) {
    for (let i = 0; i < 12; i++) {
      orgWideOrphans.push({
        tenantId: t0.id,
        clinicId: clinics[(i + Math.abs(monthOffset)) % clinics.length]!.id,
        encounterId: null,
        category: "RETAIL",
        description: `Branch retail (no encounter) mo${monthOffset} #${i + 1}`,
        grossAmount: 88 + i * 11 + Math.abs(monthOffset) * 6,
        taxAmount: 0,
        netAmount: 88 + i * 11 + Math.abs(monthOffset) * 6,
        currency: "AED",
        postedAt: new Date(y, m + monthOffset, 3 + i * 4, 10, 15 + i, 0, 0),
        status: RevenueStatus.POSTED,
      });
    }
  }

  await prisma.revenueEntry.createMany({
    data: [...encounterRevenue, ...crossMonthEncounterRevenue, ...orgWideOrphans],
  });

  const expenseRows: {
    tenantId: string;
    clinicId: string;
    category: string;
    vendorName: string;
    amount: number;
    currency: string;
    incurredAt: Date;
    status: ExpenseStatus;
  }[] = [];
  let expIdx = 0;
  for (const monthOffset of [0, -1, -2, -3] as const) {
    for (let i = 0; i < 14; i++) {
      expenseRows.push({
        tenantId: t0.id,
        clinicId: clinics[(expIdx + i) % clinics.length]!.id,
        category: ["UTILITIES", "MATERIALS", "PAYROLL", "MARKETING", "RENT"][expIdx % 5]!,
        vendorName: `Vendor ${expIdx + 1} LLC`,
        amount: 2200 + expIdx * 175,
        currency: "AED",
        incurredAt: new Date(y, m + monthOffset, 2 + ((i * 3) % 26), 11, 30 + i, 0, 0),
        status: expIdx % 3 === 0 ? ExpenseStatus.PENDING : ExpenseStatus.APPROVED,
      });
      expIdx += 1;
    }
  }
  await prisma.expense.createMany({ data: expenseRows });

  await prisma.attendance.createMany({
    data: Array.from({ length: 15 }, (_, i) => ({
      employeeId: employees[i]!.id,
      workDate: new Date(now.getFullYear(), now.getMonth(), Math.min(28, i + 1)),
      clockIn: new Date(now.getFullYear(), now.getMonth(), i + 1, 8, 0, 0),
      clockOut: new Date(now.getFullYear(), now.getMonth(), i + 1, 16, 30, 0),
      status: i % 5 === 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
      notes: i % 7 === 0 ? "Late traffic" : null,
    })),
  });

  await prisma.leaveRequest.createMany({
    data: Array.from({ length: 15 }, (_, i) => ({
      employeeId: employees[i]!.id,
      type: [LeaveType.ANNUAL, LeaveType.SICK, LeaveType.UNPAID, LeaveType.OTHER][i % 4]!,
      startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1 + i),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 2 + i),
      status: i % 4 === 0 ? LeaveStatus.PENDING : LeaveStatus.APPROVED,
      reason: `Leave request ${i + 1}`,
    })),
  });

  const appointmentStatusCycle: AppointmentStatus[] = [
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
  ];

  await prisma.appointment.createMany({
    data: Array.from({ length: APPOINTMENT_SEED_COUNT }, (_, i) => {
      const st = appointmentStatusCycle[i % appointmentStatusCycle.length]!;
      const baseDay = Math.max(1, Math.min(28, now.getDate()));
      const day = Math.min(28, Math.max(1, baseDay + ((APPOINTMENT_SEED_COUNT - i) % 27)));
      const start = new Date(now.getFullYear(), now.getMonth(), day, 8 + (i % 9), (i * 13) % 60, 0);
      const end = new Date(start.getTime() + 30 * 60000);
      return {
        tenantId: t0.id,
        clinicId: clinics[i % clinics.length]!.id,
        patientId: patientIdsOrdered[(i + 2) % patientIdsOrdered.length]!,
        clinicianId: i % 2 === 0 ? physician.id : physician2.id,
        startsAt: start,
        endsAt: end,
        status: st,
        notes: `Demo appointment ${i + 1} — ${st}`,
      };
    }),
  });

  await prisma.auditLog.createMany({
    data: Array.from({ length: AUDIT_SEED_COUNT }, (_, i) => ({
      tenantId: t0.id,
      actorId: usersForAudit[i % usersForAudit.length]!.id,
      clinicId: clinics[i % clinics.length]!.id,
      action: ["LOGIN", "CREATE_PATIENT", "UPDATE_ENCOUNTER", "POST_REVENUE", "APPROVE_EXPENSE", "BOOK_APPT", "HR_LEAVE", "FINALIZE_ENCOUNTER", "EXPORT", "SETTINGS", "INVITE", "ROLE_CHANGE", "BACKUP", "SYNC", "REPORT_RUN"][i % 15],
      resource: ["User", "Patient", "Encounter", "RevenueEntry", "Expense", "Appointment", "LeaveRequest", "Employee", "Clinic", "Tenant", "AuditLog", "FeatureFlag", "Diagnosis", "Attendance", "Report"][i % 15],
      resourceId: users[0]!.id,
      metadata: { index: i, demo: true },
    })),
  });

  const flagKeys = [
    "ENABLE_TELEHEALTH",
    "ENABLE_AR_INVOICES",
    "ENABLE_HR_PAYROLL_EXPORT",
    "ENABLE_DOUBLE_BOOKING",
    "ENABLE_SMS_REMINDERS",
    "ENABLE_WHATSAPP",
    "ENABLE_EPRESCRIPTION",
    "ENABLE_LAB_INTEGRATION",
    "ENABLE_STOCK_ALERTS",
    "ENABLE_MULTI_CURRENCY",
    "ENABLE_ADVANCED_REPORTS",
    "ENABLE_API_WEBHOOKS",
    "ENABLE_MAINTENANCE_MODE",
    "ENABLE_DEBUG_LOGS",
    "ENABLE_BETA_UI",
  ];

  await prisma.featureFlag.createMany({
    data: flagKeys.map((key, i) => ({
      key,
      enabled: i % 3 === 0,
      description: `Demo flag ${i + 1}`,
    })),
    skipDuplicates: true,
  });

  console.log(
    "Seed OK (fresh database) — main tenant:",
    t0.id,
    "| Dr Ahmed Shall Group:",
    drAhmedTenant.id,
    `(${drAhmedClinics.length} clinics, per-clinic staff)`,
    "| org: admin@drahmedshall.com, dr.ahmed@drahmedshall.com, callcenter@, finance@, hr@ @drahmedshall.com",
    "| per clinic slug hel/cmc/moh/dok: branchmgr, clinicadmin, assistant, nurse, receptionist, physician @drahmedshall.com (password: demo)"
  );

  await ensureSuperAdmin(passwordHash);
}

async function main() {
  const passwordHash = bcrypt.hashSync("demo", 10);

  if (await hasAnyDatabaseContent()) {
    console.log(
      "Seed: existing database content detected — incremental ensure only (no deletes, no password/role overwrites).",
    );
    await ensureIncrementalSeed(passwordHash);
    return;
  }

  console.log("Seed: empty database — inserting full demo dataset once.");
  await seedFreshDatabase(passwordHash);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
