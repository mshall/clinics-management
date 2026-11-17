import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KiorlyPaymentMethodKind, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentGatewayRegistry } from "./payment-gateways/payment-gateway.registry";
import { assertNoPanOrCvvInBody } from "./kiorly-payment-no-pan";

@Injectable()
export class KiorlyPaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  async createCardSession(user: JwtUser, tenantId: string, body: { returnUrl: string }) {
    if (user.tenantId !== tenantId) throw new BadRequestException();
    assertNoPanOrCvvInBody(body);
    const gateway = this.gateways.get("paymob");
    if (!gateway) throw new BadRequestException("Card payments are not configured");
    return gateway.createCardSession({
      tenantId,
      returnUrl: body.returnUrl.trim(),
      customerEmail: user.email,
    });
  }

  async saveTokenizedCard(
    tenantId: string,
    data: {
      tokenRef: string;
      brand?: string;
      last4?: string;
      expMonth?: number;
      expYear?: number;
      setDefault?: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (data.setDefault !== false) {
        await tx.kiorlyPaymentMethod.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const method = await tx.kiorlyPaymentMethod.create({
        data: {
          tenantId,
          provider: "paymob",
          kind: KiorlyPaymentMethodKind.CARD_TOKEN,
          tokenRef: data.tokenRef,
          brand: data.brand ?? null,
          last4: data.last4 ?? null,
          expMonth: data.expMonth ?? null,
          expYear: data.expYear ?? null,
          isDefault: data.setDefault !== false,
        },
      });
      await tx.subscription.updateMany({
        where: { tenantId },
        data: { defaultPaymentMethodId: method.id },
      });
      return method;
    });
  }

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.kiorlyPaymentMethod.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      kind: r.kind,
      brand: r.brand,
      last4: r.last4,
      expMonth: r.expMonth,
      expYear: r.expYear,
      isDefault: r.isDefault,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getDefaultCardToken(tenantId: string): Promise<{ methodId: string; tokenRef: string } | null> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: { defaultPaymentMethodId: true },
    });
    if (!sub?.defaultPaymentMethodId) {
      const fallback = await this.prisma.kiorlyPaymentMethod.findFirst({
        where: { tenantId, kind: KiorlyPaymentMethodKind.CARD_TOKEN, isDefault: true },
      });
      if (!fallback?.tokenRef) return null;
      return { methodId: fallback.id, tokenRef: fallback.tokenRef };
    }
    const method = await this.prisma.kiorlyPaymentMethod.findUnique({
      where: { id: sub.defaultPaymentMethodId },
    });
    if (!method?.tokenRef) throw new NotFoundException("Default payment method not found");
    return { methodId: method.id, tokenRef: method.tokenRef };
  }
}