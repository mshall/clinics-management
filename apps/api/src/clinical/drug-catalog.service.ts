import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";

export type DrugSearchHit = {
  id: string;
  brandNameEn: string;
  brandNameAr: string | null;
  form: string;
  strength: string | null;
  pack: string | null;
  manufacturer: string | null;
  registrationNo: string | null;
  defaultSigEn: string | null;
  defaultSigAr: string | null;
  instructionPhrases: unknown;
  ingredients: { nameEn: string; nameAr: string | null; strength: string | null }[];
  rankScore?: number;
};

@Injectable()
export class DrugCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveMarketIdForTenant(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { marketId: true, market: { select: { id: true, code: true } } },
    });
    const marketId = tenant?.marketId ?? tenant?.market?.id;
    if (!marketId) throw new NotFoundException("Organization has no market for drug catalog");
    return marketId;
  }

  async searchProducts(
    tenantId: string,
    user: JwtUser,
    q: string,
    limit = 20,
  ): Promise<DrugSearchHit[]> {
    const term = q.normalize("NFKC").trim();
    if (term.length < 1) return [];
    const marketId = await this.resolveMarketIdForTenant(tenantId);
    const take = Math.min(Math.max(limit, 1), 40);
    const clinicianId = user.userId;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        brandNameEn: string;
        brandNameAr: string | null;
        form: string;
        strength: string | null;
        pack: string | null;
        manufacturer: string | null;
        registrationNo: string | null;
        defaultSigEn: string | null;
        defaultSigAr: string | null;
        instructionPhrases: Prisma.JsonValue;
        rank_score: number;
      }>
    >`
      SELECT
        dp.id,
        dp."brandNameEn",
        dp."brandNameAr",
        dp.form,
        dp.strength,
        dp.pack,
        dp.manufacturer,
        dp."registrationNo",
        dp."defaultSigEn",
        dp."defaultSigAr",
        dp."instructionPhrases",
        (
          COALESCE(cdu."useCount", 0) * 10
          + GREATEST(
            similarity(lower(dp."brandNameEn"), lower(${term})),
            similarity(lower(COALESCE(dp."brandNameAr", '')), lower(${term}))
          )
          + CASE WHEN lower(dp."brandNameEn") LIKE lower(${term}) || '%' THEN 2 ELSE 0 END
          + CASE WHEN lower(COALESCE(dp."brandNameAr", '')) LIKE lower(${term}) || '%' THEN 2 ELSE 0 END
        ) AS rank_score
      FROM "DrugProduct" dp
      LEFT JOIN "ClinicianDrugProductUsage" cdu
        ON cdu."drugProductId" = dp.id
       AND cdu."tenantId" = ${tenantId}
       AND cdu."clinicianId" = ${clinicianId}
      WHERE dp."marketId" = ${marketId}
        AND dp."isActive" = true
        AND (
          lower(dp."brandNameEn") LIKE lower(${term}) || '%'
          OR lower(COALESCE(dp."brandNameAr", '')) LIKE lower(${term}) || '%'
          OR similarity(lower(dp."brandNameEn"), lower(${term})) > 0.25
          OR similarity(lower(COALESCE(dp."brandNameAr", '')), lower(${term})) > 0.25
        )
      ORDER BY rank_score DESC, dp."brandNameEn" ASC
      LIMIT ${take}
    `;

    const ids = rows.map((r) => r.id);
    if (!ids.length) return [];

    const ingredientRows = await this.prisma.drugProductIngredient.findMany({
      where: { productId: { in: ids } },
      include: { ingredient: true },
    });
    const byProduct = new Map<string, DrugSearchHit["ingredients"]>();
    for (const row of ingredientRows) {
      const list = byProduct.get(row.productId) ?? [];
      list.push({
        nameEn: row.ingredient.nameEn,
        nameAr: row.ingredient.nameAr,
        strength: row.strength,
      });
      byProduct.set(row.productId, list);
    }

    return rows.map((r) => ({
      id: r.id,
      brandNameEn: r.brandNameEn,
      brandNameAr: r.brandNameAr,
      form: r.form,
      strength: r.strength,
      pack: r.pack,
      manufacturer: r.manufacturer,
      registrationNo: r.registrationNo,
      defaultSigEn: r.defaultSigEn,
      defaultSigAr: r.defaultSigAr,
      instructionPhrases: r.instructionPhrases,
      ingredients: byProduct.get(r.id) ?? [],
      rankScore: Number(r.rank_score),
    }));
  }

  async recordClinicianUsage(tenantId: string, clinicianId: string, drugProductId: string): Promise<void> {
    await this.prisma.clinicianDrugProductUsage.upsert({
      where: {
        tenantId_clinicianId_drugProductId: { tenantId, clinicianId, drugProductId },
      },
      create: { tenantId, clinicianId, drugProductId, useCount: 1 },
      update: { useCount: { increment: 1 } },
    });
  }

  formatPrintedDrugName(hit: Pick<DrugSearchHit, "brandNameEn" | "form" | "strength" | "pack">): string {
    const parts = [hit.brandNameEn.trim()];
    if (hit.strength?.trim()) parts.push(hit.strength.trim());
    if (hit.form?.trim()) parts.push(hit.form.trim());
    if (hit.pack?.trim()) parts.push(hit.pack.trim());
    return parts.join(" ");
  }
}