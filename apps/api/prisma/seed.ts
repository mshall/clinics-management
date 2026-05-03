import {
  AppointmentStatus,
  AttendanceStatus,
  EmploymentType,
  EncounterStatus,
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

async function main() {
  await prisma.encounterDocument.deleteMany();
  await prisma.encounterMedication.deleteMany();
  await prisma.diagnosis.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.encounter.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.revenueEntry.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();
  await prisma.clinic.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.featureFlag.deleteMany();

  const passwordHash = bcrypt.hashSync("demo", 10);

  const tenants = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      prisma.tenant.create({
        data: {
          name: i === 0 ? "Ahmed Clinic Group (Demo)" : `Shell Organization ${i + 1}`,
          baseCurrency: "AED",
          defaultLocale: "en",
        },
      })
    )
  );
  const t0 = tenants[0]!;

  const hq = await prisma.clinic.create({
    data: {
      tenantId: t0.id,
      nameEn: "Ahmed Medical Center — Dubai HQ",
      nameAr: "مركز أحمد الطبي — دبي",
      country: "AE",
      city: "Dubai",
      addressEn: "Healthcare City, Building 1",
      addressAr: "المدينة الطبية، مبنى 1",
      locationUrl: "https://maps.google.com/?q=25.2048,55.2708",
      phone: "+97140000001",
      email: "dubai@demo.clinic",
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
          nameEn: `Ahmed Clinic Branch ${i + 1}`,
          nameAr: `فرع أحمد ${i + 1}`,
          country: "AE",
          city: i % 2 === 0 ? "Sharjah" : "Abu Dhabi",
          addressEn: `District ${i + 1}, Street ${i + 2}`,
          addressAr: `منطقة ${i + 1}`,
          locationUrl: "https://maps.google.com/?q=25.0,55.2",
          phone: `+971600${String(10000 + i).slice(1)}`,
          email: `branch${i + 1}@demo.clinic`,
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
          email: i === 0 ? "admin@demo.clinic" : i === 1 ? "physician@demo.clinic" : `staff${i + 1}@demo.clinic`,
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
  const physician = users.find((u) => u.email === "physician@demo.clinic")!;

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

  const employees = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      prisma.employee.create({
        data: {
          tenantId: t0.id,
          clinicId: clinics[i % clinics.length]!.id,
          employeeNumber: `EMP-${String(i + 1).padStart(5, "0")}`,
          firstNameEn: ["Mona", "Samir", "Lina", "Karim", "Nadia", "Walid", "Reem", "Ziad", "Salma", "Bassam", "Ghada", "Imad", "Yasmin", "Maher", "Hiba"][i] ?? `Emp${i}`,
          lastNameEn: ["Farid", "Antoun", "Haddad", "Sabbagh", "Khoury", "Mansour", "Awad", "Tannous", "Barakat", "Najjar", "Saad", "Rizk", "Fadel", "Hamdan", "Chehab"][i] ?? `Last${i}`,
          email: `employee${i + 1}@demo.clinic`,
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

  const now = new Date();
  const encounters = await Promise.all(
    Array.from({ length: 15 }, (_, i) => {
      const day = Math.min(28, i + 1);
      const createdAt = new Date(now.getFullYear(), now.getMonth(), day, 9 + (i % 5), (i * 7) % 60, 0);
      return prisma.encounter.create({
        data: {
          tenantId: t0.id,
          clinicId: clinics[i % clinics.length]!.id,
          patientId: patients[i]!.id,
          clinicianId: physician.id,
          status: i % 4 === 0 ? EncounterStatus.DRAFT : EncounterStatus.FINALIZED,
          noMedications: i % 4 === 0,
          heartRate: 68 + i,
          spo2: 97 + (i % 3),
          bpSystolic: 118 + i,
          bpDiastolic: 76 + (i % 4),
          temperature: 36.6 + (i % 5) * 0.1,
          visitType: ["Follow-up", "Consultation", "Walk-in", "Telehealth", "Annual physical"][i % 5]!,
          chiefComplaint: ["Cough", "Headache", "Follow-up HTN", "DM review", "Back pain", "Fever", "Rash", "Anxiety", "URI", "Knee pain", "Check-up", "Refill", "Lab review", "Pediatric growth", "Travel advice"][i],
          subjective: i % 4 === 0 ? "Patient reports symptoms for 3 days." : "Stable on current medications.",
          objective: "Vitals stable. Examination unremarkable except as noted.",
          assessment: "Clinical picture consistent with working diagnosis.",
          plan: "Medications adjusted as needed. Follow-up in 2–4 weeks.",
          vitalsJson: { bp: `${120 + i}/${80 + (i % 5)}`, hr: 68 + i, tempC: 36.5 + (i % 3) * 0.1, spo2: 98 },
          finalizedAt: i % 4 === 0 ? null : new Date(now.getTime() - i * 86400000),
          createdAt,
        },
      });
    })
  );

  await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      prisma.diagnosis.create({
        data: {
          tenantId: t0.id,
          encounterId: encounters[i]!.id,
          icd10Code: ICD[i]!.code,
          descriptionEn: ICD[i]!.en,
          descriptionAr: ICD[i]!.ar,
          isPrimary: true,
        },
      })
    )
  );

  await Promise.all(
    encounters.map((enc, i) =>
      i % 4 !== 0
        ? prisma.encounterMedication.create({
            data: {
              tenantId: t0.id,
              encounterId: enc.id,
              drugName: ["Metformin", "Lisinopril", "Atorvastatin", "Omeprazole", "Salbutamol inhaler"][i % 5]!,
              dosage: "As directed",
              frequency: "BID",
            },
          })
        : Promise.resolve()
    )
  );

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  await prisma.revenueEntry.createMany({
    data: Array.from({ length: 15 }, (_, i) => ({
      tenantId: t0.id,
      clinicId: clinics[i % clinics.length]!.id,
      category: ["VISIT", "PROCEDURE", "LAB", "PHARMACY", "IMAGING"][i % 5]!,
      description: `Posted revenue line ${i + 1}`,
      grossAmount: 400 + i * 25,
      taxAmount: 20 + i,
      netAmount: 380 + i * 25,
      currency: "AED",
      postedAt: new Date(startOfMonth.getTime() + i * 3600000),
      status: RevenueStatus.POSTED,
    })),
  });

  await prisma.revenueEntry.createMany({
    data: [0, 1, 2].map((i) => ({
      tenantId: t0.id,
      clinicId: clinics[i % clinics.length]!.id,
      category: "VISIT",
      description: `Same-day demo revenue ${i + 1}`,
      grossAmount: 550 + i * 50,
      taxAmount: 25,
      netAmount: 525 + i * 50,
      currency: "AED",
      postedAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10 + i, 0, 0),
      status: RevenueStatus.POSTED,
    })),
  });

  await prisma.expense.createMany({
    data: Array.from({ length: 15 }, (_, i) => ({
      tenantId: t0.id,
      clinicId: clinics[i % clinics.length]!.id,
      category: ["UTILITIES", "MATERIALS", "PAYROLL", "MARKETING", "RENT"][i % 5]!,
      vendorName: `Vendor ${i + 1} LLC`,
      amount: 3000 + i * 200,
      currency: "AED",
      incurredAt: new Date(startOfMonth.getTime() + i * 7200000),
      status: i % 3 === 0 ? ExpenseStatus.PENDING : ExpenseStatus.APPROVED,
    })),
  });

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

  const demoAppointmentStatuses: AppointmentStatus[] = [
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.COMPLETED,
  ];

  await prisma.appointment.createMany({
    data: demoAppointmentStatuses.map((st, i) => {
      const day = Math.min(28, 4 + (i % 24));
      const start = new Date(now.getFullYear(), now.getMonth(), day, 8 + (i % 9), (i * 13) % 60, 0);
      const end = new Date(start.getTime() + 30 * 60000);
      return {
        tenantId: t0.id,
        clinicId: clinics[i % clinics.length]!.id,
        patientId: patients[(i + 2) % patients.length]!.id,
        clinicianId: physician.id,
        startsAt: start,
        endsAt: end,
        status: st,
        notes: `Demo appointment ${i + 1} — ${st}`,
      };
    }),
  });

  await prisma.auditLog.createMany({
    data: Array.from({ length: 15 }, (_, i) => ({
      tenantId: t0.id,
      actorId: users[i % users.length]!.id,
      action: ["LOGIN", "CREATE_PATIENT", "UPDATE_ENCOUNTER", "POST_REVENUE", "APPROVE_EXPENSE", "BOOK_APPT", "HR_LEAVE", "FINALIZE_ENCOUNTER", "EXPORT", "SETTINGS", "INVITE", "ROLE_CHANGE", "BACKUP", "SYNC", "REPORT_RUN"][i],
      resource: ["User", "Patient", "Encounter", "RevenueEntry", "Expense", "Appointment", "LeaveRequest", "Employee", "Clinic", "Tenant", "AuditLog", "FeatureFlag", "Diagnosis", "Attendance", "Report"][i],
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
  });

  console.log("Seed OK — main tenant:", t0.id, "| login: admin@demo.clinic or physician@demo.clinic | password: demo");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
