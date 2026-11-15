import { PaymentMethod, type VisitCollectionMode } from "@prisma/client";
import type { OrganizationPaymentChannelDto } from "../markets/tenant-payment-channel-merge";
import type { MarketPaymentMethodDef } from "../markets/market-payment-methods";
import { paymentMethodForTransferChannel } from "../markets/market-payment-methods";

export type FiscalPaymentMethodContext = {
  collectionMode?: VisitCollectionMode | null;
  transferChannel?: string | null;
  /** From billing payment allocations (CASH, CARD, TRANSFER, …). */
  billingMethods?: PaymentMethod[];
};

const ETA_CODES = new Set(["C", "V", "O"]);

function orgChannelFiscalCode(
  channel: string,
  orgChannels: OrganizationPaymentChannelDto[],
): string | undefined {
  const key = channel.trim().toUpperCase();
  const row = orgChannels.find((c) => c.channelKey.toUpperCase() === key);
  const code = row?.fiscalPaymentCode?.trim().toUpperCase();
  return code && ETA_CODES.has(code) ? code : undefined;
}

function marketChannelFiscalCode(channel: string, methods: MarketPaymentMethodDef[]): string | undefined {
  const def = paymentMethodForTransferChannel(methods, channel);
  const code = (def as MarketPaymentMethodDef & { fiscalPaymentCode?: string })?.fiscalPaymentCode?.trim().toUpperCase();
  return code && ETA_CODES.has(code) ? code : undefined;
}

/** ETA payment method code (C = cash, V = visa/card, O = other / transfer). */
export function resolveFiscalPaymentMethodCode(
  ctx: FiscalPaymentMethodContext,
  methods: MarketPaymentMethodDef[] = [],
  orgChannels: OrganizationPaymentChannelDto[] = [],
): string {
  const methodsList = ctx.billingMethods ?? [];
  if (methodsList.length > 0) {
    if (methodsList.includes(PaymentMethod.CARD)) return "V";
    if (methodsList.includes(PaymentMethod.TRANSFER) || methodsList.includes(PaymentMethod.WALLET)) {
      const ch = ctx.transferChannel?.trim();
      if (ch) {
        return (
          orgChannelFiscalCode(ch, orgChannels) ?? marketChannelFiscalCode(ch, methods) ?? "O"
        );
      }
      return "O";
    }
    return "C";
  }

  const ch = ctx.transferChannel?.trim();
  if (ch) {
    return orgChannelFiscalCode(ch, orgChannels) ?? marketChannelFiscalCode(ch, methods) ?? "O";
  }
  if (ctx.collectionMode === "CASH_ON_VISIT") return "C";
  return "C";
}

/** @deprecated use resolveFiscalPaymentMethodCode */
export function paymentMethodFromCollection(
  mode?: VisitCollectionMode | null,
  transferChannel?: string | null,
): string {
  return resolveFiscalPaymentMethodCode({ collectionMode: mode, transferChannel });
}