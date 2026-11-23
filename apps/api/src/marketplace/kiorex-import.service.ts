import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, UnprocessableEntityException } from "@nestjs/common";
import { AppointmentStatus, EncounterStatus, Gender, Prisma, PlanKey, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { AuditService } from "../audit/audit.service";
import { normalizePhoneToE164 } from "../common/phone-e164";
import { tenantCreateDefaultsFromMarket } from "../markets/market-tax-pack";
import { PrismaService } from "../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { ensureTenantSubscription } from "../subscriptions/subscription-provision";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";

/**
 * Kiorex org-onboarding import receiver (contract: kiorex-contracts docs/ORG_IMPORT.md).
 *
 * - Tenant isolation: a (client, orgId) pair only ever maps to a tenant THIS receiver provisioned; it never writes into a pre-existing tenant.
 * - Idempotent: every item is keyed by `idempotencyKey` in KiorexImportItem; a replay returns the stored targetId and writes nothing.
 * - Chunk-atomic: all rows of a chunk (and its ledger entries) commit in one transaction; files written before a failed commit are deleted.
 * - Reversible: every created row is in the ledger; rollback deletes them (and their blobs). De-duplicated rows (created=false) are never deleted.
 * - PHI-safe: logs and audit metadata carry ids and counts only, never names, phones, national ids or file names.
 */
export const KIOREX_IMPORT_SCOPE = "ONBOARDING_IMPORT";
export const KIOREX_IMPORT_ENTITIES = ["patients", "appointments", "visits", "billing", "documents"] as const;
export type KiorexImportEntity = (typeof KIOREX_IMPORT_ENTITIES)[number];
const MAX_ITEMS = 500;
const MAX_DOC_BYTES = 15 * 1024 * 1024;
const DOC_MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
const ENTITY_ORDER: KiorexImportEntity[] = ["billing", "visits", "appointments", "documents", "patients"]; // rollback order (children first)

export interface ImportItemIn { idempotencyKey?: string; sourceKey?: string; data?: Record<string, unknown>; file?: { name?: string; contentBase64?: string } }
export interface ImportRecordsBody { orgId?: string; orgName?: string; orgNameAr?: string; entity?: string; items?: ImportItemIn[] }

function str(v: unknown, max = 500): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}
function date(v: unknown): Date | undefined {
  const s = str(v, 40);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
const ARABIC = /[؀-ۿ]/;

@Injectable()
export class KiorexImportService {
  private readonly log = new Logger("kiorex-import");
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private assertScope(client: PlatformIntegrationPrincipal) {
    if (!client.scopes.includes(KIOREX_IMPORT_SCOPE)) {
      throw new ForbiddenException({ code: "IMPORT_SCOPE_REQUIRED", message: `${KIOREX_IMPORT_SCOPE} scope required` });
    }
  }

  /** Find or provision the organization (tenant + one clinic + a locked importer user that owns legacy appointments/visits). */
  private async ensureOrg(client: PlatformIntegrationPrincipal, orgId: string, orgName: string | undefined, orgNameAr: string | undefined) {
    const existing = await this.prisma.kiorexImportOrg.findUnique({ where: { clientId_kiorexOrgId: { clientId: client.id, kiorexOrgId: orgId } } });
    if (existing) return existing;
    if (!orgName) throw new BadRequestException({ code: "ORG_NAME_REQUIRED", message: "orgName is required to provision the organization" });
    const market = await this.prisma.market.findFirst({ where: { code: "EG", status: "LIVE" } });
    if (!market) throw new UnprocessableEntityException({ code: "MARKET_UNAVAILABLE", message: "No live market to provision the organization in" });
    const defaults = tenantCreateDefaultsFromMarket(market);
    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: orgName,
          nameAr: orgNameAr ?? orgName,
          marketId: market.id,
          deploymentCell: defaults.deploymentCell,
          baseCurrency: market.defaultCurrency?.trim() || "EGP",
          defaultLocale: market.defaultLocale || "en",
          defaultVisitFee: defaults.defaultVisitFee,
          defaultInvoiceVatPercent: defaults.defaultInvoiceVatPercent,
          defaultTaxRegistrationNumber: defaults.defaultTaxRegistrationNumber,
        },
      });
      const clinic = await tx.clinic.create({
        data: {
          tenantId: tenant.id,
          nameEn: orgName,
          nameAr: orgNameAr ?? orgName,
          country: "EG",
          city: "Cairo",
          addressEn: "Address pending",
          addressAr: "العنوان قيد التحديث",
          locationUrl: "https://maps.google.com/",
          phone: "0000000000",
          email: "clinic@local.invalid",
          licenseNumber: "LIC-PENDING",
          defaultCurrency: market.defaultCurrency?.trim() || "EGP",
        },
      });
      // Locked, non-seat user: nobody can sign in (random hash, never disclosed), so legacy rows have a valid clinician FK.
      const importer = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: `import-${tenant.id}@import.kiorly.invalid`,
          displayName: "Imported records",
          passwordHash: bcrypt.hashSync(randomBytes(32).toString("hex"), 10),
          role: UserRole.CLINIC_ASSISTANT,
          billingSeatActive: false,
          deactivatedAt: new Date(),
        },
      });
      return tx.kiorexImportOrg.create({ data: { clientId: client.id, kiorexOrgId: orgId, tenantId: tenant.id, clinicId: clinic.id, importerUserId: importer.id } });
    });
    await ensureTenantSubscription(this.prisma as never, created.tenantId, { planKey: PlanKey.LITE, trialDays: 14, trialPlanKey: PlanKey.PRO }).catch(() => undefined);
    await this.audit.recordEvent({ tenantId: created.tenantId, actorId: null, clinicId: created.clinicId, action: "KIOREX_IMPORT_ORG_PROVISIONED", resource: "Tenant", resourceId: created.tenantId, metadata: { clientId: client.id } });
    this.log.log(`org provisioned tenant=${created.tenantId}`);
    return created;
  }

  private async ensureBatch(client: PlatformIntegrationPrincipal, kiorexBatchId: string, orgRowId: string, tenantId: string) {
    const found = await this.prisma.kiorexImportBatch.findUnique({ where: { clientId_kiorexBatchId: { clientId: client.id, kiorexBatchId } } });
    if (found) {
      if (found.orgRowId !== orgRowId) throw new ConflictException({ code: "BATCH_ORG_MISMATCH", message: "Batch belongs to another organization" });
      return found;
    }
    try {
      return await this.prisma.kiorexImportBatch.create({ data: { orgRowId, clientId: client.id, kiorexBatchId, tenantId } });
    } catch {
      return this.prisma.kiorexImportBatch.findUniqueOrThrow({ where: { clientId_kiorexBatchId: { clientId: client.id, kiorexBatchId } } });
    }
  }

  async importRecords(client: PlatformIntegrationPrincipal, kiorexBatchId: string, body: ImportRecordsBody) {
    this.assertScope(client);
    const orgId = str(body?.orgId, 120);
    if (!orgId) throw new BadRequestException({ code: "ORG_REQUIRED", message: "orgId is required" });
    const entity = body.entity as KiorexImportEntity;
    if (!KIOREX_IMPORT_ENTITIES.includes(entity)) throw new BadRequestException({ code: "ENTITY_INVALID", message: "entity is invalid" });
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length || items.length > MAX_ITEMS) throw new BadRequestException({ code: "ITEMS_INVALID", message: `1..${MAX_ITEMS} items required` });
    const prefix = `imp:${kiorexBatchId}:${entity}:`;
    for (const it of items) {
      if (!it?.idempotencyKey || !it.idempotencyKey.startsWith(prefix) || !it.sourceKey || typeof it.data !== "object" || !it.data) {
        throw new BadRequestException({ code: "ITEM_INVALID", message: "each item needs idempotencyKey (imp:<batch>:<entity>:<key>), sourceKey and data" });
      }
    }

    const org = await this.ensureOrg(client, orgId, str(body.orgName, 200), str(body.orgNameAr, 200));
    const batch = await this.ensureBatch(client, kiorexBatchId, org.id, org.tenantId);
    if (batch.status !== "OPEN") throw new ConflictException({ code: "BATCH_NOT_OPEN", message: "Batch was rolled back" });

    const writtenBlobs: string[] = [];
    let created = 0;
    let replayed = 0;
    try {
      const results = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kx-import:${org.tenantId}`}))`;
          const fresh = await tx.kiorexImportBatch.findUniqueOrThrow({ where: { id: batch.id }, select: { status: true } });
          if (fresh.status !== "OPEN") throw new ConflictException({ code: "BATCH_NOT_OPEN", message: "Batch was rolled back" });
          const keys = items.map((i) => i.idempotencyKey!);
          const known = new Map((await tx.kiorexImportItem.findMany({ where: { batchRowId: batch.id, idempotencyKey: { in: keys } } })).map((r) => [r.idempotencyKey, r]));
          const out: Array<{ sourceKey: string; targetId: string }> = [];
          const ctx = { tx, org, batchId: batch.id, mrn: await this.mrnCursor(tx, org.tenantId), seq: 0 };
          for (const it of items) {
            const prior = known.get(it.idempotencyKey!);
            if (prior) { replayed++; out.push({ sourceKey: it.sourceKey!, targetId: prior.targetId }); continue; }
            const r = await this.createOne(ctx, entity, it, writtenBlobs);
            await tx.kiorexImportItem.create({ data: { batchRowId: batch.id, tenantId: org.tenantId, entity, idempotencyKey: it.idempotencyKey!, sourceKey: it.sourceKey!, targetId: r.targetId, created: r.created, storageKey: r.storageKey ?? null } });
            if (r.created) created++;
            out.push({ sourceKey: it.sourceKey!, targetId: r.targetId });
          }
          return out;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      await this.audit.recordEvent({ tenantId: org.tenantId, actorId: null, clinicId: org.clinicId, action: "KIOREX_IMPORT_CHUNK", resource: "Import", resourceId: batch.id, metadata: { entity, items: items.length, created, replayed } });
      this.log.log(`chunk batch=${batch.id} entity=${entity} items=${items.length} created=${created} replayed=${replayed}`);
      return { results, created, replayed };
    } catch (e) {
      for (const key of writtenBlobs) await this.uploads.deleteObject("patients", key).catch(() => undefined);
      throw e;
    }
  }

  private async mrnCursor(tx: Prisma.TransactionClient, tenantId: string): Promise<{ next: number }> {
    const rows = await tx.patient.findMany({ where: { tenantId, mrn: { startsWith: "MRN-" } }, select: { mrn: true } });
    let n = 10000;
    for (const r of rows) { const m = /^MRN-(\d+)$/.exec(r.mrn); if (m) n = Math.max(n, Number.parseInt(m[1], 10)); }
    return { next: n + 1 };
  }

  private async createOne(
    ctx: { tx: Prisma.TransactionClient; org: { tenantId: string; clinicId: string; importerUserId: string }; batchId: string; mrn: { next: number }; seq: number },
    entity: KiorexImportEntity,
    it: ImportItemIn,
    blobs: string[],
  ): Promise<{ targetId: string; created: boolean; storageKey?: string }> {
    const d = it.data!;
    const { tx, org } = ctx;
    if (entity === "patients") return this.createPatient(ctx, d);
    const patientId = str(d.patientTargetId, 80);
    const patient = patientId ? await tx.patient.findFirst({ where: { id: patientId, tenantId: org.tenantId }, select: { id: true, firstNameEn: true, lastNameEn: true, mrn: true } }) : null;
    if (!patient) throw new UnprocessableEntityException({ code: "PATIENT_NOT_IN_ORG", message: "patientTargetId does not belong to this organization" });

    if (entity === "documents") {
      const name = str(it.file?.name ?? d.fileName, 200);
      const b64 = it.file?.contentBase64;
      if (!name || !b64) throw new UnprocessableEntityException({ code: "FILE_REQUIRED", message: "documents need file.name and file.contentBase64" });
      const buf = Buffer.from(b64, "base64");
      const mime = DOC_MIME[path.extname(name).slice(1).toLowerCase()];
      if (!mime) throw new UnprocessableEntityException({ code: "FILE_TYPE_UNSUPPORTED", message: "Unsupported document type" });
      if (!buf.length || buf.length > MAX_DOC_BYTES) throw new UnprocessableEntityException({ code: "FILE_SIZE_INVALID", message: "Document is empty or too large" });
      const docId = randomUUID();
      const safe = path.basename(name).replace(/[^\w.\-]+/g, "_").slice(0, 120) || "document";
      const relativePath = `${org.tenantId}/${patient.id}/docs/${docId}-${safe}`;
      await this.uploads.put("patients", relativePath, buf, mime);
      blobs.push(relativePath);
      await tx.patientDocument.create({ data: { id: docId, tenantId: org.tenantId, patientId: patient.id, description: "Imported document", originalFileName: name, mimeType: mime, sizeBytes: buf.length, relativePath } });
      return { targetId: docId, created: true, storageKey: relativePath };
    }

    if (entity === "appointments") {
      const startsAt = date(d.startsAt);
      if (!startsAt) throw new UnprocessableEntityException({ code: "DATE_INVALID", message: "startsAt is invalid" });
      const raw = str(d.status, 30)?.toUpperCase();
      const status = raw && raw in AppointmentStatus ? (raw as AppointmentStatus) : startsAt.getTime() < Date.now() ? AppointmentStatus.COMPLETED : AppointmentStatus.SCHEDULED;
      const notes = [str(d.doctor, 120) ? `Doctor: ${str(d.doctor, 120)}` : null, str(d.notes, 1000)].filter(Boolean).join("\n") || null;
      const row = await tx.appointment.create({ data: { tenantId: org.tenantId, clinicId: org.clinicId, patientId: patient.id, clinicianId: org.importerUserId, startsAt, status, notes } });
      return { targetId: row.id, created: true };
    }

    if (entity === "visits") {
      const visitedAt = date(d.visitedAt);
      if (!visitedAt) throw new UnprocessableEntityException({ code: "DATE_INVALID", message: "visitedAt is invalid" });
      const doctor = str(d.doctor, 120);
      const row = await tx.encounter.create({
        data: {
          tenantId: org.tenantId, clinicId: org.clinicId, patientId: patient.id, clinicianId: org.importerUserId,
          status: EncounterStatus.FINALIZED, visitType: "IMPORTED", chiefComplaint: str(d.chiefComplaint, 2000) ?? null,
          assessment: str(d.diagnosis, 2000) ?? null, plan: [str(d.plan, 2000), doctor ? `Doctor: ${doctor}` : null].filter(Boolean).join("\n") || null,
          finalizedAt: visitedAt, createdAt: visitedAt,
        },
      });
      return { targetId: row.id, created: true };
    }

    // billing
    const issuedAt = date(d.issuedAt);
    const amountMinor = Number(d.amountMinor);
    const paidMinor = Number(d.paidMinor ?? 0);
    if (!issuedAt || !Number.isFinite(amountMinor) || amountMinor < 0 || !Number.isFinite(paidMinor) || paidMinor < 0) {
      throw new UnprocessableEntityException({ code: "BILLING_INVALID", message: "issuedAt, amountMinor and paidMinor are required" });
    }
    const clinic = await tx.clinic.findUniqueOrThrow({ where: { id: org.clinicId } });
    const currency = str(d.currency, 3)?.toUpperCase() ?? clinic.defaultCurrency;
    const invoiceNumber = `IMP-${ctx.batchId.slice(-6).toUpperCase()}-${String(++ctx.seq).padStart(5, "0")}-${randomBytes(2).toString("hex")}`;
    const row = await tx.invoice.create({
      data: {
        tenantId: org.tenantId, clinicId: org.clinicId, patientId: patient.id, invoiceNumber, issueDate: issuedAt, currency,
        backgroundColor: "#ffffff", sectionsSnapshot: [], patientName: `${patient.firstNameEn} ${patient.lastNameEn}`.trim(), patientMrn: patient.mrn,
        clinicNameEn: clinic.nameEn, clinicNameAr: clinic.nameAr, clinicAddressEn: clinic.addressEn, clinicAddressAr: clinic.addressAr,
        clinicPhone: clinic.phone, clinicEmail: clinic.email, clinicLicenseNumber: clinic.licenseNumber, vatPercentSnapshot: 0,
        lines: { create: [{ purpose: "Imported invoice", amountPaid: paidMinor / 100, quantity: 1, unitPrice: amountMinor / 100 }] },
      },
    });
    return { targetId: row.id, created: true };
  }

  private async createPatient(
    ctx: { tx: Prisma.TransactionClient; org: { tenantId: string; clinicId: string }; mrn: { next: number } },
    d: Record<string, unknown>,
  ): Promise<{ targetId: string; created: boolean }> {
    const { tx, org } = ctx;
    const fullName = str(d.fullName, 200);
    let first = str(d.firstName, 100);
    let last = str(d.lastName, 100);
    if (!first && fullName) { const parts = fullName.split(/\s+/); first = parts[0]; last = last ?? parts.slice(1).join(" "); }
    const phoneRaw = str(d.phone, 40);
    if (!first || !phoneRaw) throw new UnprocessableEntityException({ code: "PATIENT_INVALID", message: "firstName/fullName and phone are required" });
    const phone = normalizePhoneToE164(phoneRaw) ?? phoneRaw;
    const nationalId = str(d.nationalId, 30) ?? null;
    const lastName = last || "-";

    // De-duplicate against patients already in the org: national id, else same phone + same first name.
    let dup = nationalId ? await tx.patient.findFirst({ where: { tenantId: org.tenantId, nationalId, deletedAt: null }, select: { id: true } }) : null;
    if (!dup) dup = await tx.patient.findFirst({ where: { tenantId: org.tenantId, phone, firstNameEn: first, deletedAt: null }, select: { id: true } });
    if (dup) return { targetId: dup.id, created: false };

    const g = str(d.gender, 10)?.toUpperCase();
    const gender = g === "MALE" || g === "M" ? Gender.M : g === "FEMALE" || g === "F" ? Gender.F : Gender.UNKNOWN;
    const arabic = ARABIC.test(first) || ARABIC.test(lastName);
    const mrn = `MRN-${String(ctx.mrn.next++).padStart(5, "0")}`;
    const row = await tx.patient.create({
      data: {
        tenantId: org.tenantId, mrn, firstNameEn: first, lastNameEn: lastName,
        firstNameAr: arabic ? first : null, lastNameAr: arabic ? lastName : null,
        dob: date(d.dob) ?? null, gender, phone, email: str(d.email, 200)?.toLowerCase() ?? null, nationalId,
        homeBranchId: org.clinicId,
      },
    });
    return { targetId: row.id, created: true };
  }

  async rollback(client: PlatformIntegrationPrincipal, kiorexBatchId: string, body: { orgId?: string }) {
    this.assertScope(client);
    const orgId = str(body?.orgId, 120);
    if (!orgId) throw new BadRequestException({ code: "ORG_REQUIRED", message: "orgId is required" });
    const org = await this.prisma.kiorexImportOrg.findUnique({ where: { clientId_kiorexOrgId: { clientId: client.id, kiorexOrgId: orgId } } });
    const batch = org ? await this.prisma.kiorexImportBatch.findUnique({ where: { clientId_kiorexBatchId: { clientId: client.id, kiorexBatchId } } }) : null;
    if (!org || !batch || batch.orgRowId !== org.id) return { removed: 0 }; // nothing was ever committed: idempotent no-op
    const removed = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kx-import:${org.tenantId}`}))`;
        await tx.kiorexImportBatch.update({ where: { id: batch.id }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } }); // closes the batch to new chunks first
        const items = await tx.kiorexImportItem.findMany({ where: { batchRowId: batch.id, created: true } });
        let n = 0;
        const blobs: string[] = [];
        for (const entity of ENTITY_ORDER) {
          const ids = items.filter((i) => i.entity === entity).map((i) => i.targetId);
          if (!ids.length) continue;
          const where = { id: { in: ids }, tenantId: org.tenantId };
          if (entity === "billing") n += (await tx.invoice.deleteMany({ where })).count;
          else if (entity === "visits") n += (await tx.encounter.deleteMany({ where })).count;
          else if (entity === "appointments") n += (await tx.appointment.deleteMany({ where })).count;
          else if (entity === "documents") { n += (await tx.patientDocument.deleteMany({ where })).count; for (const i of items) if (i.entity === "documents" && i.storageKey) blobs.push(i.storageKey); }
          else n += (await tx.patient.deleteMany({ where })).count;
        }
        await tx.kiorexImportItem.deleteMany({ where: { batchRowId: batch.id } });
        for (const key of blobs) await this.uploads.deleteObject("patients", key).catch(() => undefined);
        return n;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await this.audit.recordEvent({ tenantId: org.tenantId, actorId: null, clinicId: org.clinicId, action: "KIOREX_IMPORT_ROLLBACK", resource: "Import", resourceId: batch.id, metadata: { removed } });
    this.log.log(`rollback batch=${batch.id} removed=${removed}`);
    return { removed };
  }
}
