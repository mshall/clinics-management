import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { SubscriptionStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isTenantOwnerPrincipal } from "../common/effective-roles";
import { PrismaService } from "../prisma/prisma.service";
import {
  SubscriptionAccessAction,
  subscriptionAllowsAction,
} from "../subscriptions/subscription-access-policy";

const EXPORT_TTL_HOURS = 72;
const RETENTION_DAYS = 30;

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "empty\n";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

@Injectable()
export class TenantExportService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertExportAllowed(tenantId: string, user: JwtUser) {
    if (!isTenantOwnerPrincipal(user) && !user.isTenantOwner) {
      // Allow GROUP_ADMIN as owner-equivalent for exports.
      const roles = [user.role, ...(user.additionalRoles ?? [])];
      if (!roles.includes("GROUP_ADMIN" as never)) {
        throw new ForbiddenException({ message: "Only the clinic owner can request exports", code: "EXPORT_OWNER_ONLY" });
      }
    }
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { status: true } });
    const status = sub?.status ?? SubscriptionStatus.ACTIVE;
    if (!subscriptionAllowsAction(status, SubscriptionAccessAction.EXPORT, user)) {
      throw new ForbiddenException({ message: "Export not allowed in this subscription state", code: "EXPORT_DENIED" });
    }
  }

  async requestTenantExport(tenantId: string, user: JwtUser) {
    await this.assertExportAllowed(tenantId, user);
    const job = await this.prisma.tenantExportJob.create({
      data: {
        tenantId,
        scope: "TENANT",
        status: "PENDING",
        requestedBy: user.userId,
      },
    });
    return this.runJob(job.id);
  }

  async requestPatientExport(tenantId: string, user: JwtUser, patientId: string) {
    await this.assertExportAllowed(tenantId, user);
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null } });
    if (!patient) throw new NotFoundException("Patient not found");
    const job = await this.prisma.tenantExportJob.create({
      data: {
        tenantId,
        scope: "PATIENT",
        patientId,
        status: "PENDING",
        requestedBy: user.userId,
      },
    });
    return this.runJob(job.id);
  }

  async getJob(tenantId: string, id: string, user: JwtUser) {
    await this.assertExportAllowed(tenantId, user);
    const job = await this.prisma.tenantExportJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException("Export not found");
    return this.publicJob(job);
  }

  async downloadByToken(token: string) {
    const hash = createHash("sha256").update(token).digest("hex");
    const job = await this.prisma.tenantExportJob.findFirst({ where: { downloadTokenHash: hash } });
    if (!job || job.status !== "READY" || !job.artifactPath) {
      throw new NotFoundException("Export link invalid or expired");
    }
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ message: "Export link expired", code: "EXPORT_EXPIRED" });
    }
    const { readFile } = await import("fs/promises");
    const body = await readFile(job.artifactPath);
    return { body, filename: `kiorly-export-${job.id}.zip.txt`, contentType: "text/plain; charset=utf-8" };
  }

  private publicJob(job: {
    id: string;
    scope: string;
    status: string;
    expiresAt: Date | null;
    completedAt: Date | null;
    rowCounts: unknown;
    error: string | null;
    patientId: string | null;
  }) {
    return {
      id: job.id,
      scope: job.scope,
      status: job.status,
      patientId: job.patientId,
      expiresAt: job.expiresAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      rowCounts: job.rowCounts,
      error: job.error,
      downloadPath: job.status === "READY" ? `/api/v1/exports/${job.id}` : null,
    };
  }

  private async runJob(jobId: string) {
    const job = await this.prisma.tenantExportJob.findUniqueOrThrow({ where: { id: jobId } });
    try {
      const patients = await this.prisma.patient.findMany({
        where: {
          tenantId: job.tenantId,
          deletedAt: null,
          ...(job.patientId ? { id: job.patientId } : {}),
        },
        take: 5000,
        select: {
          id: true,
          mrn: true,
          firstNameEn: true,
          lastNameEn: true,
          phone: true,
          createdAt: true,
        },
      });
      const encounters = await this.prisma.encounter.findMany({
        where: {
          tenantId: job.tenantId,
          ...(job.patientId ? { patientId: job.patientId } : {}),
        },
        take: 5000,
        select: { id: true, patientId: true, status: true, finalizedAt: true, createdAt: true },
      });
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId: job.tenantId,
          ...(job.patientId ? { patientId: job.patientId } : {}),
        },
        take: 5000,
        select: {
          id: true,
          patientId: true,
          invoiceNumber: true,
          currency: true,
          createdAt: true,
          patientName: true,
        },
      });

      const parts = [
        "# patients.csv\n" + toCsv(patients as unknown as Record<string, unknown>[]),
        "# encounters.csv\n" + toCsv(encounters as unknown as Record<string, unknown>[]),
        "# invoices.csv\n" +
          toCsv(
            invoices.map((i) => ({
              id: i.id,
              invoiceNumber: i.invoiceNumber,
              patientId: i.patientId,
              patientName: i.patientName,
              currency: i.currency,
              createdAt: i.createdAt.toISOString(),
            })),
          ),
      ];
      const artifact = parts.join("\n\n");
      const dir = join(process.cwd(), ".data", "exports", job.tenantId);
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${job.id}.txt`);
      await writeFile(path, artifact, "utf8");
      const token = randomBytes(24).toString("hex");
      const hash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + EXPORT_TTL_HOURS * 3600_000);
      const updated = await this.prisma.tenantExportJob.update({
        where: { id: job.id },
        data: {
          status: "READY",
          artifactPath: path,
          downloadTokenHash: hash,
          expiresAt,
          completedAt: new Date(),
          rowCounts: {
            patients: patients.length,
            encounters: encounters.length,
            invoices: invoices.length,
          },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          tenantId: job.tenantId,
          actorId: job.requestedBy,
          action: "tenant.export.ready",
          resource: "TenantExportJob",
          resourceId: job.id,
          metadata: { scope: job.scope, patientId: job.patientId },
        },
      });
      return { ...this.publicJob(updated), downloadToken: token };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const failed = await this.prisma.tenantExportJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: msg.slice(0, 500), completedAt: new Date() },
      });
      return this.publicJob(failed);
    }
  }

  async getOffboarding(tenantId: string, user: JwtUser) {
    await this.assertExportAllowed(tenantId, user);
    const row = await this.prisma.tenantOffboarding.findUnique({ where: { tenantId } });
    return (
      row ?? {
        tenantId,
        cancelledAt: null,
        retentionEndsAt: null,
        deletionScheduledAt: null,
        deletedAt: null,
        legalHold: false,
        noticeSentAt: null,
      }
    );
  }

  async startOffboarding(tenantId: string, user: JwtUser, opts: { legalHold?: boolean } = {}) {
    await this.assertExportAllowed(tenantId, user);
    const now = new Date();
    const retentionEndsAt = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
    const row = await this.prisma.tenantOffboarding.upsert({
      where: { tenantId },
      create: {
        tenantId,
        cancelledAt: now,
        retentionEndsAt,
        deletionScheduledAt: retentionEndsAt,
        legalHold: Boolean(opts.legalHold),
        noticeSentAt: now,
      },
      update: {
        cancelledAt: now,
        retentionEndsAt,
        deletionScheduledAt: retentionEndsAt,
        legalHold: Boolean(opts.legalHold),
        noticeSentAt: now,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: "tenant.offboarding.started",
        resource: "TenantOffboarding",
        resourceId: tenantId,
        metadata: { legalHold: row.legalHold, retentionEndsAt: retentionEndsAt.toISOString() },
      },
    });
    return row;
  }

  async setLegalHold(tenantId: string, user: JwtUser, legalHold: boolean) {
    await this.assertExportAllowed(tenantId, user);
    const existing = await this.prisma.tenantOffboarding.findUnique({ where: { tenantId } });
    if (!existing) throw new BadRequestException("Start offboarding first");
    if (legalHold) {
      return this.prisma.tenantOffboarding.update({
        where: { tenantId },
        data: { legalHold: true, deletionScheduledAt: null },
      });
    }
    return this.prisma.tenantOffboarding.update({
      where: { tenantId },
      data: {
        legalHold: false,
        deletionScheduledAt: existing.retentionEndsAt ?? new Date(Date.now() + RETENTION_DAYS * 86_400_000),
      },
    });
  }
}
