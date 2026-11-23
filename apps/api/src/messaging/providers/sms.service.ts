import { Injectable } from "@nestjs/common";
import { createSmsProvider } from "./sms.provider";
import type { SmsProvider, SmsSendInput, SmsSendResult } from "./sms.port";

@Injectable()
export class SmsService {
  private provider: SmsProvider = createSmsProvider();

  /** Test seam (Nest must not DI the provider interface). */
  useProvider(p: SmsProvider) {
    this.provider = p;
  }

  /** Re-resolve mock/real from env (tests and the dev inbox "send test" use this). */
  refresh() {
    this.provider = createSmsProvider();
  }

  send(input: SmsSendInput): Promise<SmsSendResult> {
    return this.provider.send(input);
  }
}
