import type { PrismaClient } from "@prisma/client";

const PATIENT_RESOURCE_NAMES = new Set([
  "Patient",
  "Encounter",
  "Appointment",
  "Operation",
  "IntegrationAppointment",
  "IntegrationOperation",
]);

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pickPatientIdFromObjects(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const rec = src as Record<string, unknown>;
    const id = readString(rec, "patientId");
    if (id) return id;
    const nestedBody = rec.body;
    if (nestedBody && typeof nestedBody === "object" && !Array.isArray(nestedBody)) {
      const fromBody = readString(nestedBody as Record<string, unknown>, "patientId");
      if (fromBody) return fromBody;
    }
  }
  return null;
}

function pickMrnFromObjects(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const rec = src as Record<string, unknown>;
    for (const key of ["patientMrn", "mrn"]) {
      const v = readString(rec, key);
      if (v) return v;
    }
    const nestedBody = rec.body;
    if (nestedBody && typeof nestedBody === "object" && !Array.isArray(nestedBody)) {
      const bodyRec = nestedBody as Record<string, unknown>;
      for (const key of ["patientMrn", "mrn"]) {
        const v = readString(bodyRec, key);
        if (v) return v;
      }
    }
  }
  return null;
}

async function patientRow(
  prisma: PrismaClient,
  tenantId: string,
  patientId: string,
): Promise<{ id: string; mrn: string } | null> {
  return prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true, mrn: true },
  });
}

async function patientByMrn(prisma: PrismaClient, tenantId: string, mrn: string): Promise<{ id: string; mrn: string } | null> {
  return prisma.patient.findFirst({
    where: { tenantId, mrn: { equals: mrn, mode: "insensitive" } },
    select: { id: true, mrn: true },
  });
}

async function patientFromResourceId(
  prisma: PrismaClient,
  tenantId: string,
  resource: string,
  resourceId: string,
): Promise<{ id: string; mrn: string } | null> {
  if (resource === "Patient") {
    return patientRow(prisma, tenantId, resourceId);
  }
  if (resource === "Encounter") {
    const row = await prisma.encounter.findFirst({
      where: { id: resourceId, tenantId },
      select: { patient: { select: { id: true, mrn: true } } },
    });
    return row?.patient ?? null;
  }
  if (resource === "Appointment" || resource === "IntegrationAppointment") {
    const row = await prisma.appointment.findFirst({
      where: { id: resourceId, tenantId },
      select: { patient: { select: { id: true, mrn: true } } },
    });
    return row?.patient ?? null;
  }
  if (resource === "Operation" || resource === "IntegrationOperation") {
    const row = await prisma.operation.findFirst({
      where: { id: resourceId, tenantId },
      select: { patient: { select: { id: true, mrn: true } } },
    });
    return row?.patient ?? null;
  }
  return null;
}

export async function resolvePatientAuditContext(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    resource: string;
    resourceId: string | null;
    body?: unknown;
    response?: unknown;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ patientId: string | null; patientMrn: string | null }> {
  let patientId = pickPatientIdFromObjects(input.body, input.response, input.metadata);
  let patientMrn = pickMrnFromObjects(input.body, input.response, input.metadata);

  if (!patientId && patientMrn) {
    const row = await patientByMrn(prisma, tenantId, patientMrn);
    if (row) {
      patientId = row.id;
      patientMrn = row.mrn;
    }
  }

  if (!patientId && input.resourceId && PATIENT_RESOURCE_NAMES.has(input.resource)) {
    const row = await patientFromResourceId(prisma, tenantId, input.resource, input.resourceId);
    if (row) {
      patientId = row.id;
      patientMrn = row.mrn;
    }
  }

  if (patientId && !patientMrn) {
    const row = await patientRow(prisma, tenantId, patientId);
    if (row) patientMrn = row.mrn;
  }

  return { patientId, patientMrn };
}

export async function resolvePatientFromRequestContext(
  prisma: PrismaClient,
  tenantId: string,
  httpPath: string | null | undefined,
  requestContext: Record<string, unknown> | null | undefined,
): Promise<{ patientId: string | null; patientMrn: string | null }> {
  const body = requestContext?.body;
  let patientId = pickPatientIdFromObjects(body, requestContext);
  let patientMrn = pickMrnFromObjects(body, requestContext);

  const path = httpPath ?? "";
  const appointmentMatch = path.match(/\/appointments\/([a-z0-9]+)/i);
  const operationMatch = path.match(/\/operations\/([a-z0-9]+)/i);

  if (!patientId && appointmentMatch?.[1] && !path.includes("/availability")) {
    const row = await prisma.appointment.findFirst({
      where: { id: appointmentMatch[1], tenantId },
      select: { patient: { select: { id: true, mrn: true } } },
    });
    if (row?.patient) {
      patientId = row.patient.id;
      patientMrn = row.patient.mrn;
    }
  }

  if (!patientId && operationMatch?.[1] && !path.endsWith("/operations")) {
    const row = await prisma.operation.findFirst({
      where: { id: operationMatch[1], tenantId },
      select: { patient: { select: { id: true, mrn: true } } },
    });
    if (row?.patient) {
      patientId = row.patient.id;
      patientMrn = row.patient.mrn;
    }
  }

  const payload = requestContext?.payload;
  if (!patientId && payload && typeof payload === "object") {
    patientId = pickPatientIdFromObjects(payload);
  }

  if (!patientId && patientMrn) {
    const row = await patientByMrn(prisma, tenantId, patientMrn);
    if (row) {
      patientId = row.id;
      patientMrn = row.mrn;
    }
  }

  if (patientId && !patientMrn) {
    const row = await patientRow(prisma, tenantId, patientId);
    if (row) patientMrn = row.mrn;
  }

  return { patientId, patientMrn };
}
