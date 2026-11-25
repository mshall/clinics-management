import { Injectable } from "@nestjs/common";
import type { KiorlyPaymentProviderKey, PaymentGateway } from "./payment-gateway.interface";
import { BankTransferGateway } from "./bank.gateway";
import { FawryGateway } from "./fawry.gateway";
import { InstaPayGateway } from "./instapay.gateway";
import { PaymobGateway } from "./paymob.gateway";
import { HttpPspGateway } from "./http-psp.gateway";
import { isMock } from "../../common/provider-mode";
import { enabledPsps, pspVendor } from "../../common/provider-env";
import { gatewayAsPayAdapter } from "./pay-contract-bridge";
import type { PayAdapter } from "@kiorex/pay-contract";
import { FawryVendorGateway, PaymobVendorGateway } from "./vendor-psp.gateways";

@Injectable()
export class PaymentGatewayRegistry {
  private readonly map = new Map<KiorlyPaymentProviderKey, PaymentGateway>();

  constructor() {
    // PSP mode real: the card/link providers speak the neutral HTTP contract (PSP_* env). Manual flows stay manual.
    // PAYMENT_PROVIDER=vendor: the native Paymob / FawryPay clients (PAYMENT_ENABLED_PSPS limits which exist; a disabled one answers "not available").
    const card: PaymentGateway[] = isMock("psp")
      ? [new PaymobGateway(), new FawryGateway()]
      : pspVendor() === "vendor"
        ? enabledPsps().map((p) => (p === "paymob" ? new PaymobVendorGateway() : new FawryVendorGateway()))
        : [new HttpPspGateway("paymob"), new HttpPspGateway("fawry")];
    for (const gateway of [...card, new InstaPayGateway(), new BankTransferGateway()]) {
      this.map.set(gateway.key, gateway);
    }
  }

  get(key: string): PaymentGateway | null {
    return this.map.get(key as KiorlyPaymentProviderKey) ?? null;
  }

  /** The same gateway as a shared Kiorly Pay adapter (@kiorex/pay-contract). */
  getPayAdapter(key: string): PayAdapter | null {
    const g = this.get(key);
    return g ? gatewayAsPayAdapter(g) : null;
  }

  listKeys(): KiorlyPaymentProviderKey[] {
    return [...this.map.keys()];
  }
}