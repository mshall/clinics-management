import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";

const SKIP_PATH_PREFIXES = ["health/"];

const RESOURCE_NAMES: Record<string, string> = {
  patients: "Patient",
  users: "User",
  clinics: "Clinic",
  encounters: "Encounter",
  appointments: "Appointment",
  expenses: "Expense",
  revenue: "RevenueEntry",
  operations: "Operation",
  hr: "HR",
  auth: "Auth",
  "user-nav-tabs": "UserNavTab",
  "data-explorer": "DataExplorer",
  "tenant-settings": "Tenant",
  "feature-flags": "FeatureFlag",
  "audit-logs": "AuditLog",
  "org-hierarchy": "OrgHierarchy",
  platform: "Platform",
  overview: "Admin",
};

function resourceFromPath(parts: string[]): string {
  if (parts[0] === "admin") {
    const sub = parts[1] ?? "admin";
    return RESOURCE_NAMES[sub] ?? sub.replace(/-/g, " ");
  }
  if (parts.includes("encounter-documents")) return "EncounterDocument";
  if (parts.includes("documents")) return "Document";
  return RESOURCE_NAMES[parts[0] ?? ""] ?? (parts[0] ?? "Unknown").replace(/-/g, " ");
}

function looksLikeId(segment: string): boolean {
  return /^[a-z0-9]{20,}$/i.test(segment);
}

function actionFromRequest(method: string, parts: string[]): string {
  const m = method.toUpperCase();
  const last = parts[parts.length - 1] ?? "";
  const root = parts[0] ?? "resource";

  if (parts.includes("login")) return "LOGIN";
  if (last === "bulk-delete") return `BULK_DELETE_${root.toUpperCase()}`;
  if (last === "crop") return parts.includes("encounter-documents") ? "CROP_ENCOUNTER_DOCUMENT" : "CROP_PATIENT_DOCUMENT";
  if (last === "finalize") return "FINALIZE_ENCOUNTER";

  if (parts.includes("encounter-documents")) {
    if (m === "DELETE") return "DELETE_ENCOUNTER_DOCUMENT";
  }

  if (parts.includes("national-id-document")) {
    if (m === "POST") return "UPLOAD_NATIONAL_ID_DOCUMENT";
    if (m === "GET") return "VIEW_NATIONAL_ID_DOCUMENT";
  }

  if (parts.includes("documents")) {
    const documentsIdx = parts.indexOf("documents");
    const segmentAfterDocuments = parts[documentsIdx + 1];
    if (m === "POST" && last === "documents") {
      return root === "encounters" ? "UPLOAD_ENCOUNTER_DOCUMENT" : "UPLOAD_PATIENT_DOCUMENT";
    }
    if (m === "DELETE" && looksLikeId(last)) {
      return root === "encounters" ? "DELETE_ENCOUNTER_DOCUMENT" : "DELETE_PATIENT_DOCUMENT";
    }
    if (m === "GET" && (last === "file" || (looksLikeId(last) && segmentAfterDocuments === last))) {
      return root === "encounters" ? "VIEW_ENCOUNTER_DOCUMENT" : "VIEW_PATIENT_DOCUMENT";
    }
  }

  if (m === "GET" && parts.length === 2 && looksLikeId(parts[1]!)) {
    const viewActions: Record<string, string> = {
      patients: "VIEW_PATIENT",
      encounters: "VIEW_ENCOUNTER",
      appointments: "VIEW_APPOINTMENT",
      operations: "VIEW_OPERATION",
      expenses: "VIEW_EXPENSE",
      revenue: "VIEW_REVENUE",
      clinics: "VIEW_CLINIC",
      users: "VIEW_USER",
    };
    if (viewActions[root]) return viewActions[root]!;
  }

  if (m === "GET" && last === "clinical-documents" && root === "patients") {
    return "VIEW_PATIENT_CLINICAL_DOCUMENTS";
  }

  const resourceToken = resourceFromPath(parts).replace(/\s+/g, "_").toUpperCase();
  if (m === "POST") return `CREATE_${resourceToken}`;
  if (m === "PATCH") return `UPDATE_${resourceToken}`;
  if (m === "DELETE") return `DELETE_${resourceToken}`;
  if (m === "PUT") return `UPDATE_${resourceToken}`;
  if (m === "GET") return `VIEW_${resourceToken}`;
  return `${m}_${resourceToken}`;
}

function shouldAuditGet(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return false;
  if (parts.includes("national-id-document")) return true;
  if (lastSegmentIsClinicalDocumentsList(parts)) return true;
  if (parts.includes("documents")) {
    const documentsIdx = parts.indexOf("documents");
    const after = parts[documentsIdx + 1];
    if (after && looksLikeId(after)) return true;
  }
  if (parts.length === 2 && looksLikeId(parts[1]!)) {
    return ["patients", "encounters", "appointments", "operations", "expenses", "revenue", "clinics", "users"].includes(
      parts[0]!,
    );
  }
  return false;
}

function lastSegmentIsClinicalDocumentsList(parts: string[]): boolean {
  return parts[parts.length - 1] === "clinical-documents" && parts[parts.length - 2] !== undefined;
}

function pickResourceId(parts: string[], response: unknown): string | null {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (looksLikeId(parts[i]!)) return parts[i]!;
  }
  if (response && typeof response === "object" && "id" in response) {
    const id = (response as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

function pickClinicId(body: unknown, response: unknown): string | null {
  const fromObj = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    const cid = rec.clinicId ?? rec.homeBranchId;
    return typeof cid === "string" && cid.length > 0 ? cid : null;
  };
  return fromObj(body) ?? fromObj(response);
}

function safeMetadata(method: string, path: string, body: unknown): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = { method, path };
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const rec = { ...(body as Record<string, unknown>) };
    delete rec.password;
    delete rec.passwordHash;
    if (Object.keys(rec).length > 0) meta.body = rec;
  }
  return meta;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordFromHttp(
    user: JwtUser | undefined,
    method: string,
    rawPath: string,
    body: unknown,
    response: unknown,
  ): Promise<void> {
    if (!user?.tenantId || !user.userId) return;

    const path = rawPath.split("?")[0].replace(/^\/api\/v1\/?/, "");
    if (!path || SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) return;

    const m = method.toUpperCase();
    const isRead = ["GET", "HEAD", "OPTIONS"].includes(m);
    if (isRead && !shouldAuditGet(path)) return;

    const parts = path.split("/").filter(Boolean);
    const resource = resourceFromPath(parts);
    const action = actionFromRequest(m, parts);
    const resourceId = pickResourceId(parts, response);
    const clinicId = pickClinicId(body, response);

    await this.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      clinicId,
      action,
      resource,
      resourceId,
      metadata: safeMetadata(m, path, body),
    });
  }

  async recordLogin(user: { id: string; tenantId: string | null }, email: string): Promise<void> {
    if (!user.tenantId) return;
    await this.record({
      tenantId: user.tenantId,
      actorId: user.id,
      clinicId: null,
      action: "LOGIN",
      resource: "Auth",
      resourceId: user.id,
      metadata: { email },
    });
  }

  private async record(entry: {
    tenantId: string;
    actorId: string;
    clinicId: string | null;
    action: string;
    resource: string;
    resourceId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          actorId: entry.actorId,
          clinicId: entry.clinicId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`Audit log write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
