import type { PrismaService } from "../../prisma/prisma.service";

/** Explorer table keys included in SQL export (FK-safe order). */
export const SQL_EXPORT_ENTITY_KEYS = [
  "tenants",
  "users",
  "clinics",
  "clinic_admin_scopes",
  "user_nav_tab_grants",
  "patients",
  "patient_documents",
  "employees",
  "appointments",
  "encounters",
  "diagnoses",
  "encounter_medications",
  "encounter_documents",
  "operations",
  "operation_documents",
  "operation_medications",
  "expenses",
  "revenue_entries",
  "attendances",
  "leave_requests",
  "audit_logs",
] as const;

export type SqlExportEntityKey = (typeof SQL_EXPORT_ENTITY_KEYS)[number];

const PLATFORM_EXPORT_ENTITY_KEYS = ["feature_flags"] as const;

const EXPORT_KEY_ORDER = [...SQL_EXPORT_ENTITY_KEYS, ...PLATFORM_EXPORT_ENTITY_KEYS];

function sqlQuoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "object") {
    if ((value as object).constructor?.name === "Decimal") {
      return (value as { toString: () => string }).toString();
    }
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertStatement(table: string, row: Record<string, unknown>): string {
  const keys = Object.keys(row);
  const cols = keys.map((k) => sqlQuoteIdent(k)).join(", ");
  const vals = keys.map((k) => sqlLiteral(row[k])).join(", ");
  return `INSERT INTO ${sqlQuoteIdent(table)} (${cols}) VALUES (${vals});`;
}

function rowToRecord(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v;
  }
  return out;
}

function pushRows(lines: string[], label: string, table: string, rows: object[]) {
  if (!rows.length) return;
  lines.push(`-- ${label}`);
  for (const row of rows) lines.push(insertStatement(table, rowToRecord(row)));
  lines.push("");
}

export function resolveSqlExportKeys(
  requested: string[] | undefined,
  opts: { allowFeatureFlags: boolean },
): string[] {
  const allowed = new Set<string>([
    ...SQL_EXPORT_ENTITY_KEYS,
    ...(opts.allowFeatureFlags ? PLATFORM_EXPORT_ENTITY_KEYS : []),
  ]);
  if (!requested?.length) return [...SQL_EXPORT_ENTITY_KEYS];
  const keys: string[] = [];
  for (const key of requested) {
    const k = key.trim();
    if (!k || !allowed.has(k)) continue;
    if (!keys.includes(k)) keys.push(k);
  }
  return keys.sort((a, b) => EXPORT_KEY_ORDER.indexOf(a as never) - EXPORT_KEY_ORDER.indexOf(b as never));
}

async function exportEntity(prisma: PrismaService, tenantId: string, key: string, lines: string[]): Promise<void> {
  switch (key) {
    case "feature_flags":
      pushRows(lines, "Feature flags", "FeatureFlag", await prisma.featureFlag.findMany({ orderBy: { key: "asc" } }));
      break;
    case "tenants": {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (tenant) {
        lines.push("-- Tenant");
        lines.push(insertStatement("Tenant", rowToRecord(tenant)));
        lines.push("");
      }
      break;
    }
    case "users":
      pushRows(lines, "Users", "User", await prisma.user.findMany({ where: { tenantId }, orderBy: { email: "asc" } }));
      break;
    case "clinics":
      pushRows(
        lines,
        "Clinics",
        "Clinic",
        await prisma.clinic.findMany({ where: { tenantId }, orderBy: [{ parentClinicId: "asc" }, { nameEn: "asc" }] }),
      );
      break;
    case "clinic_admin_scopes":
      pushRows(
        lines,
        "Clinic admin scopes",
        "ClinicAdminScope",
        await prisma.clinicAdminScope.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "user_nav_tab_grants":
      pushRows(
        lines,
        "User nav tab grants",
        "UserNavTabGrant",
        await prisma.userNavTabGrant.findMany({ where: { tenantId }, orderBy: { updatedAt: "asc" } }),
      );
      break;
    case "patients":
      pushRows(lines, "Patients", "Patient", await prisma.patient.findMany({ where: { tenantId }, orderBy: { mrn: "asc" } }));
      break;
    case "patient_documents":
      pushRows(
        lines,
        "Patient documents",
        "PatientDocument",
        await prisma.patientDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "employees":
      pushRows(
        lines,
        "Employees",
        "Employee",
        await prisma.employee.findMany({ where: { tenantId }, orderBy: { employeeNumber: "asc" } }),
      );
      break;
    case "appointments":
      pushRows(
        lines,
        "Appointments",
        "Appointment",
        await prisma.appointment.findMany({ where: { tenantId }, orderBy: { startsAt: "asc" } }),
      );
      break;
    case "encounters":
      pushRows(
        lines,
        "Encounters",
        "Encounter",
        await prisma.encounter.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "diagnoses":
      pushRows(
        lines,
        "Diagnoses",
        "Diagnosis",
        await prisma.diagnosis.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "encounter_medications":
      pushRows(
        lines,
        "Encounter medications",
        "EncounterMedication",
        await prisma.encounterMedication.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "encounter_documents":
      pushRows(
        lines,
        "Encounter documents",
        "EncounterDocument",
        await prisma.encounterDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "operations":
      pushRows(
        lines,
        "Operations",
        "Operation",
        await prisma.operation.findMany({ where: { tenantId }, orderBy: { operationDate: "asc" } }),
      );
      break;
    case "operation_documents":
      pushRows(
        lines,
        "Operation documents",
        "OperationDocument",
        await prisma.operationDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "operation_medications":
      pushRows(
        lines,
        "Operation medications",
        "OperationMedication",
        await prisma.operationMedication.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    case "expenses":
      pushRows(
        lines,
        "Expenses",
        "Expense",
        await prisma.expense.findMany({ where: { tenantId }, orderBy: { incurredAt: "asc" } }),
      );
      break;
    case "revenue_entries":
      pushRows(
        lines,
        "Revenue entries",
        "RevenueEntry",
        await prisma.revenueEntry.findMany({ where: { tenantId }, orderBy: { postedAt: "asc" } }),
      );
      break;
    case "attendances":
      pushRows(
        lines,
        "Attendance",
        "Attendance",
        await prisma.attendance.findMany({ where: { employee: { tenantId } }, orderBy: { workDate: "asc" } }),
      );
      break;
    case "leave_requests":
      pushRows(
        lines,
        "Leave requests",
        "LeaveRequest",
        await prisma.leaveRequest.findMany({ where: { employee: { tenantId } }, orderBy: { startDate: "asc" } }),
      );
      break;
    case "audit_logs":
      pushRows(
        lines,
        "Audit logs",
        "AuditLog",
        await prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      );
      break;
    default:
      break;
  }
}

export async function generateTenantSqlExport(
  prisma: PrismaService,
  tenantId: string,
  options?: { tables?: string[]; allowFeatureFlags?: boolean },
): Promise<string> {
  const resolved = resolveSqlExportKeys(options?.tables, {
    allowFeatureFlags: options?.allowFeatureFlags ?? false,
  });
  if (!resolved.length) {
    throw new Error("No exportable entities selected");
  }

  const lines: string[] = [
    "-- Kiorly organization SQL export",
    `-- tenantId: ${tenantId}`,
    `-- generatedAt: ${new Date().toISOString()}`,
    `-- entities: ${resolved.join(", ")}`,
    "--",
    "-- Import: apply Prisma migrations on the target PostgreSQL database first, then run:",
    "--   psql $DATABASE_URL -f organization-export.sql",
    "-- FK checks are relaxed during import (PostgreSQL session_replication_role).",
    "",
    "BEGIN;",
    "SET session_replication_role = replica;",
    "",
  ];

  for (const key of resolved) {
    await exportEntity(prisma, tenantId, key, lines);
  }

  lines.push("SET session_replication_role = DEFAULT;");
  lines.push("COMMIT;");
  lines.push("");
  return lines.join("\n");
}
