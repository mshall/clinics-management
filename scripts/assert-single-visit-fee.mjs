#!/usr/bin/env node
/**
 * Assert exactly one posted visit charge and one sale fiscal submission per appointment.
 * Usage: node scripts/assert-single-visit-fee.mjs <appointmentId>
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RevenueStatus } from "@prisma/client";

const appointmentId = process.argv[2]?.trim();
if (!appointmentId) {
  console.error("usage: assert-single-visit-fee.mjs <appointmentId>");
  process.exit(1);
}

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
const dbSchema = dbUrl.searchParams.get("schema") ?? undefined;
for (const p of ["schema", "connection_limit", "pool_timeout", "connect_timeout"]) dbUrl.searchParams.delete(p);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: dbUrl.toString() }, dbSchema ? { schema: dbSchema } : undefined),
});
try {
  const revenue = await prisma.revenueEntry.findMany({
    where: {
      appointmentId,
      status: RevenueStatus.POSTED,
      category: { in: ["VISIT", "VISIT_FEE"] },
    },
    select: { id: true, category: true, grossAmount: true, encounterId: true },
  });

  if (revenue.length !== 1) {
    console.error(
      JSON.stringify({
        ok: false,
        reason: "expected exactly one POSTED VISIT/VISIT_FEE revenue row",
        count: revenue.length,
        rows: revenue,
      }),
    );
    process.exit(1);
  }

  const fiscalDocs = await prisma.fiscalDocument.findMany({
    where: { revenueEntryId: revenue[0].id },
    select: { id: true, submission: { select: { id: true, status: true } } },
  });

  if (fiscalDocs.length > 1) {
    console.error(
      JSON.stringify({
        ok: false,
        reason: "expected at most one fiscal document for visit revenue",
        revenueId: revenue[0].id,
        fiscalDocuments: fiscalDocs,
      }),
    );
    process.exit(1);
  }

  const fiscalSubmissionId = fiscalDocs[0]?.submission?.id ?? null;
  if (fiscalDocs.length === 1 && !fiscalSubmissionId) {
    console.error(
      JSON.stringify({
        ok: false,
        reason: "fiscal document without submission",
        revenueId: revenue[0].id,
        fiscalDocuments: fiscalDocs,
      }),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      ok: true,
      revenueId: revenue[0].id,
      fiscalDocumentCount: fiscalDocs.length,
      fiscalSubmissionId,
    }),
  );
} finally {
  await prisma.$disconnect();
}