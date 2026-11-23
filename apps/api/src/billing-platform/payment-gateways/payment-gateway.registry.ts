import { Injectable } from "@nestjs/common";
import type { KiorlyPaymentProviderKey, PaymentGateway } from "./payment-gateway.interface";
import { BankTransferGateway } from "./bank.gateway";
import { FawryGateway } from "./fawry.gateway";
import { InstaPayGateway } from "./instapay.gateway";
import { PaymobGateway } from "./paymob.gateway";
import { HttpPspGateway } from "./http-psp.gateway";
import { isMock } from "../../common/provider-mode";

@Injectable()
export class PaymentGatewayRegistry {
  private readonly map = new Map<KiorlyPaymentProviderKey, PaymentGateway>();

  constructor() {
    // PSP mode real: the card/link providers speak the neutral HTTP contract (PSP_* env). Manual flows stay manual.
    const card: PaymentGateway[] = isMock("psp")
      ? [new PaymobGateway(), new FawryGateway()]
      : [new HttpPspGateway("paymob"), new HttpPspGateway("fawry")];
    for (const gateway of [...card, new InstaPayGateway(), new BankTransferGateway()]) {
      this.map.set(gateway.key, gateway);
    }
  }

  get(key: string): PaymentGateway | null {
    return this.map.get(key as KiorlyPaymentProviderKey) ?? null;
  }

  listKeys(): KiorlyPaymentProviderKey[] {
    return [...this.map.keys()];
  }
}