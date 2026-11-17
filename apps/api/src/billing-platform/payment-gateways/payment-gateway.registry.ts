import { Injectable } from "@nestjs/common";
import type { KiorlyPaymentProviderKey, PaymentGateway } from "./payment-gateway.interface";
import { BankTransferGateway } from "./bank.gateway";
import { FawryGateway } from "./fawry.gateway";
import { InstaPayGateway } from "./instapay.gateway";
import { PaymobGateway } from "./paymob.gateway";

@Injectable()
export class PaymentGatewayRegistry {
  private readonly map = new Map<KiorlyPaymentProviderKey, PaymentGateway>();

  constructor() {
    for (const gateway of [new PaymobGateway(), new FawryGateway(), new InstaPayGateway(), new BankTransferGateway()]) {
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