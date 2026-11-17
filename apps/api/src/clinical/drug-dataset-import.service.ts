import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";

export type DrugImportProduct = {
  brandNameEn: string;
  brandNameAr?: string;
  form: string;
  strength?: string;
  pack?: string;
  manufacturer?: string;
  registrationNo?: string;
  defaultSigEn?: string;
  defaultSigAr?: string;
  instructionPhrases?: { en: string; ar?: string }[];
  ingredients: { nameEn: string; nameAr?: string; atcCode?: string; strength?: string }[];
};

export type DrugDatasetImportPayload = {
  marketCode: string;
  versionLabel: string;
  sourceName: string;
  sourceLicense?: string;
  products: DrugImportProduct[];
};

@Injectable()
export class DrugDatasetImportService {
  constructor(private readonly prisma: PrismaService) {}

  assertPlatformImport(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can import drug datasets");
    }
  }

  async importDataset(user: JwtUser, body: DrugDatasetImportPayload) {
    this.assertPlatformImport(user);
    const marketCode = body.marketCode?.trim().toUpperCase();
    const versionLabel = body.versionLabel?.trim();
    if (!marketCode || !versionLabel) {
      throw new BadRequestException("marketCode and versionLabel are required");
    }
    if (!Array.isArray(body.products) || body.products.length === 0) {
      throw new BadRequestException("products array is required");
    }

    const market = await this.prisma.market.findFirst({ where: { code: marketCode } });
    if (!market) throw new BadRequestException(`Unknown market ${marketCode}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.drugDatasetVersion.updateMany({
        where: { marketId: market.id, isActive: true },
        data: { isActive: false },
      });
      await tx.drugProduct.updateMany({
        where: { marketId: market.id, isActive: true },
        data: { isActive: false },
      });

      const version = await tx.drugDatasetVersion.create({
        data: {
          marketId: market.id,
          versionLabel,
          sourceName: body.sourceName.trim() || "unspecified",
          sourceLicense: body.sourceLicense?.trim() ?? "",
          importedByUserId: user.userId,
          isActive: true,
          productCount: 0,
        },
      });

      let count = 0;
      for (const p of body.products) {
        const brand = p.brandNameEn?.trim();
        const form = p.form?.trim();
        if (!brand || !form) continue;
        if (!p.ingredients?.length) continue;

        const ingredientLinks: { ingredientId: string; strength: string | null }[] = [];
        for (const ing of p.ingredients) {
          const nameEn = ing.nameEn.trim();
          if (!nameEn) continue;
          const row = await tx.activeIngredient.upsert({
            where: { nameEn },
            create: { nameEn, nameAr: ing.nameAr?.trim() || null, atcCode: ing.atcCode?.trim() || null },
            update: {
              nameAr: ing.nameAr?.trim() || undefined,
              atcCode: ing.atcCode?.trim() || undefined,
            },
          });
          ingredientLinks.push({ ingredientId: row.id, strength: ing.strength?.trim() || null });
        }
        if (!ingredientLinks.length) continue;

        const product = await tx.drugProduct.create({
          data: {
            marketId: market.id,
            datasetVersionId: version.id,
            brandNameEn: brand,
            brandNameAr: p.brandNameAr?.trim() || null,
            form,
            strength: p.strength?.trim() || null,
            pack: p.pack?.trim() || null,
            manufacturer: p.manufacturer?.trim() || null,
            registrationNo: p.registrationNo?.trim() || null,
            defaultSigEn: p.defaultSigEn?.trim() || null,
            defaultSigAr: p.defaultSigAr?.trim() || null,
            instructionPhrases: p.instructionPhrases ?? [],
            isActive: true,
          },
        });
        await tx.drugProductIngredient.createMany({
          data: ingredientLinks.map((l) => ({
            productId: product.id,
            ingredientId: l.ingredientId,
            strength: l.strength,
          })),
        });
        count += 1;
      }

      return tx.drugDatasetVersion.update({
        where: { id: version.id },
        data: { productCount: count },
      });
    });
  }

  async listVersions(user: JwtUser, marketCode?: string) {
    this.assertPlatformImport(user);
    const market = marketCode?.trim()
      ? await this.prisma.market.findFirst({ where: { code: marketCode.trim().toUpperCase() } })
      : null;
    return this.prisma.drugDatasetVersion.findMany({
      where: market ? { marketId: market.id } : undefined,
      orderBy: { importedAt: "desc" },
      take: 20,
    });
  }
}