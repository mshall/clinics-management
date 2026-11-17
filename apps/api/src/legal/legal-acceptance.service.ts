import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PlanKey } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  isLegalDocumentId,
  LEGAL_CATALOG,
  type LegalDocumentId,
  isPaidPlanKey,
  requiredLegalForPlanChange,
  requiredLegalForSignup,
} from "./legal-catalog";

export type LegalAcceptanceInput = { document: string; version: string };

@Injectable()
export class LegalAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  validateAcceptancePayload(items: LegalAcceptanceInput[] | undefined, required: LegalDocumentId[]): void {
    const list = items ?? [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!isLegalDocumentId(item.document)) {
        throw new BadRequestException(`Unknown legal document: ${item.document}`);
      }
      const expected = LEGAL_CATALOG[item.document].version;
      if (item.version !== expected) {
        throw new BadRequestException(
          `Legal document ${item.document} version mismatch (expected ${expected})`,
        );
      }
      seen.add(item.document);
    }
    for (const doc of required) {
      if (!seen.has(doc)) {
        throw new ForbiddenException({
          message: `Acceptance required for ${LEGAL_CATALOG[doc].titleEn} (${doc})`,
          errorCode: "LEGAL_ACCEPTANCE_REQUIRED",
          document: doc,
          version: LEGAL_CATALOG[doc].version,
        });
      }
    }
  }

  assertSignupLegal(planKey: PlanKey | string, items: LegalAcceptanceInput[] | undefined): void {
    this.validateAcceptancePayload(items, requiredLegalForSignup(planKey));
  }

  validateAcceptanceVersions(items: LegalAcceptanceInput[] | undefined): void {
    for (const item of items ?? []) {
      if (!item.document?.trim() || !item.version?.trim()) {
        throw new BadRequestException("Each acceptance must include document and version");
      }
      if (!isLegalDocumentId(item.document)) {
        throw new BadRequestException(`Unknown legal document: ${item.document}`);
      }
      const expected = LEGAL_CATALOG[item.document].version;
      if (item.version !== expected) {
        throw new BadRequestException(
          `Legal document ${item.document} version mismatch (expected ${expected})`,
        );
      }
    }
  }

  async assertPaidPlanForUser(userId: string, tenantId: string, planKey: PlanKey): Promise<void> {
    if (!isPaidPlanKey(planKey)) return;
    const required = requiredLegalForPlanChange(planKey);
    const ok = await this.hasAllCurrent(userId, tenantId, required);
    if (!ok) {
      throw new ForbiddenException({
        message: "Accept current terms before starting or changing to a paid plan.",
        errorCode: "LEGAL_ACCEPTANCE_REQUIRED",
        required: required.map((d) => ({
          document: d,
          version: LEGAL_CATALOG[d].version,
        })),
      });
    }
  }

  async hasAllCurrent(userId: string, tenantId: string, docs: LegalDocumentId[]): Promise<boolean> {
    for (const doc of docs) {
      const version = LEGAL_CATALOG[doc].version;
      const row = await this.prisma.legalAcceptance.findFirst({
        where: { userId, tenantId, document: doc, version },
      });
      if (!row) return false;
    }
    return true;
  }

  async recordMany(
    tenantId: string,
    userId: string,
    items: LegalAcceptanceInput[],
    ip?: string | null,
  ): Promise<void> {
    for (const item of items) {
      if (!isLegalDocumentId(item.document)) continue;
      await this.prisma.legalAcceptance.create({
        data: {
          tenantId,
          userId,
          document: item.document,
          version: item.version,
          ip: ip?.trim() || null,
        },
      });
    }
    await this.audit.recordEvent({
      tenantId,
      actorId: userId,
      clinicId: null,
      action: "LEGAL_ACCEPTED",
      resource: "LegalAcceptance",
      resourceId: userId,
      metadata: { documents: items.map((i) => i.document), versions: items.map((i) => i.version) },
    });
  }

  async listPending(userId: string, tenantId: string, required: LegalDocumentId[]) {
    const pending: { document: LegalDocumentId; version: string; titleEn: string; titleAr: string }[] = [];
    for (const doc of required) {
      const version = LEGAL_CATALOG[doc].version;
      const row = await this.prisma.legalAcceptance.findFirst({
        where: { userId, tenantId, document: doc, version },
      });
      if (!row) {
        pending.push({
          document: doc,
          version,
          titleEn: LEGAL_CATALOG[doc].titleEn,
          titleAr: LEGAL_CATALOG[doc].titleAr,
        });
      }
    }
    return pending;
  }

  async statusForUser(userId: string, tenantId: string) {
    const required = [...requiredLegalForPlanChange(PlanKey.PRO)];
    const pending = await this.listPending(userId, tenantId, required);
    return {
      packVersion: LEGAL_CATALOG.terms_of_service.version,
      pending,
      satisfied: pending.length === 0,
    };
  }
}