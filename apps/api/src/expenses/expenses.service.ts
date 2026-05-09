import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ExpenseStatus, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { fetchClinicScopeIds } from "../common/clinic-scope";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { resolveReportingRange } from "../common/reporting-range";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateExpenseDto } from "./dto/create-expense.dto";
import type { ExpenseDto } from "./dto/expense.dto";

const MAX_PROOF_BYTES = 15 * 1024 * 1024;
const ALLOWED_PROOF_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
]);

type ProofFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private uploadRoot(): string {
    return path.join(process.cwd(), "uploads", "expenses");
  }

  private map(e: {
    id: string;
    clinicId: string;
    category: string;
    vendorName: string | null;
    amount: { toString(): string };
    currency: string;
    incurredAt: Date;
    status: ExpenseStatus;
    proofRelativePath: string | null;
    proofOriginalName: string | null;
    proofMimeType: string | null;
  }): ExpenseDto {
    return {
      id: e.id,
      clinicId: e.clinicId,
      category: e.category,
      vendorName: e.vendorName,
      amount: Number(e.amount),
      currency: e.currency,
      incurredAt: e.incurredAt.toISOString(),
      status: e.status,
      hasProof: Boolean(e.proofRelativePath),
      proofOriginalName: e.proofOriginalName,
    };
  }

  async list(
    tenantId: string,
    user: JwtUser,
    fromStr?: string,
    toStr?: string,
    pageStr?: string,
    pageSizeStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    clinicIdStr?: string
  ) {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.length) {
      const { page, pageSize } = parsePageParams(pageStr, pageSizeStr);
      return paginate([], 0, page, pageSize);
    }
    const { start, end } = resolveReportingRange(fromStr, toStr);
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(sortByStr, ["incurredAt", "amount", "category", "status", "vendorName"] as const, "incurredAt");
    const sortDir = parseSortOrder(sortOrderStr);
    const clinicId = clinicIdStr?.trim();
    let clinicFilter: Prisma.ExpenseWhereInput = {};
    if (scopeIds !== null) {
      if (clinicId) {
        if (!scopeIds.includes(clinicId)) throw new ForbiddenException("Clinic is outside your assigned scope");
        clinicFilter = { clinicId };
      } else {
        clinicFilter = { clinicId: { in: scopeIds } };
      }
    } else if (clinicId) {
      clinicFilter = { clinicId };
    }
    const where: Prisma.ExpenseWhereInput = {
      tenantId,
      incurredAt: { gte: start, lte: end },
      ...clinicFilter,
    };
    const [total, rows] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
      }),
    ]);
    return paginate(rows.map((r) => this.map(r)), total, page, pageSize);
  }

  async create(tenantId: string, dto: CreateExpenseDto, user: JwtUser, proof?: ProofFile): Promise<ExpenseDto> {
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.includes(dto.clinicId)) {
      throw new ForbiddenException("Clinic is outside your assigned scope");
    }
    const clinic = await this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } });
    if (!clinic) throw new BadRequestException("Invalid clinicId");

    let row = await this.prisma.expense.create({
      data: {
        tenantId,
        clinicId: dto.clinicId,
        category: dto.category,
        vendorName: dto.vendorName ?? null,
        amount: dto.amount,
        currency: dto.currency,
        incurredAt: new Date(dto.incurredAt),
        status: dto.status ?? ExpenseStatus.PENDING,
      },
    });

    if (proof?.buffer?.length) {
      if (proof.size > MAX_PROOF_BYTES) throw new BadRequestException("Proof file too large (max 15MB)");
      const mime = proof.mimetype || "application/octet-stream";
      if (!ALLOWED_PROOF_MIME.has(mime)) throw new BadRequestException(`Unsupported proof file type: ${mime}`);

      const docId = randomUUID();
      const base = path.basename(proof.originalname || "receipt").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "receipt";
      const relativePath = `${tenantId}/${row.id}/${docId}-${base}`;
      const abs = path.join(this.uploadRoot(), tenantId, row.id, `${docId}-${base}`);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, proof.buffer);

      row = await this.prisma.expense.update({
        where: { id: row.id },
        data: {
          proofRelativePath: relativePath,
          proofOriginalName: proof.originalname || base,
          proofMimeType: mime,
        },
      });
    }

    return this.map(row);
  }

  async updateStatus(tenantId: string, id: string, status: ExpenseStatus, user: JwtUser): Promise<ExpenseDto> {
    const existing = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Expense not found");
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.includes(existing.clinicId)) {
      throw new NotFoundException("Expense not found");
    }
    const row = await this.prisma.expense.update({
      where: { id },
      data: { status },
    });
    return this.map(row);
  }

  async getProofFileMeta(tenantId: string, expenseId: string, user: JwtUser): Promise<{ absolutePath: string; mimeType: string; originalFileName: string }> {
    const exp = await this.prisma.expense.findFirst({ where: { id: expenseId, tenantId } });
    if (!exp?.proofRelativePath || !exp.proofOriginalName || !exp.proofMimeType) {
      throw new NotFoundException("No proof attached to this expense");
    }
    const scopeIds = await fetchClinicScopeIds(this.prisma, tenantId, user);
    if (scopeIds !== null && !scopeIds.includes(exp.clinicId)) {
      throw new NotFoundException("No proof attached to this expense");
    }
    const absolutePath = path.join(this.uploadRoot(), exp.proofRelativePath);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException("Proof file missing on disk");
    }
    return {
      absolutePath,
      mimeType: exp.proofMimeType,
      originalFileName: exp.proofOriginalName,
    };
  }

  getProofReadStream(absolutePath: string) {
    return createReadStream(absolutePath);
  }
}
