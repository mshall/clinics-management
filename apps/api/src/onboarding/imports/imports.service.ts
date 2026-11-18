import { randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  BookingSource,
  ImportEntity,
  ImportJobStatus,
  PatientAcquisitionChannel,
  Prisma,
  UserRole,
  type ImportJob,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { CountryCode } from "libphonenumber-js";
import { AuditService } from "../../audit/audit.service";
import { hasRole } from "../../common/effective-roles";
import { normalizePhoneToE164 } from "../../common/phone-e164";
import { PrismaService } from "../../prisma/prisma.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../../storage/upload-blob.storage";
import { parseSpreadsheet, toCsv } from "./import-parse";
import { IMPORT_COLUMNS } from "./import-templates";
import {
  phoneKey,
  resolveNationalIdPattern,
  validateImport,
  type AppointmentImportRow,
  type ImportRowError,
  type ImportValidationContext,
  type PatientImportRow,
  type PriceImportRow,
  type StaffImportRow,
} from "./import-validate";

export const IMPORT_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
export const IMPORT_MAX_ROWS = 20_000;
const CHUNK = 1000;
const PREVIEW_ROWS = 20;
const ERROR_PREVIEW = 500;

export type ImportActor = { tenantId: string; userId: string; actingRepUserId?: string | null };

export type DedupeMode = "SKIP" | "MERGE";

type CreatedIds = { patients?: string[]; appointments?: string[]; catalogItems?: string[]; users?: string[] };

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  /** In-flight commits (tests await these to measure end-to-end duration). */
  readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private async buildContext(tenantId: string, entity: ImportEntity): Promise<ImportValidationContext> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { market: { select: { code: true, clinicalConfig: true, defaultTimezone: true } } },
    });
    const country = tenant.market?.code ?? "EG";
    const ctx: ImportValidationContext = {
      country,
      nationalIdPattern: resolveNationalIdPattern(tenant.market?.code ?? null, tenant.market?.clinicalConfig),
      patientsByPhone: new Map(),
      patientsByNationalId: new Map(),
      patientsByMrn: new Map(),
      cliniciansByEmail: new Map(),
      clinicsByName: new Map(),
      defaultClinic: null,
      catalogCodes: new Set(),
      userEmails: new Set(),
    };
    if (entity === ImportEntity.PATIENTS || entity === ImportEntity.APPOINTMENTS) {
      const patients = await this.prisma.patient.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, mrn: true, phone: true, nationalId: true },
      });
      for (const p of patients) {
        const e164 = normalizePhoneToE164(p.phone, country as CountryCode);
        const key = phoneKey(e164 ?? p.phone);
        if (key && !ctx.patientsByPhone.has(key)) ctx.patientsByPhone.set(key, { id: p.id, mrn: p.mrn });
        if (p.nationalId) ctx.patientsByNationalId.set(p.nationalId.trim(), { id: p.id, mrn: p.mrn });
        ctx.patientsByMrn.set(p.mrn, { id: p.id });
      }
    }
    if (entity === ImportEntity.APPOINTMENTS) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ role: UserRole.PHYSICIAN }, { additionalRoles: { has: UserRole.PHYSICIAN } }],
        },
        select: { id: true, email: true },
      });
      for (const u of users) ctx.cliniciansByEmail.set(u.email.toLowerCase(), u.id);
      const clinics = await this.prisma.clinic.findMany({
        where: { tenantId },
        select: { id: true, nameEn: true, nameAr: true, timezone: true },
        orderBy: { createdAt: "asc" },
      });
      const fallbackTz = tenant.market?.defaultTimezone?.trim() || "UTC";
      for (const c of clinics) {
        const entry = { id: c.id, timezone: c.timezone?.trim() || fallbackTz };
        ctx.clinicsByName.set(c.nameEn.trim().toLowerCase(), entry);
        if (c.nameAr) ctx.clinicsByName.set(c.nameAr.trim().toLowerCase(), entry);
        ctx.defaultClinic ??= entry;
      }
    }
    if (entity === ImportEntity.PRICE_LIST) {
      const items = await this.prisma.serviceCatalogItem.findMany({ where: { tenantId }, select: { code: true } });
      for (const i of items) ctx.catalogCodes.add(i.code.toUpperCase());
    }
    if (entity === ImportEntity.STAFF) {
      const users = await this.prisma.user.findMany({ where: { tenantId }, select: { email: true } });
      for (const u of users) ctx.userEmails.add(u.email.toLowerCase());
    }
    return ctx;
  }

  async upload(
    actor: ImportActor,
    entity: ImportEntity,
    file: { originalname: string; buffer: Buffer; mimetype: string },
    dedupeMode: DedupeMode = "SKIP",
  ) {
    if (!Object.values(ImportEntity).includes(entity)) throw new BadRequestException("entity is invalid");
    if (dedupeMode !== "SKIP" && dedupeMode !== "MERGE") throw new BadRequestException("dedupeMode is invalid");
    let rows: string[][];
    try {
      rows = parseSpreadsheet(file.originalname, file.buffer);
    } catch {
      throw new BadRequestException({ message: "Unreadable spreadsheet", code: "IMPORT_FILE_UNREADABLE" });
    }
    if (rows.length - 1 > IMPORT_MAX_ROWS) {
      throw new BadRequestException({ message: `At most ${IMPORT_MAX_ROWS} rows per file`, code: "IMPORT_TOO_MANY_ROWS" });
    }

    const jobId = randomUUID();
    const ext = /\.xlsx$/i.test(file.originalname) ? "xlsx" : "csv";
    const fileKey = `${actor.tenantId}/${jobId}.${ext}`;
    await this.uploads.put("imports", fileKey, file.buffer, file.mimetype || "application/octet-stream");
    await this.prisma.importJob.create({
      data: {
        id: jobId,
        tenantId: actor.tenantId,
        entity,
        fileKey,
        fileName: file.originalname.slice(0, 200),
        dedupeMode,
        createdBy: actor.userId,
        actingRepUserId: actor.actingRepUserId ?? null,
      },
    });

    const ctx = await this.buildContext(actor.tenantId, entity);
    const result = validateImport(entity, rows, ctx);
    const errorRows = new Set(result.errors.map((e) => e.row)).size;
    let reportKey: string | null = null;
    if (result.errors.length) {
      reportKey = `${actor.tenantId}/${jobId}-errors.csv`;
      await this.uploads.put("imports", reportKey, this.errorReportCsv(entity, result.errors), "text/csv");
    }
    const missing = result.missingColumns;
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: missing.length ? ImportJobStatus.FAILED : ImportJobStatus.READY,
        failureMessage: missing.length ? `MISSING_COLUMNS:${missing.join(",")}` : null,
        totalRows: result.totalRows,
        okRows: result.valid.length,
        errorRows,
        duplicateRows: result.duplicateRows,
        rowsJson: result.valid as unknown as Prisma.InputJsonValue,
        errorsJson: result.errors as unknown as Prisma.InputJsonValue,
        reportKey,
        finishedAt: missing.length ? new Date() : null,
      },
    });
    await this.audit.recordEvent({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      clinicId: null,
      action: "IMPORT_UPLOADED",
      resource: "ImportJob",
      resourceId: jobId,
      metadata: { entity, totalRows: result.totalRows, errorRows, actingRepUserId: actor.actingRepUserId ?? null },
    });
    return this.get(actor.tenantId, jobId);
  }

  private errorReportCsv(entity: ImportEntity, errors: ImportRowError[]): Buffer {
    const labels = new Map(IMPORT_COLUMNS[entity].map((c) => [c.key, `${c.en} / ${c.ar}`]));
    return toCsv([
      ["Row / الصف", "Column / العمود", "Error / الخطأ"],
      ...errors.map((e) => [String(e.row), labels.get(e.field) ?? e.field, e.code]),
    ]);
  }

  private async findJob(tenantId: string, id: string): Promise<ImportJob> {
    const job = await this.prisma.importJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException("Import not found");
    return job;
  }

  private summary(job: ImportJob) {
    const valid = Array.isArray(job.rowsJson) ? (job.rowsJson as unknown[]) : [];
    const errors = Array.isArray(job.errorsJson) ? (job.errorsJson as unknown as ImportRowError[]) : [];
    return {
      id: job.id,
      entity: job.entity,
      fileName: job.fileName,
      status: job.status,
      dedupeMode: job.dedupeMode,
      totalRows: job.totalRows,
      okRows: job.okRows,
      errorRows: job.errorRows,
      duplicateRows: job.duplicateRows,
      createdRows: job.createdRows,
      mergedRows: job.mergedRows,
      failureMessage: job.failureMessage,
      hasErrorReport: Boolean(job.reportKey),
      actingRepUserId: job.actingRepUserId,
      createdAt: job.createdAt.toISOString(),
      committedAt: job.committedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      undoUntil: job.undoUntil?.toISOString() ?? null,
      undoneAt: job.undoneAt?.toISOString() ?? null,
      canUndo: job.status === ImportJobStatus.DONE && !!job.undoUntil && job.undoUntil.getTime() > Date.now(),
      preview: valid.slice(0, PREVIEW_ROWS),
      errors: errors.slice(0, ERROR_PREVIEW),
    };
  }

  async get(tenantId: string, id: string) {
    return this.summary(await this.findJob(tenantId, id));
  }

  async list(tenantId: string) {
    const jobs = await this.prisma.importJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jobs.map((j) => {
      const { preview: _p, errors: _e, ...rest } = this.summary(j);
      return rest;
    });
  }

  async errorReport(tenantId: string, id: string) {
    const job = await this.findJob(tenantId, id);
    if (!job.reportKey) throw new NotFoundException("No error report");
    return {
      fileName: `${job.entity.toLowerCase()}-import-errors.csv`,
      stream: await this.uploads.getReadStream("imports", job.reportKey),
    };
  }

  /** Flip READY → COMMITTING and run the write in the background so the request returns immediately. */
  async commit(actor: ImportActor, id: string, dedupeMode?: DedupeMode) {
    const job = await this.findJob(actor.tenantId, id);
    if (dedupeMode && dedupeMode !== "SKIP" && dedupeMode !== "MERGE") throw new BadRequestException("dedupeMode is invalid");
    const flipped = await this.prisma.importJob.updateMany({
      where: { id, tenantId: actor.tenantId, status: ImportJobStatus.READY },
      data: { status: ImportJobStatus.COMMITTING, ...(dedupeMode ? { dedupeMode } : {}) },
    });
    if (!flipped.count) throw new ConflictException({ message: `Import is ${job.status}`, code: "IMPORT_NOT_READY" });
    const run = new Promise<void>((resolve) => {
      setImmediate(() => {
        this.runCommit(id, actor)
          .catch((err: unknown) => this.logger.error(`import ${id} failed: ${err instanceof Error ? err.message : String(err)}`))
          .finally(() => {
            this.running.delete(id);
            resolve();
          });
      });
    });
    this.running.set(id, run);
    return this.get(actor.tenantId, id);
  }

  async runCommit(id: string, actor: ImportActor): Promise<void> {
    const job = await this.prisma.importJob.findUniqueOrThrow({ where: { id } });
    const rows = (Array.isArray(job.rowsJson) ? job.rowsJson : []) as unknown[];
    const created: CreatedIds = {};
    let merged = 0;
    try {
      switch (job.entity) {
        case ImportEntity.PATIENTS:
          merged = await this.commitPatients(job, rows as PatientImportRow[], created);
          break;
        case ImportEntity.APPOINTMENTS:
          await this.commitAppointments(job, rows as AppointmentImportRow[], created);
          break;
        case ImportEntity.PRICE_LIST:
          await this.commitPriceList(job, rows as PriceImportRow[], created);
          break;
        case ImportEntity.STAFF:
          await this.commitStaff(job, rows as StaffImportRow[], created);
          break;
      }
    } catch (err) {
      await this.deleteCreated(job.tenantId, created, false).catch(() => undefined);
      await this.prisma.importJob.update({
        where: { id },
        data: {
          status: ImportJobStatus.FAILED,
          failureMessage: err instanceof Error ? err.message.slice(0, 500) : "COMMIT_FAILED",
          finishedAt: new Date(),
        },
      });
      throw err;
    }
    const now = new Date();
    const createdRows = Object.values(created).reduce((n, ids) => n + (ids?.length ?? 0), 0);
    await this.prisma.importJob.update({
      where: { id },
      data: {
        status: ImportJobStatus.DONE,
        createdRows,
        mergedRows: merged,
        createdIdsJson: created as Prisma.InputJsonValue,
        rowsJson: Prisma.DbNull,
        committedAt: now,
        finishedAt: now,
        undoUntil: new Date(now.getTime() + IMPORT_UNDO_WINDOW_MS),
      },
    });
    await this.audit.recordEvent({
      tenantId: job.tenantId,
      actorId: actor.userId,
      clinicId: null,
      action: "IMPORT_COMMITTED",
      resource: "ImportJob",
      resourceId: id,
      metadata: { entity: job.entity, createdRows, mergedRows: merged, actingRepUserId: job.actingRepUserId },
    });
  }

  private async nextMrnNumber(tenantId: string): Promise<number> {
    const rows = await this.prisma.patient.findMany({
      where: { tenantId, mrn: { startsWith: "MRN-" } },
      select: { mrn: true },
    });
    let n = 10000;
    for (const r of rows) {
      const m = /^MRN-(\d+)$/.exec(r.mrn);
      if (m) n = Math.max(n, Number.parseInt(m[1], 10));
    }
    return n + 1;
  }

  private async commitPatients(job: ImportJob, rows: PatientImportRow[], created: CreatedIds): Promise<number> {
    let mrn = await this.nextMrnNumber(job.tenantId);
    const fresh = rows.filter((r) => !r.matchPatientId);
    created.patients = [];
    for (let i = 0; i < fresh.length; i += CHUNK) {
      const data: Prisma.PatientCreateManyInput[] = fresh.slice(i, i + CHUNK).map((r) => ({
        id: randomUUID(),
        tenantId: job.tenantId,
        mrn: `MRN-${String(mrn++).padStart(5, "0")}`,
        firstNameEn: r.firstNameEn,
        lastNameEn: r.lastNameEn,
        firstNameAr: r.firstNameAr,
        lastNameAr: r.lastNameAr,
        phone: r.phone,
        nationalId: r.nationalId,
        dob: r.dob ? new Date(r.dob) : null,
        gender: r.gender,
        email: r.email,
        acquisitionChannel: PatientAcquisitionChannel.IMPORT,
      }));
      await this.prisma.patient.createMany({ data });
      created.patients.push(...data.map((d) => d.id!));
    }
    if (job.dedupeMode !== "MERGE") return 0;
    let merged = 0;
    for (const r of rows.filter((x) => x.matchPatientId)) {
      const existing = await this.prisma.patient.findFirst({
        where: { id: r.matchPatientId!, tenantId: job.tenantId },
        select: { firstNameAr: true, lastNameAr: true, nationalId: true, dob: true, email: true, gender: true },
      });
      if (!existing) continue;
      const patch: Prisma.PatientUpdateInput = {};
      if (!existing.firstNameAr && r.firstNameAr) patch.firstNameAr = r.firstNameAr;
      if (!existing.lastNameAr && r.lastNameAr) patch.lastNameAr = r.lastNameAr;
      if (!existing.nationalId && r.nationalId) patch.nationalId = r.nationalId;
      if (!existing.dob && r.dob) patch.dob = new Date(r.dob);
      if (!existing.email && r.email) patch.email = r.email;
      if (existing.gender === "UNKNOWN" && r.gender !== "UNKNOWN") patch.gender = r.gender;
      if (!Object.keys(patch).length) continue;
      await this.prisma.patient.update({ where: { id: r.matchPatientId! }, data: patch });
      merged++;
    }
    return merged;
  }

  private async commitAppointments(job: ImportJob, rows: AppointmentImportRow[], created: CreatedIds): Promise<void> {
    created.appointments = [];
    const checkedAt = new Date();
    for (let i = 0; i < rows.length; i += CHUNK) {
      const data: Prisma.AppointmentCreateManyInput[] = rows.slice(i, i + CHUNK).map((r) => {
        const startsAt = new Date(r.startsAt);
        const attended = r.status === AppointmentStatus.COMPLETED;
        return {
          id: randomUUID(),
          tenantId: job.tenantId,
          clinicId: r.clinicId,
          patientId: r.patientId,
          clinicianId: r.clinicianId,
          startsAt,
          endsAt: new Date(r.endsAt),
          status: r.status,
          checkedInAt: attended ? startsAt : null,
          notes: r.notes,
          bookingSource: BookingSource.IMPORT,
          isNewPatientAtBooking: false,
          newPatientCheckedAt: checkedAt,
        };
      });
      await this.prisma.appointment.createMany({ data });
      created.appointments.push(...data.map((d) => d.id!));
    }
  }

  private async commitPriceList(job: ImportJob, rows: PriceImportRow[], created: CreatedIds): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: job.tenantId }, select: { baseCurrency: true } });
    const today = new Date(new Date().toISOString().slice(0, 10));
    created.catalogItems = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({ r, id: randomUUID() }));
      await this.prisma.$transaction([
        this.prisma.serviceCatalogItem.createMany({
          data: chunk.map(({ r, id }) => ({
            id,
            tenantId: job.tenantId,
            code: r.code,
            nameEn: r.nameEn,
            nameAr: r.nameAr,
            category: r.category,
          })),
        }),
        this.prisma.servicePrice.createMany({
          data: chunk.map(({ r, id }) => ({
            tenantId: job.tenantId,
            catalogItemId: id,
            effectiveFrom: today,
            amount: new Prisma.Decimal(r.amount),
            currency: tenant.baseCurrency,
          })),
        }),
      ]);
      created.catalogItems.push(...chunk.map((c) => c.id));
    }
  }

  private async commitStaff(job: ImportJob, rows: StaffImportRow[], created: CreatedIds): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId: job.tenantId }, select: { clinicianSeats: true } });
    let activePhysicians = await this.prisma.user.count({
      where: { tenantId: job.tenantId, deletedAt: null, role: UserRole.PHYSICIAN, billingSeatActive: true },
    });
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const data: Prisma.UserCreateManyInput[] = rows.map((r) => {
      let billingSeatActive = true;
      if (hasRole(r, UserRole.PHYSICIAN)) {
        billingSeatActive = !sub || activePhysicians < sub.clinicianSeats;
        if (billingSeatActive) activePhysicians++;
      }
      return {
        id: randomUUID(),
        tenantId: job.tenantId,
        email: r.email,
        displayName: r.displayName,
        role: r.role,
        passwordHash,
        billingSeatActive,
      };
    });
    await this.prisma.user.createMany({ data });
    created.users = data.map((d) => d.id!);
  }

  /** Delete rows created by a job; with `onlyUntouched`, rows edited or used since the import are kept. */
  private async deleteCreated(
    tenantId: string,
    created: CreatedIds,
    onlyUntouched: boolean,
    committedAt?: Date | null,
  ): Promise<{ deleted: number; kept: number }> {
    let deleted = 0;
    let kept = 0;
    const cutoff = committedAt ? new Date(committedAt.getTime() + 1000) : null;
    const touchedFilter = <T extends object>(base: T, extra: object): T =>
      onlyUntouched && cutoff ? ({ ...base, ...extra } as T) : base;

    if (created.appointments?.length) {
      const ids = created.appointments;
      const res = await this.prisma.appointment.deleteMany({
        where: touchedFilter(
          { tenantId, id: { in: ids } } as Prisma.AppointmentWhereInput,
          { updatedAt: { lte: cutoff }, encounters: { none: {} }, revenueEntries: { none: {} } },
        ),
      });
      deleted += res.count;
      kept += ids.length - res.count;
    }
    if (created.patients?.length) {
      const ids = created.patients;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const res = await this.prisma.patient.deleteMany({
          where: touchedFilter(
            { tenantId, id: { in: slice } } as Prisma.PatientWhereInput,
            {
              updatedAt: { lte: cutoff },
              appointments: { none: {} },
              encounters: { none: {} },
              invoices: { none: {} },
              documents: { none: {} },
              billingPayments: { none: {} },
            },
          ),
        });
        deleted += res.count;
        kept += slice.length - res.count;
      }
    }
    if (created.catalogItems?.length) {
      const ids = created.catalogItems;
      const res = await this.prisma.serviceCatalogItem.deleteMany({
        where: touchedFilter(
          { tenantId, id: { in: ids } } as Prisma.ServiceCatalogItemWhereInput,
          { updatedAt: { lte: cutoff }, invoiceLines: { none: {} } },
        ),
      });
      deleted += res.count;
      kept += ids.length - res.count;
    }
    if (created.users?.length) {
      const ids = created.users;
      const res = await this.prisma.user.deleteMany({
        where: touchedFilter(
          { tenantId, id: { in: ids } } as Prisma.UserWhereInput,
          { updatedAt: { lte: cutoff }, authSessions: { none: {} }, appointments: { none: {} }, encounters: { none: {} } },
        ),
      });
      deleted += res.count;
      kept += ids.length - res.count;
    }
    return { deleted, kept };
  }

  async undo(actor: ImportActor, id: string) {
    const job = await this.findJob(actor.tenantId, id);
    if (job.status !== ImportJobStatus.DONE) {
      throw new ConflictException({ message: `Import is ${job.status}`, code: "IMPORT_NOT_UNDOABLE" });
    }
    if (!job.undoUntil || job.undoUntil.getTime() <= Date.now()) {
      throw new ConflictException({ message: "Undo window (24h) has passed", code: "IMPORT_UNDO_EXPIRED" });
    }
    const created = (job.createdIdsJson ?? {}) as CreatedIds;
    const result = await this.deleteCreated(actor.tenantId, created, true, job.committedAt);
    await this.prisma.importJob.update({
      where: { id },
      data: { status: ImportJobStatus.UNDONE, undoneAt: new Date() },
    });
    await this.audit.recordEvent({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      clinicId: null,
      action: "IMPORT_UNDONE",
      resource: "ImportJob",
      resourceId: id,
      metadata: { entity: job.entity, ...result },
    });
    return { ...(await this.get(actor.tenantId, id)), undo: result };
  }
}
