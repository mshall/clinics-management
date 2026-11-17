import type { PrismaClient } from "@prisma/client";

const DEMO_SOURCE = {
  sourceName: "Kiorly curated demo subset (CL-01)",
  sourceLicense:
    "Demo seed only — not for production clinical decisions. Replace with a licensed Egyptian drug database before go-live.",
  versionLabel: "eg-demo-1",
};

const CORE_PRODUCTS = [
  {
    brandNameEn: "Augmentin",
    brandNameAr: "أوجمنتين",
    form: "tablet",
    strength: "1 g",
    pack: "14 tabs",
    manufacturer: "GSK",
    registrationNo: "DEMO-AUG-1G",
    defaultSigEn: "1 tablet every 12 hours for 7 days",
    defaultSigAr: "قرص واحد كل ١٢ ساعة لمدة ٧ أيام",
    instructionPhrases: [
      { en: "Take with meals", ar: "يُؤخذ مع الطعام" },
      { en: "Complete the full course", ar: "أكمل الجرعة كاملة" },
    ],
    ingredients: [
      { nameEn: "amoxicillin", nameAr: "أموكسيسيلين", strength: "875 mg" },
      { nameEn: "clavulanic acid", nameAr: "حمض الكلافيولانيك", strength: "125 mg" },
    ],
  },
  {
    brandNameEn: "Panadol",
    brandNameAr: "بنادول",
    form: "tablet",
    strength: "500 mg",
    defaultSigEn: "1-2 tablets every 6 hours as needed",
    defaultSigAr: "١-٢ قرص كل ٦ ساعات عند الحاجة",
    ingredients: [{ nameEn: "paracetamol", nameAr: "باراسيتامول" }],
  },
  {
    brandNameEn: "Brufen",
    brandNameAr: "بروفين",
    form: "tablet",
    strength: "400 mg",
    ingredients: [{ nameEn: "ibuprofen", nameAr: "إيبوبروفين" }],
  },
];

/** Idempotent demo catalog for Egypt market — includes bulk rows for search perf tests. */
export async function ensureEgyptDrugCatalog(prisma: PrismaClient): Promise<void> {
  const market = await prisma.market.findFirst({ where: { code: "EG" } });
  if (!market) return;

  const existing = await prisma.drugDatasetVersion.findFirst({
    where: { marketId: market.id, versionLabel: DEMO_SOURCE.versionLabel, isActive: true },
  });
  if (existing && existing.productCount > 100) return;

  const version = await prisma.drugDatasetVersion.upsert({
    where: { marketId_versionLabel: { marketId: market.id, versionLabel: DEMO_SOURCE.versionLabel } },
    create: {
      marketId: market.id,
      versionLabel: DEMO_SOURCE.versionLabel,
      sourceName: DEMO_SOURCE.sourceName,
      sourceLicense: DEMO_SOURCE.sourceLicense,
      isActive: true,
      productCount: 0,
    },
    update: { isActive: true, sourceName: DEMO_SOURCE.sourceName, sourceLicense: DEMO_SOURCE.sourceLicense },
  });

  const products = [...CORE_PRODUCTS];
  for (let i = 1; i <= 650; i += 1) {
    products.push({
      brandNameEn: `PharmaBrand-${String(i).padStart(4, "0")}`,
      brandNameAr: `دواء-${i}`,
      form: i % 3 === 0 ? "syrup" : "tablet",
      strength: `${(i % 50) + 50} mg`,
      pack: "20 units",
      manufacturer: "Demo Pharma",
      registrationNo: `DEMO-REG-${i}`,
      defaultSigEn: "As directed",
      defaultSigAr: "حسب التوجيهات",
      ingredients: [{ nameEn: `demo-ingredient-${i % 40}`, nameAr: `مادة-${i % 40}` }],
    });
  }

  let count = 0;
  for (const p of products) {
    const exists = await prisma.drugProduct.findFirst({
      where: { marketId: market.id, brandNameEn: p.brandNameEn, datasetVersionId: version.id },
    });
    if (exists) {
      count += 1;
      continue;
    }

    const ingredientLinks: { ingredientId: string; strength: string | null }[] = [];
    for (const ing of p.ingredients) {
      const row = await prisma.activeIngredient.upsert({
        where: { nameEn: ing.nameEn },
        create: { nameEn: ing.nameEn, nameAr: ing.nameAr ?? null },
        update: { nameAr: ing.nameAr ?? undefined },
      });
      ingredientLinks.push({ ingredientId: row.id, strength: ing.strength ?? null });
    }

    const product = await prisma.drugProduct.create({
      data: {
        marketId: market.id,
        datasetVersionId: version.id,
        brandNameEn: p.brandNameEn,
        brandNameAr: p.brandNameAr ?? null,
        form: p.form,
        strength: p.strength ?? null,
        pack: p.pack ?? null,
        manufacturer: p.manufacturer ?? null,
        registrationNo: p.registrationNo ?? null,
        defaultSigEn: p.defaultSigEn ?? null,
        defaultSigAr: p.defaultSigAr ?? null,
        instructionPhrases: p.instructionPhrases ?? [],
        isActive: true,
      },
    });
    await prisma.drugProductIngredient.createMany({
      data: ingredientLinks.map((l) => ({
        productId: product.id,
        ingredientId: l.ingredientId,
        strength: l.strength,
      })),
    });
    count += 1;
  }

  await prisma.drugDatasetVersion.update({
    where: { id: version.id },
    data: { productCount: count },
  });
}