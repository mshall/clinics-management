import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  CommissionChargeStatus,
  EmploymentType,
  FeeType,
  Gender,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PrismaService } from "../prisma/prisma.service";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService } from "./kiorly-payment.service";
import { STATEMENT_READY_TOPIC } from "./monthly-statement";
import { MonthlyStatementService } from "./monthly-statement.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { settlePeriod } from "./settlement-calculator";
import { SettlementService } from "./settlement.service";
import { baseSettlementInput, EDGE_CASE_MATRIX, SECTION_04_MATRIX } from "./settlement-test-matrix";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("CR-11 monthly statements (persisted invoices)", () => {
  const suffix = `cr11-${Date.now()}`;
  let tenantId: string;
  let ownerId: string;
  let invoices: KiorlyInvoicesService;
  let settlement: SettlementService;
  let statements: MonthlyStatementService;
  const flowPeriod = "2028-03";

  before(async () => {
    await prisma.$connect();
    const prismaSvc = prisma as unknown as PrismaService;
    const creditWallet = new CreditWalletService(prismaSvc);
    const gateways = new PaymentGatewayRegistry();
    const paymentMethods = new KiorlyPaymentMethodsService(prismaSvc, gateways);
    const kiorlyPayments = new KiorlyPaymentService(prismaSvc, gateways, paymentMethods, {
      reconcileAfterPayment: async () => {},
    } as unknown as import("../subscriptions/dunning.service").DunningService, {
      tryOnInvoiceFullyPaid: async () => {},
    } as unknown as import("../growth/referral-reward.service").ReferralRewardService);
    invoices = new KiorlyInvoicesService(prismaSvc, creditWallet, kiorlyPayments);
    settlement = new SettlementService(prismaSvc, invoices);
    statements = new MonthlyStatementService(prismaSvc, settlement);

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const price = await prisma.planPrice.findFirst({
      where: { planId: plan.id, marketId: market.id, validTo: null },
    });

    const tenant = await prisma.tenant.create({
      data: { name: `CR11 ${suffix}`, deploymentCell: "frankfurt", marketId: market.id, baseCurrency: "EGP" },
    });
    tenantId = tenant.id;

    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Clinic",
        nameAr: "عيادة",
        country: market.code,
        city: "City",
        addressEn: "St",
        addressAr: "شارع",
        locationUrl: "https://maps.example/c",
        phone: "+201000000011",
        email: `cr11-${suffix}@test.com`,
        licenseNumber: "SELF-SERVE-PENDING",
        defaultCurrency: "EGP",
      },
    });

    const owner = await prisma.user.create({
      data: {
        tenantId,
        email: `owner-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Owner",
        role: "GROUP_ADMIN",
        isTenantOwner: true,
      },
    });
    ownerId = owner.id;
    await prisma.employee.create({
      data: {
        tenantId,
        clinicId: clinic.id,
        employeeNumber: `E-${suffix}`,
        firstNameEn: "Owner",
        lastNameEn: "One",
        phone: "+201000000012",
        jobTitle: "Owner",
        employmentType: EmploymentType.FULL_TIME,
        hireDate: new Date("2027-01-01"),
        salaryBase: 0,
        userId: owner.id,
      },
    });
    const doctor = await prisma.user.create({
      data: {
        tenantId,
        email: `doc-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Dr Sara",
        role: "PHYSICIAN",
      },
    });

    await prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        planPriceId: price?.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date("2028-03-01"),
        currentPeriodEnd: new Date("2028-04-01"),
      },
    });

    let rate = await prisma.kiorexCommissionRate.findFirst({ where: { marketId: market.id } });
    if (!rate) {
      rate = await prisma.kiorexCommissionRate.create({
        data: { marketId: market.id, feeType: FeeType.FLAT, amount: 1200, validFrom: new Date("2020-01-01") },
      });
    }

    for (const [idx, who] of [
      ["Nadia", "Kamal", "2028-03-05T09:00:00Z"],
      ["Omar", "Saleh", "2028-03-18T11:00:00Z"],
    ].entries()) {
      const patient = await prisma.patient.create({
        data: {
          tenantId,
          mrn: `MRN11-${idx}-${suffix}`,
          firstNameEn: who[0]!,
          lastNameEn: who[1]!,
          gender: Gender.UNKNOWN,
          phone: `+2011${idx}${String(Date.now()).slice(-7)}`,
          nationalId: `id11-${idx}-${suffix}`,
        },
      });
      const apt = await prisma.appointment.create({
        data: {
          tenantId,
          clinicId: clinic.id,
          patientId: patient.id,
          clinicianId: doctor.id,
          startsAt: new Date(who[2]!),
          feeAmount: 300,
          checkedInAt: new Date(who[2]!),
        },
      });
      await prisma.kiorexCommissionCharge.create({
        data: {
          tenantId,
          clinicId: clinic.id,
          appointmentId: apt.id,
          patientId: patient.id,
          clinicianId: doctor.id,
          rateId: rate.id,
          amount: idx === 0 ? 700 : 600,
          currency: "EGP",
          status: CommissionChargeStatus.CONFIRMED,
          attendedAt: new Date(who[2]!),
          disputeDeadline: new Date("2028-04-30"),
        },
      });
    }
  });

  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const cases = [...SECTION_04_MATRIX, ...EDGE_CASE_MATRIX];
  cases.forEach((matrixCase, idx) => {
    it(`statement totals equal persisted invoice totals — ${matrixCase.id} ${matrixCase.note}`, async () => {
      const periodKey = `${2040 + Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
      const input = baseSettlementInput({ ...matrixCase.overrides, periodKey });
      const result = settlePeriod(input);
      if (result.lines.length === 0) {
        assert.equal(result.summary.skippedBelowMinimum, true);
        return;
      }
      const [y, m] = periodKey.split("-").map(Number);
      const draft = await invoices.createDraft(tenantId, {
        periodKey,
        periodStart: new Date(Date.UTC(y!, m! - 1, 1)),
        periodEnd: new Date(Date.UTC(y!, m!, 1)),
        currency: input.currency,
        creditsApplied: result.creditsApplied,
        lines: result.lines,
        taxRatePercent: input.taxRatePercent,
      });
      assert.equal(Number(draft.total), result.total, "persisted invoice total matches calculator");

      const st = await statements.getForPeriod(tenantId, periodKey);
      assert.equal(st.invoice?.id, draft.id);
      assert.equal(st.total, draft.total);
      assert.equal(st.subtotal, draft.subtotal);
      assert.equal(st.vat, draft.tax);
      assert.equal(st.creditsUsed, draft.creditsApplied);
      assert.equal(st.amountDue, draft.amountDue);
      assert.equal(Number(st.total), matrixCase.expectedTotal);
      assert.equal(st.reconciles, true);
    });
  });

  it("settled period lists Kiorex patients (date, doctor, initials, fee) and matches the invoice", async () => {
    const out = await settlement.settlePeriod(tenantId, flowPeriod, { dryRun: false });
    assert.ok(out.invoiceId);
    const invoice = await prisma.kiorlyInvoice.findUniqueOrThrow({ where: { id: out.invoiceId } });

    const st = await statements.getForPeriod(tenantId, flowPeriod);
    assert.equal(st.preview, false);
    assert.equal(st.total, invoice.total.toFixed(2));
    assert.equal(st.subtotal, invoice.subtotal.toFixed(2));
    assert.equal(st.vat, invoice.tax.toFixed(2));
    assert.equal(st.reconciles, true);
    assert.equal(st.kiorexPatientCount, 2);
    assert.deepEqual(
      st.kiorexPatients.map((p) => [p.attendedAt.slice(0, 10), p.doctorName, p.patientInitials, p.fee]),
      [
        ["2028-03-05", "Dr Sara", "NK", "700.00"],
        ["2028-03-18", "Dr Sara", "OS", "600.00"],
      ],
    );
    assert.equal(st.commissionTotal, "1300.00");
    assert.ok(st.explanationEn && st.explanationAr);
  });

  it("issuing the invoice enqueues statement delivery on email and WhatsApp via the outbox", async () => {
    const invoice = await prisma.kiorlyInvoice.findUniqueOrThrow({
      where: { tenantId_periodKey: { tenantId, periodKey: flowPeriod } },
    });
    await invoices.issue(tenantId, invoice.id, ownerId);
    const events = await prisma.outboxEvent.findMany({
      where: { tenantId, type: STATEMENT_READY_TOPIC, aggregateId: invoice.id },
    });
    const channels = events.map((e) => (e.payload as Record<string, unknown>).channel).sort();
    assert.deepEqual(channels, ["WHATSAPP", "email"]);
    for (const e of events) {
      const payload = e.payload as Record<string, unknown>;
      assert.equal(e.target, "INTERNAL");
      assert.equal(payload.periodKey, flowPeriod);
      assert.equal(payload.statementPath, `/api/v1/billing/statements/${flowPeriod}?format=pdf`);
      assert.equal(JSON.stringify(payload).includes("Nadia"), false, "no PHI in outbox payload");
    }
    const email = events.find((e) => (e.payload as Record<string, unknown>).channel === "email")!;
    assert.equal((email.payload as Record<string, unknown>).to, `owner-${suffix}@test.com`);
  });

  it("serves the bilingual PDF and lists statements for the owner only", async () => {
    const user = { userId: ownerId, tenantId } as unknown as JwtUser;
    const { pdf, filename } = await statements.renderPdfForTenant(user, tenantId, flowPeriod);
    assert.equal(filename, `kiorly-statement-${flowPeriod}.pdf`);
    const text = pdf.toString("latin1");
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.match(text, /\/Count 2/);

    const list = await statements.listForTenant(user, tenantId);
    assert.ok(list.items.some((i) => i.periodKey === flowPeriod && i.status === "ISSUED"));

    const stranger = { userId: "x", tenantId: "other-tenant" } as unknown as JwtUser;
    await assert.rejects(() => statements.getForTenant(stranger, tenantId, flowPeriod), { status: 403 });
    await assert.rejects(() => statements.getForTenant(user, tenantId, "2028-13"), { status: 400 });
  });

  it("period without an invoice returns a dry-run preview statement", async () => {
    const st = await statements.getForPeriod(tenantId, "2028-05");
    assert.equal(st.preview, true);
    assert.equal(st.invoice, null);
    assert.equal(st.reconciles, true);
  });
});
