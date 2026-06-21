import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";

const SKIP_PATH_PREFIXES = ["health/", "dashboards/", "reports/"];

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
  return RESOURCE_NAMES[parts[0] ?? ""] ?? (parts[0] ?? "Unknown").replace(/-/g, " ");
}

function actionFromRequest(method: string, parts: string[], resource: string): string {
  const last = parts[parts.length - 1] ?? "";
  const resourceToken = resource.replace(/\s+/g, "_").toUpperCase();
  if (parts.includes("login")) return "LOGIN";
  if (last === "bulk-delete") return `BULK_DELETE_${resourceToken}`;
  if (method === "POST") return `CREATE_${resourceToken}`;
  if (method === "PATCH") return `UPDATE_${resourceToken}`;
  if (method === "DELETE") return `DELETE_${resourceToken}`;
  if (method === "PUT") return `UPDATE_${resourceToken}`;
  return `${method}_${resourceToken}`;
}

function looksLikeId(segment: string): boolean {
  return /^[a-z0-9]{20,}$/i.test(segment);
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
    if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return;

    const path = rawPath.split("?")[0].replace(/^\/api\/v1\/?/, "");
    if (!path || SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) return;

    const parts = path.split("/").filter(Boolean);
    const resource = resourceFromPath(parts);
    const action = actionFromRequest(method.toUpperCase(), parts, resource);
    const resourceId = pickResourceId(parts, response);
    const clinicId = pickClinicId(body, response);

    await this.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      clinicId,
      action,
      resource,
      resourceId,
      metadata: safeMetadata(method.toUpperCase(), path, body),
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
