import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { KiorlyInvoicesService } from "../billing-platform/kiorly-invoices.service";
import { KiorlyPaymentMethodsService } from "../billing-platform/kiorly-payment-methods.service";
import { KiorlyPaymentService } from "../billing-platform/kiorly-payment.service";
import { PaymentGatewayRegistry } from "../billing-platform/payment-gateways/payment-gateway.registry";
import { SettlementService } from "../billing-platform/settlement.service";
import type { PrismaService } from "../prisma/prisma.service";
import { KiorexImpactService } from "./kiorex-impact.service";

const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

describe("RP-03 Kiorex impact integration", () => {
  let tenantId: string;
  let owner: JwtUser;
  let impact: KiorexImpactService;

  before(async () => {
    await prisma.$connect();
    const clinic = await prisma.clinic.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    tenantId = clinic.tenantId;
    const user = await prisma.user.findFirstOrThrow({
      where: { tenantId, isTenantOwner: true },
      select: { id: true, role: true, additionalRoles: true, email: true },
    });
    owner = {
      userId: user.id,
      tenantId,
      email: user.email,
      role: user.role,
      roles: [user.role, ...user.additionalRoles],
    } as JwtUser;

    const creditWallet = new CreditWalletService(prismaSvc);
    const gateways = new PaymentGatewayRegistry();
    const paymentMethods = new KiorlyPaymentMethodsService(prismaSvc, gateways);
    const kiorlyPayments = new KiorlyPaymentService(
      prismaSvc,
      gateways,
      paymentMethods,
      { reconcileAfterPayment: async () => {} } as never,
      { tryOnInvoiceFullyPaid: async () => {} } as never,
    );
    const settlement = new SettlementService(
      prismaSvc,
      new KiorlyInvoicesService(prismaSvc, creditWallet, kiorlyPayments),
    );
    impact = new KiorexImpactService(prismaSvc, settlement);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("report offset matches CR-11 statement offset for current period", async () => {
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const report = await impact.report(tenantId, period, owner);
    assert.equal(report.periodKey, period);
    assert.equal(typeof report.bookings, "number");
    assert.equal(typeof report.commission, "number");
    assert.equal(typeof report.offset, "number");
    assert.equal(report.statementOffset, report.offset);
    assert.ok(report.matchesStatement === true || report.commission === 0);
  });
});
