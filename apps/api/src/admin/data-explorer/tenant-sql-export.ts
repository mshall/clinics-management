import type { PrismaService } from "../../prisma/prisma.service";

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

export async function generateTenantSqlExport(prisma: PrismaService, tenantId: string): Promise<string> {
  const lines: string[] = [
    "-- Kiorly organization SQL export",
    `-- tenantId: ${tenantId}`,
    `-- generatedAt: ${new Date().toISOString()}`,
    "BEGIN;",
    "",
  ];

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) {
    lines.push("-- Tenant");
    lines.push(insertStatement("Tenant", rowToRecord(tenant)));
    lines.push("");
  }

  const users = await prisma.user.findMany({ where: { tenantId }, orderBy: { email: "asc" } });
  if (users.length) {
    lines.push("-- Users");
    for (const row of users) lines.push(insertStatement("User", rowToRecord(row)));
    lines.push("");
  }

  const clinics = await prisma.clinic.findMany({
    where: { tenantId },
    orderBy: [{ parentClinicId: "asc" }, { nameEn: "asc" }],
  });
  if (clinics.length) {
    lines.push("-- Clinics");
    for (const row of clinics) lines.push(insertStatement("Clinic", rowToRecord(row)));
    lines.push("");
  }

  const pushMany = async (label: string, table: string, rows: object[]) => {
    if (!rows.length) return;
    lines.push(`-- ${label}`);
    for (const row of rows) lines.push(insertStatement(table, rowToRecord(row)));
    lines.push("");
  };

  await pushMany(
    "Clinic admin scopes",
    "ClinicAdminScope",
    await prisma.clinicAdminScope.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "User nav tab grants",
    "UserNavTabGrant",
    await prisma.userNavTabGrant.findMany({ where: { tenantId }, orderBy: { updatedAt: "asc" } }),
  );
  await pushMany(
    "Patients",
    "Patient",
    await prisma.patient.findMany({ where: { tenantId }, orderBy: { mrn: "asc" } }),
  );
  await pushMany(
    "Patient documents",
    "PatientDocument",
    await prisma.patientDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "Employees",
    "Employee",
    await prisma.employee.findMany({ where: { tenantId }, orderBy: { employeeNumber: "asc" } }),
  );
  await pushMany(
    "Appointments",
    "Appointment",
    await prisma.appointment.findMany({ where: { tenantId }, orderBy: { startsAt: "asc" } }),
  );
  await pushMany(
    "Encounters",
    "Encounter",
    await prisma.encounter.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "Diagnoses",
    "Diagnosis",
    await prisma.diagnosis.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "Encounter medications",
    "EncounterMedication",
    await prisma.encounterMedication.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "Encounter documents",
    "EncounterDocument",
    await prisma.encounterDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "Operations",
    "Operation",
    await prisma.operation.findMany({ where: { tenantId }, orderBy: { operationDate: "asc" } }),
  );
  await pushMany(
    "Operation documents",
    "OperationDocument",
    await prisma.operationDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "Operation medications",
    "OperationMedication",
    await prisma.operationMedication.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  await pushMany(
    "Expenses",
    "Expense",
    await prisma.expense.findMany({ where: { tenantId }, orderBy: { incurredAt: "asc" } }),
  );
  await pushMany(
    "Revenue entries",
    "RevenueEntry",
    await prisma.revenueEntry.findMany({ where: { tenantId }, orderBy: { postedAt: "asc" } }),
  );
  await pushMany(
    "Attendance",
    "Attendance",
    await prisma.attendance.findMany({
      where: { employee: { tenantId } },
      orderBy: { workDate: "asc" },
    }),
  );
  await pushMany(
    "Leave requests",
    "LeaveRequest",
    await prisma.leaveRequest.findMany({
      where: { employee: { tenantId } },
      orderBy: { startDate: "asc" },
    }),
  );
  await pushMany(
    "Audit logs",
    "AuditLog",
    await prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );

  lines.push("COMMIT;");
  lines.push("");
  return lines.join("\n");
}
