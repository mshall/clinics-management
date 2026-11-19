import { AppointmentStatus, Gender, ImportEntity, UserRole } from "@prisma/client";
import type { CountryCode } from "libphonenumber-js";
import { DateTime } from "luxon";
import { normalizePhoneToE164 } from "../../common/phone-e164";
import { parseDayMonthYear, parseTimeOfDay, toAsciiDigits, type SheetRows } from "./import-parse";
import { mapHeaders } from "./import-templates";

export type ImportRowError = { row: number; field: string; code: string };

export type PatientImportRow = {
  row: number;
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  phone: string;
  nationalId: string | null;
  dob: string | null;
  gender: Gender;
  email: string | null;
  matchPatientId: string | null;
};

export type AppointmentImportRow = {
  row: number;
  patientId: string;
  clinicianId: string;
  clinicId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes: string | null;
};

export type PriceImportRow = { row: number; code: string; nameEn: string; nameAr: string; category: string; amount: string };

export type StaffImportRow = { row: number; displayName: string; email: string; role: UserRole };

export type ImportValidRow = PatientImportRow | AppointmentImportRow | PriceImportRow | StaffImportRow;

export type ImportValidationContext = {
  /** Market ISO country (phone parsing default). */
  country: string;
  nationalIdPattern: RegExp | null;
  patientsByPhone: Map<string, { id: string; mrn: string }>;
  patientsByNationalId: Map<string, { id: string; mrn: string }>;
  patientsByMrn: Map<string, { id: string }>;
  cliniciansByEmail: Map<string, string>;
  clinicsByName: Map<string, { id: string; timezone: string }>;
  defaultClinic: { id: string; timezone: string } | null;
  catalogCodes: Set<string>;
  userEmails: Set<string>;
};

export type ImportValidationResult = {
  totalRows: number;
  valid: ImportValidRow[];
  errors: ImportRowError[];
  duplicateRows: number;
  missingColumns: string[];
};

/** Market defaults for national ID format when the market pack has no `clinicalConfig.nationalIdPattern`. */
export const NATIONAL_ID_PATTERN_DEFAULTS: Record<string, string> = {
  EG: "^[23]\\d{13}$",
  AE: "^784-?\\d{4}-?\\d{7}-?\\d$",
  SA: "^[12]\\d{9}$",
};

export function resolveNationalIdPattern(marketCode: string | null, clinicalConfig: unknown): RegExp | null {
  const cfg = clinicalConfig && typeof clinicalConfig === "object" ? (clinicalConfig as Record<string, unknown>) : {};
  const raw = typeof cfg.nationalIdPattern === "string" ? cfg.nationalIdPattern : NATIONAL_ID_PATTERN_DEFAULTS[marketCode ?? ""];
  if (!raw) return null;
  try {
    return new RegExp(raw);
  } catch {
    return null;
  }
}

const AR_NAME = /^[\u0600-\u06FF\s'’.-]+$/;
const LATIN_NAME = /^[\p{Script=Latin}\s'’.-]+$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_APPT_MINUTES = 15;

const GENDER_ALIASES: Record<string, Gender> = {
  m: Gender.M,
  male: Gender.M,
  ذكر: Gender.M,
  f: Gender.F,
  female: Gender.F,
  أنثى: Gender.F,
  انثى: Gender.F,
  انثي: Gender.F,
};

const STAFF_ROLES: Record<string, UserRole> = {
  physician: UserRole.PHYSICIAN,
  doctor: UserRole.PHYSICIAN,
  طبيب: UserRole.PHYSICIAN,
  دكتور: UserRole.PHYSICIAN,
  nurse: UserRole.NURSE,
  ممرض: UserRole.NURSE,
  ممرضة: UserRole.NURSE,
  receptionist: UserRole.RECEPTIONIST,
  استقبال: UserRole.RECEPTIONIST,
  call_center: UserRole.CALL_CENTER,
  hr_officer: UserRole.HR_OFFICER,
  finance_officer: UserRole.FINANCE_OFFICER,
  محاسب: UserRole.FINANCE_OFFICER,
  clinic_admin: UserRole.CLINIC_ADMIN,
  clinic_assistant: UserRole.CLINIC_ASSISTANT,
  مساعد: UserRole.CLINIC_ASSISTANT,
  branch_manager: UserRole.BRANCH_MANAGER,
};

const APPT_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
]);

export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

function toRecords(entity: ImportEntity, rows: SheetRows): { records: Record<string, string>[]; missing: string[] } {
  if (!rows.length) return { records: [], missing: [] };
  const { keys, missing } = mapHeaders(entity, rows[0]);
  const records = rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k) rec[k] = (cells[i] ?? "").trim();
    });
    return rec;
  });
  return { records, missing };
}

function validatePatients(records: Record<string, string>[], ctx: ImportValidationContext): ImportValidationResult {
  const errors: ImportRowError[] = [];
  const valid: PatientImportRow[] = [];
  const seenPhones = new Set<string>();
  const seenIds = new Set<string>();
  let duplicateRows = 0;
  records.forEach((r, i) => {
    const row = i + 2;
    const rowErrors: ImportRowError[] = [];
    const fail = (field: string, code: string) => rowErrors.push({ row, field, code });

    const firstNameAr = r.firstNameAr || "";
    const lastNameAr = r.lastNameAr || "";
    const firstNameEn = r.firstNameEn || "";
    const lastNameEn = r.lastNameEn || "";
    if (!firstNameEn && !firstNameAr) fail("firstNameEn", "NAME_REQUIRED");
    if (firstNameAr && !AR_NAME.test(firstNameAr)) fail("firstNameAr", "ARABIC_NAME_INVALID");
    if (lastNameAr && !AR_NAME.test(lastNameAr)) fail("lastNameAr", "ARABIC_NAME_INVALID");
    if (firstNameEn && !LATIN_NAME.test(firstNameEn)) fail("firstNameEn", "ENGLISH_NAME_INVALID");
    if (lastNameEn && !LATIN_NAME.test(lastNameEn)) fail("lastNameEn", "ENGLISH_NAME_INVALID");

    const phoneRaw = toAsciiDigits(r.phone || "");
    const phone = phoneRaw ? normalizePhoneToE164(phoneRaw, ctx.country as CountryCode) : null;
    if (!phoneRaw) fail("phone", "PHONE_REQUIRED");
    else if (!phone) fail("phone", "PHONE_INVALID");

    const nationalId = toAsciiDigits(r.nationalId || "").replace(/\s/g, "") || null;
    if (nationalId && ctx.nationalIdPattern && !ctx.nationalIdPattern.test(nationalId)) fail("nationalId", "NATIONAL_ID_INVALID");

    let dob: string | null = null;
    if (r.dob) {
      const d = parseDayMonthYear(r.dob);
      if (!d || d.getTime() > Date.now()) fail("dob", "DATE_INVALID");
      else dob = d.toISOString();
    }

    let gender: Gender = Gender.UNKNOWN;
    if (r.gender) {
      const g = GENDER_ALIASES[r.gender.trim().toLowerCase()];
      if (!g) fail("gender", "GENDER_INVALID");
      else gender = g;
    }

    const email = r.email?.toLowerCase() || null;
    if (email && !EMAIL.test(email)) fail("email", "EMAIL_INVALID");

    const pk = phone ? phoneKey(phone) : null;
    if (!rowErrors.length) {
      if ((pk && seenPhones.has(pk)) || (nationalId && seenIds.has(nationalId))) fail("phone", "DUPLICATE_IN_FILE");
    }
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    if (pk) seenPhones.add(pk);
    if (nationalId) seenIds.add(nationalId);
    const match = (nationalId && ctx.patientsByNationalId.get(nationalId)) || (pk && ctx.patientsByPhone.get(pk)) || null;
    if (match) duplicateRows++;
    valid.push({
      row,
      firstNameEn: firstNameEn || firstNameAr,
      lastNameEn: lastNameEn || lastNameAr,
      firstNameAr: firstNameAr || null,
      lastNameAr: lastNameAr || null,
      phone: phone!,
      nationalId,
      dob,
      gender,
      email,
      matchPatientId: match ? match.id : null,
    });
  });
  return { totalRows: records.length, valid, errors, duplicateRows, missingColumns: [] };
}

function validateAppointments(records: Record<string, string>[], ctx: ImportValidationContext): ImportValidationResult {
  const errors: ImportRowError[] = [];
  const valid: AppointmentImportRow[] = [];
  records.forEach((r, i) => {
    const row = i + 2;
    const rowErrors: ImportRowError[] = [];
    const fail = (field: string, code: string) => rowErrors.push({ row, field, code });

    let patientId: string | null = null;
    if (r.patientMrn) patientId = ctx.patientsByMrn.get(r.patientMrn.trim())?.id ?? null;
    if (!patientId && r.patientPhone) {
      const e164 = normalizePhoneToE164(toAsciiDigits(r.patientPhone), ctx.country as CountryCode);
      if (e164) patientId = ctx.patientsByPhone.get(phoneKey(e164))?.id ?? null;
    }
    if (!r.patientMrn && !r.patientPhone) fail("patientPhone", "PATIENT_REQUIRED");
    else if (!patientId) fail("patientPhone", "PATIENT_NOT_FOUND");

    const clinicianId = ctx.cliniciansByEmail.get((r.clinicianEmail || "").toLowerCase()) ?? null;
    if (!clinicianId) fail("clinicianEmail", "CLINICIAN_NOT_FOUND");

    const clinic = r.clinic ? ctx.clinicsByName.get(r.clinic.trim().toLowerCase()) ?? null : ctx.defaultClinic;
    if (!clinic) fail("clinic", "CLINIC_NOT_FOUND");

    const day = r.date ? parseDayMonthYear(r.date) : null;
    if (!day) fail("date", "DATE_INVALID");
    const minutes = r.time ? parseTimeOfDay(r.time) : null;
    if (minutes === null) fail("time", "TIME_INVALID");

    let duration = DEFAULT_APPT_MINUTES;
    if (r.durationMinutes) {
      duration = Number(toAsciiDigits(r.durationMinutes));
      if (!Number.isInteger(duration) || duration <= 0 || duration > 480) fail("durationMinutes", "DURATION_INVALID");
    }

    let status: AppointmentStatus = AppointmentStatus.SCHEDULED;
    if (r.status) {
      const s = r.status.trim().toUpperCase() as AppointmentStatus;
      if (!APPT_STATUSES.has(s)) fail("status", "STATUS_INVALID");
      else status = s;
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    const start = DateTime.fromObject(
      {
        year: day!.getUTCFullYear(),
        month: day!.getUTCMonth() + 1,
        day: day!.getUTCDate(),
        hour: Math.floor(minutes! / 60),
        minute: minutes! % 60,
      },
      { zone: clinic!.timezone },
    ).toUTC();
    valid.push({
      row,
      patientId: patientId!,
      clinicianId: clinicianId!,
      clinicId: clinic!.id,
      startsAt: start.toISO()!,
      endsAt: start.plus({ minutes: duration }).toISO()!,
      status,
      notes: r.notes || null,
    });
  });
  return { totalRows: records.length, valid, errors, duplicateRows: 0, missingColumns: [] };
}

function validatePriceList(records: Record<string, string>[], ctx: ImportValidationContext): ImportValidationResult {
  const errors: ImportRowError[] = [];
  const valid: PriceImportRow[] = [];
  const seen = new Set<string>();
  records.forEach((r, i) => {
    const row = i + 2;
    const rowErrors: ImportRowError[] = [];
    const fail = (field: string, code: string) => rowErrors.push({ row, field, code });
    const code = (r.code || "").trim().toUpperCase();
    if (!code) fail("code", "CODE_REQUIRED");
    else if (ctx.catalogCodes.has(code)) fail("code", "CODE_EXISTS");
    else if (seen.has(code)) fail("code", "DUPLICATE_IN_FILE");
    if (!r.nameEn && !r.nameAr) fail("nameEn", "NAME_REQUIRED");
    const amount = Number(toAsciiDigits(r.price || "").replace(/,/g, ""));
    if (!r.price || !Number.isFinite(amount) || amount < 0) fail("price", "PRICE_INVALID");
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    seen.add(code);
    valid.push({
      row,
      code,
      nameEn: r.nameEn || r.nameAr,
      nameAr: r.nameAr || "",
      category: (r.category || "GENERAL").toUpperCase(),
      amount: amount.toFixed(2),
    });
  });
  return { totalRows: records.length, valid, errors, duplicateRows: 0, missingColumns: [] };
}

function validateStaff(records: Record<string, string>[], ctx: ImportValidationContext): ImportValidationResult {
  const errors: ImportRowError[] = [];
  const valid: StaffImportRow[] = [];
  const seen = new Set<string>();
  records.forEach((r, i) => {
    const row = i + 2;
    const rowErrors: ImportRowError[] = [];
    const fail = (field: string, code: string) => rowErrors.push({ row, field, code });
    if (!r.displayName) fail("displayName", "NAME_REQUIRED");
    const email = (r.email || "").toLowerCase();
    if (!EMAIL.test(email)) fail("email", "EMAIL_INVALID");
    else if (ctx.userEmails.has(email)) fail("email", "EMAIL_EXISTS");
    else if (seen.has(email)) fail("email", "DUPLICATE_IN_FILE");
    const role = STAFF_ROLES[(r.role || "").trim().toLowerCase().replace(/\s+/g, "_")];
    if (!role) fail("role", "ROLE_INVALID");
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    seen.add(email);
    valid.push({ row, displayName: r.displayName, email, role: role! });
  });
  return { totalRows: records.length, valid, errors, duplicateRows: 0, missingColumns: [] };
}

export function validateImport(entity: ImportEntity, rows: SheetRows, ctx: ImportValidationContext): ImportValidationResult {
  const { records, missing } = toRecords(entity, rows);
  if (missing.length) {
    return { totalRows: records.length, valid: [], errors: [], duplicateRows: 0, missingColumns: missing };
  }
  switch (entity) {
    case ImportEntity.PATIENTS:
      return validatePatients(records, ctx);
    case ImportEntity.APPOINTMENTS:
      return validateAppointments(records, ctx);
    case ImportEntity.PRICE_LIST:
      return validatePriceList(records, ctx);
    case ImportEntity.STAFF:
      return validateStaff(records, ctx);
  }
}
